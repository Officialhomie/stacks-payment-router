/**
 * Gas Abstractor
 * Manages gas wallets across chains with automatic rebalancing
 * and real-time gas price monitoring
 */

import { Wallet, ethers, JsonRpcProvider } from 'ethers';
import { RouteStep, Chain } from '@shared/types';
import { CHAIN_CONFIGS } from '@shared/constants/chains';
import { logger } from '@shared/utils/logger';
import { getPriceOracle } from '@shared/utils/priceOracle';
import { db } from '../db';
import { getRedis } from '@shared/utils/redis';
import { DexCalldataProvider } from '../providers/DexCalldataProvider';

// Gas reserve configuration
interface GasReserveConfig {
  minBalanceUSD: number;       // Minimum balance to maintain
  targetBalanceUSD: number;    // Target balance after rebalancing
  alertThresholdUSD: number;   // Alert when below this
  criticalThresholdUSD: number; // Emergency threshold
}

// Chain-specific gas settings
interface ChainGasSettings {
  chainId: number;
  rpcUrl: string;
  nativeToken: string;
  gasReserve: GasReserveConfig;
  priorityFeeMultiplier: number;
  maxGasPriceGwei: number;
}

// Rebalancing transaction
interface RebalanceTransaction {
  id: string;
  fromChain: Chain;
  toChain: Chain;
  amount: string;
  amountUSD: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  txHash?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Gas wallet info
interface GasWalletInfo {
  chain: Chain;
  address: string;
  balance: string;
  balanceUSD: number;
  lastUpdated: Date;
  status: 'healthy' | 'low' | 'critical';
}

const DEFAULT_GAS_RESERVES: Record<Chain, GasReserveConfig> = {
  ethereum: {
    minBalanceUSD: 5000,
    targetBalanceUSD: 10000,
    alertThresholdUSD: 2000,
    criticalThresholdUSD: 500,
  },
  arbitrum: {
    minBalanceUSD: 1000,
    targetBalanceUSD: 3000,
    alertThresholdUSD: 500,
    criticalThresholdUSD: 100,
  },
  base: {
    minBalanceUSD: 1000,
    targetBalanceUSD: 3000,
    alertThresholdUSD: 500,
    criticalThresholdUSD: 100,
  },
  polygon: {
    minBalanceUSD: 500,
    targetBalanceUSD: 1500,
    alertThresholdUSD: 200,
    criticalThresholdUSD: 50,
  },
  optimism: {
    minBalanceUSD: 1000,
    targetBalanceUSD: 3000,
    alertThresholdUSD: 500,
    criticalThresholdUSD: 100,
  },
  stacks: {
    minBalanceUSD: 100,
    targetBalanceUSD: 500,
    alertThresholdUSD: 50,
    criticalThresholdUSD: 10,
  },
  solana: {
    minBalanceUSD: 500,
    targetBalanceUSD: 2000,
    alertThresholdUSD: 200,
    criticalThresholdUSD: 50,
  },
  bitcoin: {
    minBalanceUSD: 1000,
    targetBalanceUSD: 5000,
    alertThresholdUSD: 500,
    criticalThresholdUSD: 100,
  },
};

export class GasAbstractor {
  private gasWallets: Map<Chain, Wallet> = new Map();
  private providers: Map<Chain, JsonRpcProvider> = new Map();
  private gasReserves: Map<Chain, GasReserveConfig> = new Map();
  private balanceCache: Map<Chain, { balance: string; timestamp: number }> = new Map();
  private gasPriceCache: Map<Chain, { price: bigint; timestamp: number }> = new Map();
  private rebalancingInterval?: NodeJS.Timeout;
  private monitoringInterval?: NodeJS.Timeout;
  private isRebalancing: boolean = false;

  constructor() {
    this.initializeWallets();
    this.initializeProviders();
    this.initializeReserves();
  }

