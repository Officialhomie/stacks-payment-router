import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';
import { RoutingEngine } from '@services/router';
import { PaymentIntent, Chain, Token } from '@shared/types';
import { getPriceOracle } from '@shared/utils/priceOracle';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';

export class QuoteService {
  private routingEngine: RoutingEngine;

  constructor() {
    this.routingEngine = new RoutingEngine();
  }

  async getQuote(data: {
    sourceChain: string;
    sourceToken: string;
    amount: string;
    destinationToken?: string;
    agentId?: string;
  }) {
    logger.info('Quote requested', data);

    // Convert amount to USD using price oracle
    const amountUSD = await this.convertToUSD(
      data.sourceToken,
      data.amount,
      data.sourceChain as Chain
    );

    // Create a temporary payment intent for routing
    const intent: PaymentIntent = {
      id: uuidv4(),
      agentId: data.agentId || '',
      sourceChain: data.sourceChain as Chain,
      sourceToken: data.sourceToken as Token,
      amount: data.amount,
      amountUSD,
      destinationToken: (data.destinationToken as Token) || 'USDh',
      status: 'pending',
      paymentAddress: '',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    try {
      // Get routes from routing engine
      const bestRoute = await this.routingEngine.findOptimalRoute(intent);

      // Store quote in database
      const quoteId = uuidv4();
      await db.query(
        `INSERT INTO routes (
          id, payment_intent_id, route_type, steps, estimated_gas_cost_usd,
          estimated_slippage, estimated_time_seconds, total_cost_usd, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          quoteId,
          intent.id,
          bestRoute.routeType,
          JSON.stringify(bestRoute.steps),
          bestRoute.estimatedGasCostUSD,
          bestRoute.estimatedSlippage,
          bestRoute.estimatedTimeSeconds,
          bestRoute.totalCostUSD,
          'pending',
        ]
      );

      return {
        id: quoteId,
        inputAmount: data.amount,
        inputToken: data.sourceToken,
        inputChain: data.sourceChain,
        inputAmountUSD: amountUSD,
        outputToken: data.destinationToken || 'USDh',
        outputAmountUSD: amountUSD - bestRoute.totalCostUSD, // Net after fees
        routes: [bestRoute],
        bestRoute,
        expiresAt: new Date(Date.now() + 30 * 1000), // 30 seconds
        createdAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get quote', error);
      const err: AppError = error as AppError;
      err.statusCode = err.statusCode || 500;
      throw err;
    }
  }

  /**
   * Convert token amount to USD using price oracle
   */
  private async convertToUSD(token: string, amount: string, chain: Chain): Promise<number> {
    const priceOracle = getPriceOracle();
    
    // Get token decimals (default to 18 for most ERC-20 tokens)
    const decimals = this.getTokenDecimals(token);
    const normalizedAmount = parseFloat(amount) / Math.pow(10, decimals);

    // Get token price
    let price: number;

    // Check if it's a native token
    const nativeTokens: Record<string, Chain> = {
      'ETH': 'ethereum',
      'MATIC': 'polygon',
      'STX': 'stacks',
      'SOL': 'solana',
      'BTC': 'bitcoin',
    };

    if (nativeTokens[token.toUpperCase()]) {
      price = await priceOracle.getNativeTokenPrice(nativeTokens[token.toUpperCase()]);
    } else {
      // Get price for the specific token
      price = await priceOracle.getTokenPrice(token, chain);
    }

    return normalizedAmount * price;
  }

  /**
   * Get token decimals
   */
  private getTokenDecimals(token: string): number {
    const decimals: Record<string, number> = {
      'ETH': 18,
      'WETH': 18,
      'USDC': 6,
      'USDT': 6,
      'USDh': 6,
      'USDA': 6,
      'DAI': 18,
      'WBTC': 8,
      'STX': 6,
      'MATIC': 18,
      'SOL': 9,
      'BTC': 8,
    };

    return decimals[token.toUpperCase()] || 18;
  }

  async getQuoteDetails(quoteId: string) {
    const result = await db.query('SELECT * FROM routes WHERE id = $1', [quoteId]);

    if (result.rows.length === 0) {
      return null;
    }

    const route = result.rows[0];
    return {
      id: route.id,
      route: {
        ...route,
        steps: JSON.parse(route.steps),
      },
    };
  }
}
