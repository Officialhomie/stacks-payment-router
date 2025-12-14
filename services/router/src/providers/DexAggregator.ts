/**
 * DEX Aggregator
 * Fetches and compares quotes from multiple DEX providers
 * for optimal swap routing
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '@shared/utils/logger';
import { Chain } from '@shared/types';
import { getRedis } from '@shared/utils/redis';

export interface DexQuote {
  provider: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  gasEstimate: number;
  fee: number;
  slippage: number;
  route: any[];
  priceImpact: number;
  estimatedGasUSD: number;
  expiresAt: number;
}

interface ProviderConfig {
  name: string;
  enabled: boolean;
  priority: number;
  apiUrl: string;
  apiKey?: string;
  rateLimit: number; // requests per minute
}

// Chain ID mappings
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  bsc: 56,
};

// Native token addresses
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export class DexAggregator {
  private providers: Map<string, ProviderConfig> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();
  private rateLimiters: Map<string, { count: number; resetTime: number }> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize DEX provider configurations
   */
  private initializeProviders(): void {
    // 1inch (v5.2 API)
    this.providers.set('1inch', {
      name: '1inch',
      enabled: !!process.env.ONEINCH_API_KEY,
      priority: 1,
      apiUrl: 'https://api.1inch.dev/swap/v5.2',
      apiKey: process.env.ONEINCH_API_KEY,
      rateLimit: 30, // 30 requests per minute on free tier
    });

    // LiFi (cross-chain aggregator)
    this.providers.set('lifi', {
      name: 'lifi',
      enabled: true, // Works without API key
      priority: 2,
      apiUrl: 'https://li.quest/v1',
      apiKey: process.env.LIFI_API_KEY,
      rateLimit: 60,
    });

    // Socket (bridge aggregator)
    this.providers.set('socket', {
      name: 'socket',
      enabled: !!process.env.SOCKET_API_KEY,
      priority: 3,
      apiUrl: 'https://api.socket.tech/v2',
      apiKey: process.env.SOCKET_API_KEY,
      rateLimit: 30,
    });

    // 0x Protocol
    this.providers.set('0x', {
      name: '0x',
      enabled: !!process.env.ZEROX_API_KEY,
      priority: 4,
      apiUrl: 'https://api.0x.org/swap/v1',
      apiKey: process.env.ZEROX_API_KEY,
      rateLimit: 60,
    });

    // ParaSwap
    this.providers.set('paraswap', {
      name: 'paraswap',
      enabled: true,
      priority: 5,
      apiUrl: 'https://apiv5.paraswap.io',
      rateLimit: 30,
    });

    // Initialize HTTP clients
    for (const [name, config] of this.providers) {
      if (config.enabled) {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };

        // Add authorization headers based on provider
        if (config.apiKey) {
          if (name === '1inch') {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
          } else if (name === 'socket') {
            headers['API-KEY'] = config.apiKey;
          } else if (name === '0x') {
            headers['0x-api-key'] = config.apiKey;
          } else if (name === 'lifi') {
            headers['x-lifi-api-key'] = config.apiKey;
          }
        }

        this.clients.set(name, axios.create({
          baseURL: config.apiUrl,
          timeout: 15000,
          headers,
        }));

        this.rateLimiters.set(name, { count: 0, resetTime: Date.now() + 60000 });
      }
    }

    logger.info('DEX aggregator initialized', {
      providers: Array.from(this.providers.entries())
        .filter(([_, c]) => c.enabled)
        .map(([n]) => n),
    });
  }

  /**
   * Get quotes from all available providers
   */
  async getQuote(
    chain: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote[]> {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    // Check cache
    const cacheKey = `quote:${chain}:${fromToken}:${toToken}:${amount}`;
    const cached = await this.getCachedQuote(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch quotes in parallel
    const quotePromises: Promise<DexQuote | null>[] = [];

    for (const [name, config] of this.providers) {
      if (config.enabled && this.checkRateLimit(name)) {
        quotePromises.push(
          this.fetchQuote(name, chainId, fromToken, toToken, amount)
            .catch((error) => {
              logger.warn(`Quote from ${name} failed`, { error: (error as Error).message });
              return null;
            })
        );
      }
    }

    const results = await Promise.all(quotePromises);
    const validQuotes = results.filter((q): q is DexQuote => q !== null);

    // Sort by output amount (descending)
    validQuotes.sort((a, b) => parseFloat(b.toAmount) - parseFloat(a.toAmount));

    // Cache the results
    if (validQuotes.length > 0) {
      await this.cacheQuote(cacheKey, validQuotes, 30); // 30 second cache
    }

    return validQuotes;
  }

  /**
   * Fetch quote from a specific provider
   */
  private async fetchQuote(
    provider: string,
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote | null> {
    this.incrementRateLimit(provider);

    switch (provider) {
      case '1inch':
        return this.get1inchQuote(chainId, fromToken, toToken, amount);
      case 'lifi':
        return this.getLiFiQuote(chainId, fromToken, toToken, amount);
      case 'socket':
        return this.getSocketQuote(chainId, fromToken, toToken, amount);
      case '0x':
        return this.get0xQuote(chainId, fromToken, toToken, amount);
      case 'paraswap':
        return this.getParaSwapQuote(chainId, fromToken, toToken, amount);
      default:
        return null;
    }
  }

  /**
   * Get 1inch quote (v5.2 API)
   */
  private async get1inchQuote(
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote> {
    const client = this.clients.get('1inch');
    if (!client) throw new Error('1inch client not initialized');

    const response = await client.get(`/${chainId}/quote`, {
      params: {
        src: fromToken,
        dst: toToken,
        amount: amount,
        includeTokensInfo: true,
        includeProtocols: true,
        includeGas: true,
      },
    });

    const data = response.data;

    return {
      provider: '1inch',
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: data.toAmount || data.dstAmount,
      gasEstimate: parseInt(data.gas || data.estimatedGas || '0'),
      fee: 0, // 1inch fee is included in the rate
      slippage: 0,
      route: data.protocols || [],
      priceImpact: 0, // Would need additional calculation
      estimatedGasUSD: parseFloat(data.gasUSD || '0'),
      expiresAt: Date.now() + 30000,
    };
  }

  /**
   * Get LiFi quote
   */
  private async getLiFiQuote(
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote> {
    const client = this.clients.get('lifi');
    if (!client) throw new Error('LiFi client not initialized');

    const response = await client.get('/quote', {
      params: {
        fromChain: chainId,
        toChain: chainId,
        fromToken,
        toToken,
        fromAmount: amount,
      },
    });

    const data = response.data;
    const estimate = data.estimate || {};

    return {
      provider: 'lifi',
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: estimate.toAmount || '0',
      gasEstimate: parseInt(estimate.gasCosts?.[0]?.estimate || '0'),
      fee: parseFloat(estimate.feeCosts?.[0]?.amountUSD || '0'),
      slippage: parseFloat(estimate.slippage || '0'),
      route: data.steps || [],
      priceImpact: parseFloat(estimate.priceImpact || '0'),
      estimatedGasUSD: parseFloat(estimate.gasCosts?.[0]?.amountUSD || '0'),
      expiresAt: Date.now() + 30000,
    };
  }

  /**
   * Get Socket quote
   */
  private async getSocketQuote(
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote> {
    const client = this.clients.get('socket');
    if (!client) throw new Error('Socket client not initialized');

    const response = await client.get('/quote', {
      params: {
        fromChainId: chainId,
        toChainId: chainId,
        fromTokenAddress: fromToken,
        toTokenAddress: toToken,
        fromAmount: amount,
        userAddress: '0x0000000000000000000000000000000000000000',
        sort: 'output',
        singleTxOnly: true,
      },
    });

    const routes = response.data.result?.routes || [];
    if (routes.length === 0) {
      throw new Error('No routes found');
    }

    const bestRoute = routes[0];

    return {
      provider: 'socket',
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: bestRoute.toAmount || '0',
      gasEstimate: parseInt(bestRoute.totalGasFeesInUsd || '0') * 1e9, // Convert to wei estimate
      fee: parseFloat(bestRoute.totalFees || '0'),
      slippage: parseFloat(bestRoute.slippage || '0'),
      route: bestRoute.userTxs || [],
      priceImpact: 0,
      estimatedGasUSD: parseFloat(bestRoute.totalGasFeesInUsd || '0'),
      expiresAt: Date.now() + 30000,
    };
  }

  /**
   * Get 0x quote
   */
  private async get0xQuote(
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote> {
    const client = this.clients.get('0x');
    if (!client) throw new Error('0x client not initialized');

    // 0x uses different base URLs per chain
    const chainEndpoints: Record<number, string> = {
      1: 'https://api.0x.org',
      137: 'https://polygon.api.0x.org',
      42161: 'https://arbitrum.api.0x.org',
      10: 'https://optimism.api.0x.org',
      8453: 'https://base.api.0x.org',
    };

    const baseUrl = chainEndpoints[chainId];
    if (!baseUrl) {
      throw new Error(`0x not supported on chain ${chainId}`);
    }

    const response = await axios.get(`${baseUrl}/swap/v1/quote`, {
      params: {
        sellToken: fromToken,
        buyToken: toToken,
        sellAmount: amount,
      },
      headers: {
        '0x-api-key': this.providers.get('0x')?.apiKey || '',
      },
    });

    const data = response.data;

    return {
      provider: '0x',
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: data.buyAmount || '0',
      gasEstimate: parseInt(data.estimatedGas || '0'),
      fee: parseFloat(data.protocolFee || '0'),
      slippage: 0,
      route: data.sources || [],
      priceImpact: parseFloat(data.estimatedPriceImpact || '0'),
      estimatedGasUSD: parseFloat(data.estimatedGasUSD || '0'),
      expiresAt: Date.now() + 30000,
    };
  }

  /**
   * Get ParaSwap quote
   */
  private async getParaSwapQuote(
    chainId: number,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote> {
    const client = this.clients.get('paraswap');
    if (!client) throw new Error('ParaSwap client not initialized');

    const response = await client.get('/prices', {
      params: {
        srcToken: fromToken,
        destToken: toToken,
        amount: amount,
        network: chainId,
        side: 'SELL',
      },
    });

    const data = response.data.priceRoute;
    if (!data) {
      throw new Error('No price route found');
    }

    return {
      provider: 'paraswap',
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: data.destAmount || '0',
      gasEstimate: parseInt(data.gasCost || '0'),
      fee: 0,
      slippage: 0,
      route: data.bestRoute || [],
      priceImpact: parseFloat(data.priceImpact || '0'),
      estimatedGasUSD: parseFloat(data.gasCostUSD || '0'),
      expiresAt: Date.now() + 30000,
    };
  }

  /**
   * Check rate limit for a provider
   */
  private checkRateLimit(provider: string): boolean {
    const limiter = this.rateLimiters.get(provider);
    const config = this.providers.get(provider);
    
    if (!limiter || !config) return false;

    const now = Date.now();
    
    // Reset counter if window has passed
    if (now >= limiter.resetTime) {
      limiter.count = 0;
      limiter.resetTime = now + 60000;
    }

    return limiter.count < config.rateLimit;
  }

  /**
   * Increment rate limit counter
   */
  private incrementRateLimit(provider: string): void {
    const limiter = this.rateLimiters.get(provider);
    if (limiter) {
      limiter.count++;
    }
  }

  /**
   * Get cached quote
   */
  private async getCachedQuote(key: string): Promise<DexQuote[] | null> {
    try {
      const redis = getRedis();
      const cached = await redis.get(key);
      if (cached) {
        const quotes = JSON.parse(cached) as DexQuote[];
        // Check if quotes are still valid
        if (quotes.length > 0 && quotes[0].expiresAt > Date.now()) {
          return quotes;
        }
      }
    } catch (error) {
      // Ignore cache errors
    }
    return null;
  }

  /**
   * Cache quote
   */
  private async cacheQuote(key: string, quotes: DexQuote[], ttl: number): Promise<void> {
    try {
      const redis = getRedis();
      await redis.setEx(key, ttl, JSON.stringify(quotes));
    } catch (error) {
      // Ignore cache errors
    }
  }

  /**
   * Get best quote for a swap
   */
  async getBestQuote(
    chain: string,
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<DexQuote | null> {
    const quotes = await this.getQuote(chain, fromToken, toToken, amount);
    return quotes.length > 0 ? quotes[0] : null;
  }

  /**
   * Get chain ID
   */
  getChainId(chain: string): number {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    return chainId;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, config]) => config.enabled)
      .map(([name]) => name);
  }
}

export default DexAggregator;
