/**
 * Price Oracle Service
 * Provides real-time token prices from multiple sources
 * with caching, fallbacks, and staleness protection
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from './logger';
import { getRedis, CACHE_KEYS } from './redis';
import { Chain, Token } from '@shared/types';

// Price source configuration
interface PriceSource {
  name: string;
  priority: number;
  enabled: boolean;
}

interface TokenPrice {
  price: number;
  source: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
}

interface CachedPrice extends TokenPrice {
  cachedAt: number;
}

// CoinGecko token ID mappings
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  BTC: 'bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  STX: 'blockstack',
  SOL: 'solana',
  MATIC: 'matic-network',
  USDh: 'usd-coin', // Pegged to USDC
  OP: 'optimism',
  ARB: 'arbitrum',
};

// Chain native token mappings
const CHAIN_NATIVE_TOKENS: Record<Chain, string> = {
  ethereum: 'ETH',
  arbitrum: 'ETH',
  base: 'ETH',
  polygon: 'MATIC',
  optimism: 'ETH',
  stacks: 'STX',
  solana: 'SOL',
  bitcoin: 'BTC',
};

// Token address to symbol mappings (mainnet)
const TOKEN_ADDRESS_TO_SYMBOL: Record<string, Record<string, string>> = {
  ethereum: {
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC',
    '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT',
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 'WETH',
    '0x6B175474E89094C44Da98b954EesdeCD73bBed6B': 'DAI',
  },
  arbitrum: {
    '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8': 'USDC',
    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 'USDT',
    '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1': 'WETH',
  },
  base: {
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'USDC',
    '0x4200000000000000000000000000000000000006': 'WETH',
  },
};

// Price staleness thresholds (in seconds)
const STALENESS_THRESHOLDS = {
  high: 60,      // 1 minute for high confidence
  medium: 300,   // 5 minutes for medium confidence
  low: 900,      // 15 minutes for low confidence
};

export class PriceOracle {
  private coingeckoClient: AxiosInstance;
  private coinmarketcapClient: AxiosInstance;
  private priceCache: Map<string, CachedPrice> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private sources: PriceSource[];

  constructor() {
    // Initialize CoinGecko client (free tier)
    this.coingeckoClient = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    // Initialize CoinMarketCap client (requires API key)
    const cmcApiKey = process.env.COINMARKETCAP_API_KEY || '';
    this.coinmarketcapClient = axios.create({
      baseURL: 'https://pro-api.coinmarketcap.com/v1',
      timeout: 10000,
      headers: {
        'X-CMC_PRO_API_KEY': cmcApiKey,
        'Accept': 'application/json',
      },
    });

    // Configure price sources with priority
    this.sources = [
      { name: 'coingecko', priority: 1, enabled: true },
      { name: 'coinmarketcap', priority: 2, enabled: !!cmcApiKey },
      { name: 'fallback', priority: 3, enabled: true },
    ];
  }

  /**
   * Start automatic price updates
   */
  startAutoUpdate(intervalMs: number = 30000): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Initial update
    this.updateAllPrices().catch((err) => {
      logger.error('Initial price update failed', { error: err.message });
    });

    // Schedule periodic updates
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateAllPrices();
      } catch (error) {
        logger.error('Periodic price update failed', { error });
      }
    }, intervalMs);

    logger.info('Price oracle auto-update started', { intervalMs });
  }

  /**
   * Stop automatic price updates
   */
  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Price oracle auto-update stopped');
    }
  }

  /**
   * Get price for a token
   */
  async getPrice(token: string): Promise<TokenPrice> {
    const cacheKey = token.toUpperCase();
    
    // Check memory cache first
    const cached = this.priceCache.get(cacheKey);
    if (cached && this.isPriceValid(cached)) {
      return cached;
    }

    // Check Redis cache
    try {
      const redis = getRedis();
      const redisKey = `price:${cacheKey}`;
      const redisCached = await redis.get(redisKey);
      
      if (redisCached) {
        const parsed: CachedPrice = JSON.parse(redisCached);
        if (this.isPriceValid(parsed)) {
          this.priceCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    } catch (error) {
      logger.warn('Redis cache read failed', { token, error });
    }

    // Fetch fresh price
    return this.fetchPrice(token);
  }

  /**
   * Get price for native chain token
   */
  async getNativeTokenPrice(chain: Chain): Promise<number> {
    const nativeToken = CHAIN_NATIVE_TOKENS[chain];
    if (!nativeToken) {
      throw new Error(`Unknown chain: ${chain}`);
    }
    const price = await this.getPrice(nativeToken);
    return price.price;
  }

  /**
   * Convert amount to USD
   */
  async convertToUSD(token: string, amount: string | number): Promise<number> {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const price = await this.getPrice(token);
    return numAmount * price.price;
  }

  /**
   * Convert USD to token amount
   */
  async convertFromUSD(token: string, usdAmount: number): Promise<number> {
    const price = await this.getPrice(token);
    return usdAmount / price.price;
  }

  /**
   * Get token symbol from address
   */
  getTokenSymbol(chain: string, address: string): string | null {
    const chainMappings = TOKEN_ADDRESS_TO_SYMBOL[chain];
    if (!chainMappings) return null;
    return chainMappings[address.toLowerCase()] || null;
  }

  /**
   * Get price for a specific token on a chain
   * This allows for chain-specific token pricing
   */
  async getTokenPrice(token: string, chain: Chain): Promise<number> {
    // For tokens that exist on multiple chains with different addresses,
    // we use the token symbol directly since they typically have the same value
    const tokenUpper = token.toUpperCase();
    
    // Handle chain-specific tokens that might have different prices
    const chainSpecificTokens: Record<string, Record<Chain, string>> = {
      // Add any chain-specific token mappings here if needed
      // For example, if wrapped tokens have slightly different prices
    };
    
    const mappedToken = chainSpecificTokens[tokenUpper]?.[chain] || tokenUpper;
    const price = await this.getPrice(mappedToken);
    return price.price;
  }

  /**
   * Update all tracked prices
   */
  async updateAllPrices(): Promise<void> {
    const tokens = Object.keys(COINGECKO_IDS);
    
    try {
      // Batch fetch from CoinGecko
      const ids = tokens.map((t) => COINGECKO_IDS[t]).filter(Boolean);
      const uniqueIds = [...new Set(ids)];
      
      const response = await this.coingeckoClient.get('/simple/price', {
        params: {
          ids: uniqueIds.join(','),
          vs_currencies: 'usd',
          include_last_updated_at: true,
        },
      });

      const now = Date.now();
      
      for (const token of tokens) {
        const geckoId = COINGECKO_IDS[token];
        if (geckoId && response.data[geckoId]) {
          const priceData: CachedPrice = {
            price: response.data[geckoId].usd,
            source: 'coingecko',
            timestamp: response.data[geckoId].last_updated_at * 1000,
            confidence: 'high',
            cachedAt: now,
          };

          // Update memory cache
          this.priceCache.set(token.toUpperCase(), priceData);

          // Update Redis cache
          try {
            const redis = getRedis();
            await redis.setEx(
              `price:${token.toUpperCase()}`,
              300, // 5 minute TTL
              JSON.stringify(priceData)
            );
          } catch (error) {
            logger.warn('Redis cache write failed', { token, error });
          }
        }
      }

      logger.debug('Price update completed', { tokensUpdated: tokens.length });
    } catch (error) {
      logger.error('Batch price update failed', { error });
      throw error;
    }
  }

  /**
   * Fetch price from available sources with fallback
   */
  private async fetchPrice(token: string): Promise<TokenPrice> {
    const enabledSources = this.sources
      .filter((s) => s.enabled)
      .sort((a, b) => a.priority - b.priority);

    let lastError: Error | null = null;

    for (const source of enabledSources) {
      try {
        let price: TokenPrice;

        switch (source.name) {
          case 'coingecko':
            price = await this.fetchFromCoinGecko(token);
            break;
          case 'coinmarketcap':
            price = await this.fetchFromCoinMarketCap(token);
            break;
          case 'fallback':
            price = this.getFallbackPrice(token);
            break;
          default:
            continue;
        }

        // Cache the result
        const cached: CachedPrice = { ...price, cachedAt: Date.now() };
        this.priceCache.set(token.toUpperCase(), cached);

        // Also cache in Redis
        try {
          const redis = getRedis();
          await redis.setEx(
            `price:${token.toUpperCase()}`,
            300,
            JSON.stringify(cached)
          );
        } catch (err) {
          // Ignore Redis errors for price caching
        }

        return price;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Price fetch from ${source.name} failed`, {
          token,
          error: lastError.message,
        });
      }
    }

    throw lastError || new Error(`Failed to fetch price for ${token}`);
  }

  /**
   * Fetch from CoinGecko
   */
  private async fetchFromCoinGecko(token: string): Promise<TokenPrice> {
    const geckoId = COINGECKO_IDS[token.toUpperCase()];
    if (!geckoId) {
      throw new Error(`Unknown token for CoinGecko: ${token}`);
    }

    const response = await this.coingeckoClient.get('/simple/price', {
      params: {
        ids: geckoId,
        vs_currencies: 'usd',
        include_last_updated_at: true,
      },
    });

    if (!response.data[geckoId]) {
      throw new Error(`CoinGecko returned no data for ${geckoId}`);
    }

    return {
      price: response.data[geckoId].usd,
      source: 'coingecko',
      timestamp: response.data[geckoId].last_updated_at * 1000,
      confidence: 'high',
    };
  }

  /**
   * Fetch from CoinMarketCap
   */
  private async fetchFromCoinMarketCap(token: string): Promise<TokenPrice> {
    const response = await this.coinmarketcapClient.get('/cryptocurrency/quotes/latest', {
      params: {
        symbol: token.toUpperCase(),
        convert: 'USD',
      },
    });

    const data = response.data.data[token.toUpperCase()];
    if (!data) {
      throw new Error(`CoinMarketCap returned no data for ${token}`);
    }

    return {
      price: data.quote.USD.price,
      source: 'coinmarketcap',
      timestamp: new Date(data.quote.USD.last_updated).getTime(),
      confidence: 'high',
    };
  }

  /**
   * Get fallback price (last resort, hardcoded for stablecoins)
   */
  private getFallbackPrice(token: string): TokenPrice {
    const fallbackPrices: Record<string, number> = {
      USDC: 1.0,
      USDT: 1.0,
      DAI: 1.0,
      USDh: 1.0,
      ETH: 2000,
      WETH: 2000,
      BTC: 40000,
      STX: 1.5,
      SOL: 100,
      MATIC: 0.8,
    };

    const price = fallbackPrices[token.toUpperCase()];
    if (price === undefined) {
      throw new Error(`No fallback price for ${token}`);
    }

    logger.warn('Using fallback price', { token, price });

    return {
      price,
      source: 'fallback',
      timestamp: Date.now(),
      confidence: 'low',
    };
  }

  /**
   * Check if cached price is still valid
   */
  private isPriceValid(cached: CachedPrice): boolean {
    const age = (Date.now() - cached.cachedAt) / 1000;
    const threshold = STALENESS_THRESHOLDS[cached.confidence];
    return age < threshold;
  }

  /**
   * Get all cached prices
   */
  getAllCachedPrices(): Record<string, TokenPrice> {
    const prices: Record<string, TokenPrice> = {};
    this.priceCache.forEach((value, key) => {
      prices[key] = {
        price: value.price,
        source: value.source,
        timestamp: value.timestamp,
        confidence: value.confidence,
      };
    });
    return prices;
  }

  /**
   * Force refresh a specific token price
   */
  async refreshPrice(token: string): Promise<TokenPrice> {
    // Clear cache
    this.priceCache.delete(token.toUpperCase());
    
    try {
      const redis = getRedis();
      await redis.del(`price:${token.toUpperCase()}`);
    } catch (error) {
      // Ignore Redis errors
    }

    return this.fetchPrice(token);
  }
}

// Singleton instance
let priceOracleInstance: PriceOracle | null = null;

export function getPriceOracle(): PriceOracle {
  if (!priceOracleInstance) {
    priceOracleInstance = new PriceOracle();
  }
  return priceOracleInstance;
}

export default PriceOracle;

