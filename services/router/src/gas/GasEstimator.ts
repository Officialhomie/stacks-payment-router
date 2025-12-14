import { Chain } from '@shared/types';
import { CHAIN_CONFIGS } from '@shared/constants/chains';
import { logger } from '@shared/utils/logger';
import { getPriceOracle } from '@shared/utils/priceOracle';
import { ethers, JsonRpcProvider } from 'ethers';

// Cache for providers to avoid recreating them
const providerCache: Map<string, JsonRpcProvider> = new Map();

export class GasEstimator {
  private gasPriceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly cacheTTL = 30000; // 30 seconds cache for gas prices

  /**
   * Estimate gas cost in USD for a transaction
   */
  async estimate(
    chain: Chain, 
    txType: 'swap' | 'bridge' | 'transfer', 
    amount: string
  ): Promise<number> {
    const config = CHAIN_CONFIGS[chain];
    if (!config) {
      logger.warn(`No config for chain: ${chain}`);
      return 0;
    }

    // Get current gas price from RPC
    const gasPrice = await this.getGasPrice(chain);

    // Estimate gas units based on transaction type
    const gasUnits = this.getGasUnits(txType, chain);

    // Calculate cost in native token (wei -> native)
    const nativeTokenCost = (gasPrice * gasUnits) / 1e18;

    // Convert to USD using live price oracle
    const priceOracle = getPriceOracle();
    const nativeTokenPrice = await priceOracle.getNativeTokenPrice(chain);
    const costUSD = nativeTokenCost * nativeTokenPrice;

    logger.debug('Gas estimation', {
      chain,
      txType,
      gasPrice: `${gasPrice / 1e9} gwei`,
      gasUnits,
      nativeTokenCost: nativeTokenCost.toFixed(6),
      nativeTokenPrice,
      costUSD: costUSD.toFixed(4),
    });

    return costUSD;
  }

  /**
   * Get gas units for different transaction types
   */
  private getGasUnits(txType: 'swap' | 'bridge' | 'transfer', chain: Chain): number {
    // Base gas costs by transaction type
    const baseUnits: Record<string, number> = {
      transfer: 21000,
      swap: 150000,
      bridge: 250000,
    };

    // Chain-specific multipliers (L2s have lower execution costs)
    const chainMultipliers: Record<Chain, number> = {
      ethereum: 1.0,
      arbitrum: 0.8,
      base: 0.8,
      optimism: 0.8,
      polygon: 1.0,
      stacks: 1.0,
      solana: 1.0,
      bitcoin: 1.0,
    };

    const base = baseUnits[txType] || 21000;
    const multiplier = chainMultipliers[chain] || 1.0;

    return Math.floor(base * multiplier);
  }

  /**
   * Get current gas price for a chain
   */
  async getGasPrice(chain: Chain): Promise<number> {
    // Check cache first
    const cached = this.gasPriceCache.get(chain);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    // Try to fetch from RPC for EVM chains
    if (this.isEVMChain(chain)) {
      try {
        const provider = await this.getProvider(chain);
        if (provider) {
          const feeData = await provider.getFeeData();
          
          // Use maxFeePerGas for EIP-1559 chains, fallback to gasPrice
          const gasPrice = feeData.maxFeePerGas 
            ? Number(feeData.maxFeePerGas)
            : feeData.gasPrice 
              ? Number(feeData.gasPrice)
              : null;

          if (gasPrice) {
            this.gasPriceCache.set(chain, { price: gasPrice, timestamp: Date.now() });
            return gasPrice;
          }
        }
      } catch (error) {
        logger.warn(`Failed to fetch gas price for ${chain}`, { 
          error: (error as Error).message 
        });
      }
    }

    // Return fallback values for non-EVM chains or on error
    return this.getFallbackGasPrice(chain);
  }

  /**
   * Check if chain is EVM-compatible
   */
  private isEVMChain(chain: Chain): boolean {
    return ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon'].includes(chain);
  }

  /**
   * Get or create provider for chain
   */
  private async getProvider(chain: Chain): Promise<JsonRpcProvider | null> {
    const cached = providerCache.get(chain);
    if (cached) {
      return cached;
    }

    const config = CHAIN_CONFIGS[chain];
    if (!config?.rpcUrl) {
      return null;
    }

    try {
      const provider = new JsonRpcProvider(config.rpcUrl);
      // Verify the provider works
      await provider.getNetwork();
      providerCache.set(chain, provider);
      return provider;
    } catch (error) {
      logger.warn(`Failed to create provider for ${chain}`, { 
        error: (error as Error).message 
      });
      return null;
    }
  }

  /**
   * Get fallback gas prices for chains without live data
   */
  private getFallbackGasPrice(chain: Chain): number {
    const fallbackPrices: Record<Chain, number> = {
      ethereum: 30e9,     // 30 gwei
      arbitrum: 0.1e9,    // 0.1 gwei
      base: 0.01e9,       // 0.01 gwei
      optimism: 0.01e9,   // 0.01 gwei
      polygon: 50e9,      // 50 gwei (MATIC)
      stacks: 0,          // Not applicable
      solana: 0,          // Not applicable
      bitcoin: 0,         // Not applicable (uses sats/vbyte)
    };

    return fallbackPrices[chain] || 20e9;
  }

  /**
   * Estimate total gas cost for a multi-step route
   */
  async estimateRouteGas(steps: Array<{ chain: Chain; type: 'swap' | 'bridge' | 'transfer' }>): Promise<number> {
    let totalCost = 0;

    for (const step of steps) {
      const cost = await this.estimate(step.chain, step.type, '0');
      totalCost += cost;
    }

    return totalCost;
  }

  /**
   * Get estimated time for transaction confirmation
   */
  getEstimatedTime(chain: Chain, txType: 'swap' | 'bridge' | 'transfer'): number {
    // Estimated times in seconds
    const baseTimes: Record<Chain, number> = {
      ethereum: 15,       // ~15 seconds per block
      arbitrum: 2,        // ~2 seconds
      base: 2,            // ~2 seconds  
      optimism: 2,        // ~2 seconds
      polygon: 2,         // ~2 seconds
      stacks: 600,        // ~10 minutes (anchor blocks)
      solana: 0.5,        // ~400ms
      bitcoin: 600,       // ~10 minutes
    };

    const baseTime = baseTimes[chain] || 15;

    // Bridges take longer
    if (txType === 'bridge') {
      return baseTime + 120; // Add 2 minutes for bridge finality
    }

    return baseTime;
  }
}

export default GasEstimator;
