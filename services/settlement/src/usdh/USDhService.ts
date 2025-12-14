/**
 * USDh Service
 * Handles USDh token operations including conversions and transfers
 * Integrates with Stacks DEXs and cross-chain bridges
 */

import { logger } from '@shared/utils/logger';
import {
  broadcastTransaction,
  makeContractCall,
  standardPrincipalCV,
  uintCV,
  noneCV,
  someCV,
  bufferCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  createAssetInfo,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
import { StacksDexService } from '../stacks/DexService';
import { getPriceOracle } from '@shared/utils/priceOracle';
import axios from 'axios';

// USDh token configuration
interface TokenConfig {
  contractAddress: string;
  contractName: string;
  assetName: string;
  decimals: number;
}

// Transfer result
interface TransferResult {
  txId: string;
  amount: number;
  recipient: string;
  fee: number;
  status: 'broadcast' | 'pending' | 'success' | 'failed';
}

export class USDhService {
  private network: StacksMainnet | StacksTestnet;
  private networkType: 'mainnet' | 'testnet';
  private usdhConfig: TokenConfig;
  private apiUrl: string;
  private privateKey: string;
  private dexService: StacksDexService;

  constructor() {
    this.networkType = (process.env.STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
    this.network = this.networkType === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
    this.apiUrl = process.env.STACKS_RPC_URL || 'https://api.testnet.hiro.so';
    this.privateKey = process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY || '';
    this.dexService = new StacksDexService();

    // USDh token configuration (Hermetica's USDh)
    const usdhContract = process.env.USDH_CONTRACT || 
      (this.networkType === 'mainnet' 
        ? 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usdh'
        : 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-usdh');
    
    const [contractAddress, contractName] = usdhContract.split('.');
    
    this.usdhConfig = {
      contractAddress,
      contractName,
      assetName: 'usdh',
      decimals: 6,
    };
  }

  /**
   * Convert any token to USDh
   */
  async convertToUSDh(
    fromToken: string,
    amount: string,
    fromChain: string
  ): Promise<number> {
    logger.info('Converting to USDh', { fromToken, amount, fromChain });

    // If already USDh, just return the amount
    if (fromToken.toUpperCase() === 'USDH') {
      return parseFloat(amount);
    }

    // If on Stacks, swap directly
    if (fromChain === 'stacks') {
      return await this.swapOnStacks(fromToken, amount);
    }

    // For cross-chain conversion:
    // 1. The routing engine should have already bridged the tokens
    // 2. If token is a stablecoin (USDC, USDT), assume 1:1 conversion
    // 3. For other tokens, get price and convert
    
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'];
    const tokenUpper = fromToken.toUpperCase();

    if (stablecoins.includes(tokenUpper)) {
      // Stablecoins are roughly 1:1 with USDh
      // Apply small conversion fee (0.1%)
      const fee = parseFloat(amount) * 0.001;
      return parseFloat(amount) - fee;
    }

    // For non-stablecoins, convert via price oracle
    const priceOracle = getPriceOracle();
    const usdValue = await priceOracle.convertToUSD(fromToken, amount);
    
    // Apply conversion fee (0.3%)
    const fee = usdValue * 0.003;
    return usdValue - fee;
  }

  /**
   * Swap token to USDh on Stacks DEXs
   */
  private async swapOnStacks(fromToken: string, amount: string): Promise<number> {
    logger.info('Swapping on Stacks', { fromToken, amount });

    // Get settlement wallet address
    const settlementAddress = process.env.STACKS_SETTLEMENT_WALLET_ADDRESS || '';

    if (!settlementAddress) {
      // If no settlement wallet, return estimated value
      logger.warn('No settlement wallet configured, returning estimated value');
      const priceOracle = getPriceOracle();
      return await priceOracle.convertToUSD(fromToken, amount);
    }

    // Use DEX service to swap
    const swapResult = await this.dexService.swapToUSDh(
      fromToken,
      amount,
      settlementAddress
    );

    return swapResult.usdhAmount;
  }

  /**
   * Transfer USDh to a recipient
   */
  async transferUSDh(toAddress: string, amount: number): Promise<string> {
    logger.info('Transferring USDh', { toAddress, amount });

    if (!this.privateKey) {
      throw new Error('Settlement wallet private key not configured');
    }

    // Convert amount to micro-units (6 decimals)
    const microAmount = BigInt(Math.floor(amount * Math.pow(10, this.usdhConfig.decimals)));

    // Get sender address from private key
    const senderAddress = process.env.STACKS_SETTLEMENT_WALLET_ADDRESS || '';

    // Create post-conditions for safety
    const postConditions = [
      makeStandardFungiblePostCondition(
        senderAddress,
        FungibleConditionCode.LessEqual,
        microAmount,
        createAssetInfo(
          this.usdhConfig.contractAddress,
          this.usdhConfig.contractName,
          this.usdhConfig.assetName
        )
      ),
    ];

    try {
      // Build transfer transaction using SIP-010 standard
      const txOptions = {
        contractAddress: this.usdhConfig.contractAddress,
        contractName: this.usdhConfig.contractName,
        functionName: 'transfer',
        functionArgs: [
          uintCV(microAmount),
          standardPrincipalCV(senderAddress),
          standardPrincipalCV(toAddress),
          noneCV(), // memo (optional)
        ],
        senderKey: this.privateKey,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny,
        postConditions,
        fee: BigInt(2000), // ~0.002 STX fee
      };

      const transaction = await makeContractCall(txOptions);

      // Broadcast transaction
      const broadcastResponse = await broadcastTransaction(transaction, this.network);

      if (broadcastResponse.error) {
        throw new Error(`Transfer broadcast failed: ${broadcastResponse.error}`);
      }

      logger.info('USDh transfer broadcast', {
        txId: broadcastResponse.txid,
        toAddress,
        amount,
      });

      return broadcastResponse.txid;
    } catch (error) {
      logger.error('USDh transfer failed', { error, toAddress, amount });
      throw error;
    }
  }

  /**
   * Transfer USDh with memo
   */
  async transferUsdhWithMemo(
    toAddress: string,
    amount: number,
    memo: string
  ): Promise<string> {
    logger.info('Transferring USDh with memo', { toAddress, amount, memo });

    if (!this.privateKey) {
      throw new Error('Settlement wallet private key not configured');
    }

    const microAmount = BigInt(Math.floor(amount * Math.pow(10, this.usdhConfig.decimals)));
    const senderAddress = process.env.STACKS_SETTLEMENT_WALLET_ADDRESS || '';

    // Convert memo to buffer (max 34 bytes for standard memo)
    const memoBuffer = Buffer.from(memo.slice(0, 34), 'utf-8');

    try {
      const txOptions = {
        contractAddress: this.usdhConfig.contractAddress,
        contractName: this.usdhConfig.contractName,
        functionName: 'transfer',
        functionArgs: [
          uintCV(microAmount),
          standardPrincipalCV(senderAddress),
          standardPrincipalCV(toAddress),
          someCV(bufferCV(memoBuffer)),
        ],
        senderKey: this.privateKey,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
        fee: BigInt(2000),
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction(transaction, this.network);

      if (broadcastResponse.error) {
        throw new Error(`Transfer broadcast failed: ${broadcastResponse.error}`);
      }

      return broadcastResponse.txid;
    } catch (error) {
      logger.error('USDh transfer with memo failed', { error, toAddress, amount });
      throw error;
    }
  }

  /**
   * Get USDh balance for an address
   */
  async getBalance(address: string): Promise<number> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/extended/v1/address/${address}/balances`
      );

      const balances = response.data;
      const fungibleTokens = balances.fungible_tokens || {};

      // Find USDh balance
      const usdhKey = `${this.usdhConfig.contractAddress}.${this.usdhConfig.contractName}::${this.usdhConfig.assetName}`;
      const usdhBalance = fungibleTokens[usdhKey];

      if (usdhBalance) {
        return parseInt(usdhBalance.balance) / Math.pow(10, this.usdhConfig.decimals);
      }

      return 0;
    } catch (error) {
      logger.error('Failed to get USDh balance', { address, error });
      return 0;
    }
  }

  /**
   * Get current USDh price (should be ~$1)
   */
  async getUsdhPrice(): Promise<number> {
    // USDh is a stablecoin pegged to USD
    // In production, would verify this via DEX prices
    return 1.0;
  }

  /**
   * Estimate conversion from token to USDh
   */
  async estimateConversion(
    fromToken: string,
    amount: string,
    fromChain: string
  ): Promise<{
    usdhAmount: number;
    fee: number;
    slippage: number;
    rate: number;
  }> {
    const stablecoins = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'];
    const tokenUpper = fromToken.toUpperCase();

    if (tokenUpper === 'USDH') {
      return {
        usdhAmount: parseFloat(amount),
        fee: 0,
        slippage: 0,
        rate: 1,
      };
    }

    if (stablecoins.includes(tokenUpper)) {
      const fee = parseFloat(amount) * 0.001; // 0.1% fee
      return {
        usdhAmount: parseFloat(amount) - fee,
        fee,
        slippage: 0.001,
        rate: 1,
      };
    }

    // For non-stablecoins
    const priceOracle = getPriceOracle();
    const tokenPrice = await priceOracle.getPrice(fromToken);
    const usdValue = parseFloat(amount) * tokenPrice.price;
    const fee = usdValue * 0.003; // 0.3% fee
    const slippage = 0.005; // 0.5% estimated slippage

    return {
      usdhAmount: usdValue - fee - (usdValue * slippage),
      fee,
      slippage,
      rate: tokenPrice.price,
    };
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txId: string, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`${this.apiUrl}/extended/v1/tx/${txId}`);
        const status = response.data.tx_status;

        if (status === 'success') {
          logger.info('Transaction confirmed', { txId });
          return true;
        } else if (status === 'abort_by_response' || status === 'abort_by_post_condition') {
          logger.error('Transaction failed', { txId, status });
          return false;
        }

        // Still pending, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
      } catch (error) {
        logger.warn('Error checking transaction status', { txId, error });
      }
    }

    logger.error('Transaction confirmation timeout', { txId });
    return false;
  }

  /**
   * Get settlement wallet balance
   */
  async getSettlementWalletBalance(): Promise<{
    stx: number;
    usdh: number;
  }> {
    const walletAddress = process.env.STACKS_SETTLEMENT_WALLET_ADDRESS || '';
    
    if (!walletAddress) {
      return { stx: 0, usdh: 0 };
    }

    try {
      const response = await axios.get(
        `${this.apiUrl}/extended/v1/address/${walletAddress}/balances`
      );

      const balances = response.data;
      const stxBalance = parseInt(balances.stx?.balance || '0') / 1e6;
      const usdhBalance = await this.getBalance(walletAddress);

      return {
        stx: stxBalance,
        usdh: usdhBalance,
      };
    } catch (error) {
      logger.error('Failed to get settlement wallet balance', { error });
      return { stx: 0, usdh: 0 };
    }
  }
}

export default USDhService;