  /**
   * Initialize gas wallets from environment
   */
  private initializeWallets(): void {
    // EVM chains use the same wallet (different derived addresses in production)
    const evmPrivateKey = process.env.GAS_WALLET_PRIVATE_KEY || '';
    
    if (evmPrivateKey) {
      const evmChains: Chain[] = ['ethereum', 'arbitrum', 'base', 'polygon', 'optimism'];
      for (const chain of evmChains) {
        try {
          this.gasWallets.set(chain, new Wallet(evmPrivateKey));
        } catch (error) {
          logger.error(`Failed to initialize gas wallet for ${chain}`, { error });
        }
      }
    }

    // Chain-specific wallets (if different keys needed)
    const chainKeys: Partial<Record<Chain, string>> = {
      ethereum: process.env.ETH_GAS_WALLET_PRIVATE_KEY,
      arbitrum: process.env.ARB_GAS_WALLET_PRIVATE_KEY,
      base: process.env.BASE_GAS_WALLET_PRIVATE_KEY,
    };

    for (const [chain, key] of Object.entries(chainKeys)) {
      if (key && !this.gasWallets.has(chain as Chain)) {
        try {
          this.gasWallets.set(chain as Chain, new Wallet(key));
        } catch (error) {
          logger.error(`Failed to initialize gas wallet for ${chain}`, { error });
        }
      }
    }

    logger.info('Gas wallets initialized', {
      chains: Array.from(this.gasWallets.keys()),
    });
  }

  /**
   * Initialize RPC providers
   */
  private initializeProviders(): void {
    const rpcUrls: Partial<Record<Chain, string>> = {
      ethereum: process.env.ETH_RPC_URL,
      arbitrum: process.env.ARB_RPC_URL,
      base: process.env.BASE_RPC_URL,
      polygon: process.env.POLYGON_RPC_URL,
      optimism: process.env.OPTIMISM_RPC_URL,
    };

    for (const [chain, rpcUrl] of Object.entries(rpcUrls)) {
      if (rpcUrl) {
        try {
          this.providers.set(chain as Chain, new JsonRpcProvider(rpcUrl));
        } catch (error) {
          logger.error(`Failed to initialize provider for ${chain}`, { error });
        }
      }
    }
  }

  /**
   * Initialize gas reserves configuration
   */
  private initializeReserves(): void {
    for (const [chain, config] of Object.entries(DEFAULT_GAS_RESERVES)) {
      this.gasReserves.set(chain as Chain, config);
    }

    // Load custom configuration from database
    this.loadReservesFromDB().catch((error) => {
      logger.warn('Failed to load gas reserves from DB, using defaults', { error });
    });
  }

  /**
   * Start automatic monitoring and rebalancing
   */
  startAutomation(): void {
    // Monitor balances every 5 minutes
    this.monitoringInterval = setInterval(async () => {
      await this.monitorAllBalances();
    }, 5 * 60 * 1000);

    // Check for rebalancing every 15 minutes
    this.rebalancingInterval = setInterval(async () => {
      await this.checkAndRebalance();
    }, 15 * 60 * 1000);

    // Initial check
    this.monitorAllBalances().catch((error) => {
      logger.error('Initial balance monitoring failed', { error });
    });

    logger.info('Gas abstractor automation started');
  }

  /**
   * Stop automation
   */
  stopAutomation(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.rebalancingInterval) {
      clearInterval(this.rebalancingInterval);
    }
    logger.info('Gas abstractor automation stopped');
  }

  /**
   * Get gas wallet for a chain
   */
  async getGasWallet(chain: Chain): Promise<Wallet> {
    const wallet = this.gasWallets.get(chain);
    if (!wallet) {
      throw new Error(`No gas wallet configured for chain: ${chain}`);
    }

    // Connect to provider
    const provider = this.providers.get(chain);
    if (provider) {
      return wallet.connect(provider);
    }

    return wallet;
  }

  /**
   * Estimate gas for a route step
   */
  async estimateGas(step: RouteStep): Promise<number> {
    const provider = this.providers.get(step.fromChain);
    if (!provider) {
      // Return default estimates
      return this.getDefaultGasEstimate(step);
    }

    try {
      // Get gas price
      const gasPrice = await this.getGasPrice(step.fromChain);
      
      // Estimate gas units
      const gasUnits = this.estimateGasUnits(step);
      
      // Calculate total in wei
      const totalWei = gasPrice * BigInt(gasUnits);
      
      // Convert to USD
      const priceOracle = getPriceOracle();
      const nativeTokenPrice = await priceOracle.getNativeTokenPrice(step.fromChain);
      const ethAmount = parseFloat(ethers.formatEther(totalWei));
      
      return ethAmount * nativeTokenPrice;
    } catch (error) {
      logger.warn('Gas estimation failed, using default', { chain: step.fromChain, error });
      return this.getDefaultGasEstimate(step);
    }
  }

  /**
   * Get current gas price for a chain
   */
  async getGasPrice(chain: Chain): Promise<bigint> {
    // Check cache (30 second TTL)
    const cached = this.gasPriceCache.get(chain);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.price;
    }

    const provider = this.providers.get(chain);
    if (!provider) {
      return this.getDefaultGasPrice(chain);
    }

    try {
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || this.getDefaultGasPrice(chain);
      
      this.gasPriceCache.set(chain, {
        price: gasPrice,
        timestamp: Date.now(),
      });

      return gasPrice;
    } catch (error) {
      logger.warn('Failed to fetch gas price', { chain, error });
      return this.getDefaultGasPrice(chain);
    }
  }

  /**
   * Get balance for a chain
   */
  async getBalance(chain: Chain): Promise<{ balance: string; balanceUSD: number }> {
    // Check cache (1 minute TTL)
    const cached = this.balanceCache.get(chain);
    if (cached && Date.now() - cached.timestamp < 60000) {
      const priceOracle = getPriceOracle();
      const price = await priceOracle.getNativeTokenPrice(chain);
      return {
        balance: cached.balance,
        balanceUSD: parseFloat(ethers.formatEther(cached.balance)) * price,
      };
    }

    const wallet = this.gasWallets.get(chain);
    const provider = this.providers.get(chain);
    
    if (!wallet || !provider) {
      return { balance: '0', balanceUSD: 0 };
    }

    try {
      const balance = await provider.getBalance(wallet.address);
      const balanceStr = balance.toString();
      
      this.balanceCache.set(chain, {
        balance: balanceStr,
        timestamp: Date.now(),
      });

      const priceOracle = getPriceOracle();
      const price = await priceOracle.getNativeTokenPrice(chain);
      
      return {
        balance: balanceStr,
        balanceUSD: parseFloat(ethers.formatEther(balance)) * price,
      };
    } catch (error) {
      logger.error('Failed to get balance', { chain, error });
      return { balance: '0', balanceUSD: 0 };
    }
  }

  /**
   * Monitor balances across all chains
   */
  async monitorAllBalances(): Promise<GasWalletInfo[]> {
    const walletInfos: GasWalletInfo[] = [];

    for (const chain of this.gasWallets.keys()) {
      try {
        const { balance, balanceUSD } = await this.getBalance(chain);
        const config = this.gasReserves.get(chain);
        
        let status: 'healthy' | 'low' | 'critical' = 'healthy';
        if (config) {
          if (balanceUSD < config.criticalThresholdUSD) {
            status = 'critical';
          } else if (balanceUSD < config.alertThresholdUSD) {
            status = 'low';
          }
        }

        const wallet = this.gasWallets.get(chain)!;
        
        const info: GasWalletInfo = {
          chain,
          address: wallet.address,
          balance,
          balanceUSD,
          lastUpdated: new Date(),
          status,
        };

        walletInfos.push(info);

        // Log alerts
        if (status === 'critical') {
          logger.error('CRITICAL: Gas wallet balance critically low', {
            chain,
            balanceUSD,
            threshold: config?.criticalThresholdUSD,
          });
        } else if (status === 'low') {
          logger.warn('Gas wallet balance low', {
            chain,
            balanceUSD,
            threshold: config?.alertThresholdUSD,
          });
        }

        // Update database
        await this.updateGasReserveDB(chain, balance, balanceUSD, status);
      } catch (error) {
        logger.error('Failed to monitor balance', { chain, error });
      }
    }

    return walletInfos;
  }

  /**
   * Check and perform rebalancing if needed
   */
  async checkAndRebalance(): Promise<void> {
    if (this.isRebalancing) {
      logger.info('Rebalancing already in progress, skipping');
      return;
    }

    this.isRebalancing = true;

    try {
      const walletInfos = await this.monitorAllBalances();
      
      // Find chains needing funds
      const chainsNeedingFunds: { chain: Chain; needed: number }[] = [];
      
      for (const info of walletInfos) {
        const config = this.gasReserves.get(info.chain);
        if (!config) continue;

        if (info.balanceUSD < config.minBalanceUSD) {
          const needed = config.targetBalanceUSD - info.balanceUSD;
          chainsNeedingFunds.push({ chain: info.chain, needed });
        }
      }

      if (chainsNeedingFunds.length === 0) {
        logger.debug('No rebalancing needed');
        return;
      }

      // Find chains with surplus
      const chainsWithSurplus: { chain: Chain; surplus: number }[] = [];
      
      for (const info of walletInfos) {
        const config = this.gasReserves.get(info.chain);
        if (!config) continue;

        if (info.balanceUSD > config.targetBalanceUSD * 1.5) {
          const surplus = info.balanceUSD - config.targetBalanceUSD;
          chainsWithSurplus.push({ chain: info.chain, surplus });
        }
      }

      // Execute rebalancing
      for (const needing of chainsNeedingFunds) {
        for (const surplus of chainsWithSurplus) {
          if (surplus.surplus <= 0) continue;

          const transferAmount = Math.min(needing.needed, surplus.surplus);
          
          if (transferAmount >= 100) { // Minimum $100 transfer
            await this.executeRebalance(
              surplus.chain,
              needing.chain,
              transferAmount
            );

            surplus.surplus -= transferAmount;
            needing.needed -= transferAmount;

            if (needing.needed <= 0) break;
          }
        }
      }
    } catch (error) {
      logger.error('Rebalancing failed', { error });
    } finally {
      this.isRebalancing = false;
    }
  }

  /**
   * Execute rebalancing transfer
   */
  private async executeRebalance(
    fromChain: Chain,
    toChain: Chain,
    amountUSD: number
  ): Promise<void> {
    logger.info('Executing rebalance', { fromChain, toChain, amountUSD });

    try {
      // For same-token transfers (ETH on L2s), use bridge
      if (this.canBridge(fromChain, toChain)) {
        await this.bridgeFunds(fromChain, toChain, amountUSD);
      } else {
        // For different tokens, may need swap + bridge
        logger.warn('Complex rebalancing not yet supported', { fromChain, toChain });
      }

      // Log to database
      await db.query(
        `INSERT INTO gas_rebalancing_logs (
          from_chain, to_chain, amount_usd, status, created_at
        ) VALUES ($1, $2, $3, 'completed', NOW())`,
        [fromChain, toChain, amountUSD]
      );
    } catch (error) {
      logger.error('Rebalance execution failed', { fromChain, toChain, amountUSD, error });
      
      await db.query(
        `INSERT INTO gas_rebalancing_logs (
          from_chain, to_chain, amount_usd, status, error_message, created_at
        ) VALUES ($1, $2, $3, 'failed', $4, NOW())`,
        [fromChain, toChain, amountUSD, (error as Error).message]
      );
    }
  }

  /**
   * Check if direct bridge is possible
   */
  private canBridge(fromChain: Chain, toChain: Chain): boolean {
    const bridgeableChains = ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon'];
    return bridgeableChains.includes(fromChain) && bridgeableChains.includes(toChain);
  }

  /**
   * Bridge funds between chains using DexCalldataProvider
   */
  private async bridgeFunds(
    fromChain: Chain,
    toChain: Chain,
    amountUSD: number
  ): Promise<string> {
    const wallet = await this.getGasWallet(fromChain);
    const provider = this.providers.get(fromChain);
    
    if (!provider) {
      throw new Error(`No provider for ${fromChain}`);
    }

    // Calculate amount in native token
    const priceOracle = getPriceOracle();
    const nativePrice = await priceOracle.getNativeTokenPrice(fromChain);
    const amount = amountUSD / nativePrice;
    const amountWei = ethers.parseEther(amount.toFixed(18));

    logger.info('Bridging funds', {
      fromChain,
      toChain,
      amount: amount.toFixed(6),
      amountUSD,
    });

    // Create route step for bridge
    const bridgeStep: RouteStep = {
      type: 'bridge',
      fromChain,
      toChain,
      fromToken: 'ETH',
      toToken: 'ETH',
      amount: amountWei.toString(),
      provider: 'stargate',
      gasEstimate: 500000,
      fee: 0,
    };

    // Get bridge calldata from DexCalldataProvider
    const dexProvider = new DexCalldataProvider();
    const calldata = await dexProvider.getBridgeCalldata(bridgeStep, wallet.address);

    // Get bridge contract address
    const STARGATE_ROUTERS: Record<string, string> = {
      ethereum: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
      arbitrum: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
      base: '0x45f1A95A4D3f3836523F5c83673c797f4d4d263B',
      optimism: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
      polygon: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
    };

    const routerAddress = STARGATE_ROUTERS[fromChain];
    if (!routerAddress) {
      throw new Error(`Stargate not available on ${fromChain}`);
    }

    // Estimate LayerZero fee (approximately 0.01 ETH for L1, 0.001 for L2)
    const isL1 = fromChain === 'ethereum';
    const lzFee = isL1 ? ethers.parseEther('0.01') : ethers.parseEther('0.001');

    // Build and send the transaction
    const connectedWallet = wallet.connect(provider);
    const tx = await connectedWallet.sendTransaction({
      to: routerAddress,
      data: calldata,
      value: lzFee + amountWei,
      gasLimit: 500000n,
    });

    logger.info('Bridge transaction submitted', {
      txHash: tx.hash,
      fromChain,
      toChain,
      amount: amount.toFixed(6),
    });

    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (!receipt || receipt.status === 0) {
      throw new Error(`Bridge transaction failed: ${tx.hash}`);
    }

    logger.info('Bridge transaction confirmed', {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    });

    return tx.hash;
  }

  /**
   * Update gas reserves in database
   */
  private async updateGasReserveDB(
    chain: Chain,
    balance: string,
    balanceUSD: number,
    status: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO gas_reserves (chain, balance, balance_usd, status, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (chain) DO UPDATE SET
           balance = $2, balance_usd = $3, status = $4, updated_at = NOW()`,
        [chain, balance, balanceUSD, status]
      );
    } catch (error) {
      logger.error('Failed to update gas reserves DB', { chain, error });
    }
  }

  /**
   * Load reserves configuration from database
   */
  private async loadReservesFromDB(): Promise<void> {
    try {
      const result = await db.query('SELECT * FROM gas_reserve_config');
      for (const row of result.rows) {
        this.gasReserves.set(row.chain, {
          minBalanceUSD: parseFloat(row.min_balance_usd),
          targetBalanceUSD: parseFloat(row.target_balance_usd),
          alertThresholdUSD: parseFloat(row.alert_threshold_usd),
          criticalThresholdUSD: parseFloat(row.critical_threshold_usd),
        });
      }
    } catch (error) {
      // Table might not exist
      logger.debug('Gas reserve config table not found', { error });
    }
  }

  /**
   * Get default gas estimate
   */
  private getDefaultGasEstimate(step: RouteStep): number {
    const gasEstimates: Record<string, number> = {
      'ethereum:swap': 15,
      'ethereum:bridge': 30,
      'arbitrum:swap': 0.5,
      'arbitrum:bridge': 1,
      'base:swap': 0.1,
      'base:bridge': 0.3,
      'polygon:swap': 0.05,
      'polygon:bridge': 0.1,
      'optimism:swap': 0.2,
      'optimism:bridge': 0.5,
    };

    const key = `${step.fromChain}:${step.type}`;
    return gasEstimates[key] || 1;
  }

  /**
   * Get default gas price in wei
   */
  private getDefaultGasPrice(chain: Chain): bigint {
    const defaultPrices: Record<Chain, bigint> = {
      ethereum: 30000000000n,    // 30 gwei
      arbitrum: 100000000n,      // 0.1 gwei
      base: 100000000n,          // 0.1 gwei
      polygon: 30000000000n,     // 30 gwei (in MATIC units)
      optimism: 100000000n,      // 0.1 gwei
      stacks: 1000000n,          // 0.001 STX
      solana: 5000n,             // 5000 lamports
      bitcoin: 10n,              // 10 sat/vB
    };
    return defaultPrices[chain] || 1000000000n;
  }

  /**
   * Estimate gas units for a step
   */
  private estimateGasUnits(step: RouteStep): number {
    switch (step.type) {
      case 'swap':
        return 200000;
      case 'bridge':
        return 300000;
      case 'transfer':
        return 21000;
      default:
        return 100000;
    }
  }

  /**
   * Get all wallet statuses
   */
  async getWalletStatuses(): Promise<GasWalletInfo[]> {
    return this.monitorAllBalances();
  }
}

export default GasAbstractor;
