/**
 * Base Listener
 * Abstract base class for blockchain event listeners
 * with persistent block tracking and reliable event handling
 */

import { ChainEvent, Chain } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { getPriceOracle } from '@shared/utils/priceOracle';
import { getRedis } from '@shared/utils/redis';
import { db } from './db';

export interface ListenerConfig {
  chain: Chain;
  rpcUrl: string;
  addresses: string[];
  confirmationsRequired: number;
  onPayment: (event: ChainEvent) => Promise<void>;
  startBlock?: number;
  batchSize?: number;
  pollInterval?: number;
}

interface BlockCheckpoint {
  chain: Chain;
  lastProcessedBlock: number;
  lastProcessedAt: Date;
  eventsProcessed: number;
}

interface ProcessingStats {
  blocksProcessed: number;
  eventsDetected: number;
  eventsConfirmed: number;
  errors: number;
  startTime: Date;
  lastActivity: Date;
}

export abstract class BaseListener {
  protected config: ListenerConfig;
  protected isRunning: boolean = false;
  protected lastProcessedBlock: number = 0;
  protected processingStats: ProcessingStats;
  protected pendingEvents: Map<string, ChainEvent> = new Map();
  protected confirmationCheckInterval?: NodeJS.Timeout;

  constructor(config: ListenerConfig) {
    this.config = {
      batchSize: 100,
      pollInterval: 12000, // 12 seconds default
      ...config,
    };

    this.processingStats = {
      blocksProcessed: 0,
      eventsDetected: 0,
      eventsConfirmed: 0,
      errors: 0,
      startTime: new Date(),
      lastActivity: new Date(),
    };
  }

  /**
   * Initialize listener with persisted state
   */
  async initialize(): Promise<void> {
    // Load last processed block from database
    const checkpoint = await this.loadCheckpoint();
    
    if (checkpoint) {
      this.lastProcessedBlock = checkpoint.lastProcessedBlock;
      logger.info('Loaded checkpoint', {
        chain: this.config.chain,
        lastBlock: this.lastProcessedBlock,
      });
    } else if (this.config.startBlock) {
      this.lastProcessedBlock = this.config.startBlock;
    } else {
      // Start from current block - 100 to catch recent events
      this.lastProcessedBlock = await this.getCurrentBlockNumber() - 100;
    }

    // Load pending events that need confirmation
    await this.loadPendingEvents();
  }

  /**
   * Start the listener
   */
  abstract start(): Promise<void>;

  /**
   * Stop the listener
   */
  abstract stop(): Promise<void>;

  /**
   * Process a specific block
   */
  abstract processBlock(blockNumber: number): Promise<void>;

  /**
   * Get current block number from chain
   */
  abstract getCurrentBlockNumber(): Promise<number>;

  /**
   * Handle detected event
   */
  protected async handleEvent(event: ChainEvent): Promise<void> {
    this.processingStats.eventsDetected++;
    this.processingStats.lastActivity = new Date();

    // Check if event has enough confirmations
    if (event.confirmations >= this.config.confirmationsRequired) {
      await this.confirmEvent(event);
    } else {
      // Store for confirmation checking
      await this.storePendingEvent(event);
    }
  }

  /**
   * Confirm and process event
   */
  protected async confirmEvent(event: ChainEvent): Promise<void> {
    const eventKey = this.getEventKey(event);

    try {
      // Check if already processed
      const isProcessed = await this.isEventProcessed(eventKey);
      if (isProcessed) {
        logger.debug('Event already processed, skipping', { eventKey });
        return;
      }

      // Mark as processing
      await this.markEventProcessing(eventKey);

      // Call the payment handler
      await this.config.onPayment(event);

      // Mark as completed
      await this.markEventCompleted(eventKey, event);

      this.processingStats.eventsConfirmed++;

      // Remove from pending
      this.pendingEvents.delete(eventKey);
      await this.removePendingEvent(eventKey);

      logger.info('Event confirmed and processed', {
        chain: event.chain,
        txHash: event.txHash,
        amount: event.amount,
        amountUSD: event.amountUSD,
      });
    } catch (error) {
      this.processingStats.errors++;
      logger.error('Event processing failed', {
        eventKey,
        error: (error as Error).message,
      });

      // Mark as failed for retry
      await this.markEventFailed(eventKey, error as Error);
    }
  }

  /**
   * Store pending event for confirmation tracking
   */
  protected async storePendingEvent(event: ChainEvent): Promise<void> {
    const eventKey = this.getEventKey(event);
    this.pendingEvents.set(eventKey, event);

    try {
      const redis = getRedis();
      await redis.hSet(
        `pending_events:${this.config.chain}`,
        eventKey,
        JSON.stringify(event)
      );
    } catch (error) {
      logger.warn('Failed to store pending event in Redis', { eventKey, error });
    }

    // Also store in database for persistence
    try {
      await db.query(
        `INSERT INTO pending_events (
          event_key, chain, tx_hash, block_number, event_data, 
          confirmations_required, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (event_key) DO UPDATE SET
          confirmations_required = $6`,
        [
          eventKey,
          event.chain,
          event.txHash,
          event.blockNumber,
          JSON.stringify(event),
          this.config.confirmationsRequired,
        ]
      );
    } catch (error) {
      logger.warn('Failed to store pending event in DB', { eventKey, error });
    }
  }

  /**
   * Load pending events from storage
   */
  protected async loadPendingEvents(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT * FROM pending_events 
         WHERE chain = $1 AND status = 'pending'`,
        [this.config.chain]
      );

      for (const row of result.rows) {
        const event: ChainEvent = JSON.parse(row.event_data);
        this.pendingEvents.set(row.event_key, event);
      }

      logger.info('Loaded pending events', {
        chain: this.config.chain,
        count: this.pendingEvents.size,
      });
    } catch (error) {
      logger.warn('Failed to load pending events', { error });
    }
  }

  /**
   * Remove pending event from storage
   */
  protected async removePendingEvent(eventKey: string): Promise<void> {
    try {
      const redis = getRedis();
      await redis.hDel(`pending_events:${this.config.chain}`, eventKey);
    } catch (error) {
      // Ignore Redis errors
    }

    try {
      await db.query(
        `DELETE FROM pending_events WHERE event_key = $1`,
        [eventKey]
      );
    } catch (error) {
      logger.warn('Failed to remove pending event from DB', { eventKey, error });
    }
  }

  /**
   * Start confirmation checking for pending events
   */
  protected startConfirmationChecker(): void {
    // Check pending events every 30 seconds
    this.confirmationCheckInterval = setInterval(async () => {
      await this.checkPendingConfirmations();
    }, 30000);
  }

  /**
   * Stop confirmation checker
   */
  protected stopConfirmationChecker(): void {
    if (this.confirmationCheckInterval) {
      clearInterval(this.confirmationCheckInterval);
      this.confirmationCheckInterval = undefined;
    }
  }

  /**
   * Check confirmations for pending events
   */
  protected async checkPendingConfirmations(): Promise<void> {
    if (this.pendingEvents.size === 0) return;

    const currentBlock = await this.getCurrentBlockNumber();

    for (const [eventKey, event] of this.pendingEvents) {
      const confirmations = currentBlock - event.blockNumber;
      event.confirmations = confirmations;

      if (confirmations >= this.config.confirmationsRequired) {
        await this.confirmEvent(event);
      }
    }
  }

  /**
   * Save checkpoint to database
   */
  protected async saveCheckpoint(): Promise<void> {
    try {
      await db.query(
        `INSERT INTO listener_checkpoints (
          chain, last_processed_block, events_processed, updated_at
        ) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (chain) DO UPDATE SET
          last_processed_block = $2,
          events_processed = listener_checkpoints.events_processed + $3,
          updated_at = NOW()`,
        [
          this.config.chain,
          this.lastProcessedBlock,
          this.processingStats.eventsConfirmed,
        ]
      );

      // Also save to Redis for fast access
      try {
        const redis = getRedis();
        await redis.set(
          `checkpoint:${this.config.chain}`,
          this.lastProcessedBlock.toString()
        );
      } catch (redisError) {
        // Ignore Redis errors, DB is primary
      }
    } catch (error) {
      logger.error('Failed to save checkpoint', { 
        chain: this.config.chain, 
        error 
      });
    }
  }

  /**
   * Load checkpoint from database
   */
  protected async loadCheckpoint(): Promise<BlockCheckpoint | null> {
    // Try Redis first
    try {
      const redis = getRedis();
      const cached = await redis.get(`checkpoint:${this.config.chain}`);
      if (cached) {
        return {
          chain: this.config.chain,
          lastProcessedBlock: parseInt(cached),
          lastProcessedAt: new Date(),
          eventsProcessed: 0,
        };
      }
    } catch (error) {
      // Fall through to DB
    }

    // Load from database
    try {
      const result = await db.query(
        `SELECT * FROM listener_checkpoints WHERE chain = $1`,
        [this.config.chain]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          chain: row.chain,
          lastProcessedBlock: row.last_processed_block,
          lastProcessedAt: row.updated_at,
          eventsProcessed: row.events_processed,
        };
      }
    } catch (error) {
      logger.warn('Failed to load checkpoint from DB', { error });
    }

    return null;
  }

  /**
   * Check if event was already processed
   */
  protected async isEventProcessed(eventKey: string): Promise<boolean> {
    try {
      const result = await db.query(
        `SELECT id FROM processed_events WHERE event_key = $1`,
        [eventKey]
      );
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark event as processing
   */
  protected async markEventProcessing(eventKey: string): Promise<void> {
    try {
      await db.query(
        `INSERT INTO processed_events (event_key, chain, status, started_at)
         VALUES ($1, $2, 'processing', NOW())
         ON CONFLICT (event_key) DO UPDATE SET status = 'processing'`,
        [eventKey, this.config.chain]
      );
    } catch (error) {
      logger.warn('Failed to mark event processing', { eventKey, error });
    }
  }

  /**
   * Mark event as completed
   */
  protected async markEventCompleted(eventKey: string, event: ChainEvent): Promise<void> {
    try {
      await db.query(
        `UPDATE processed_events 
         SET status = 'completed', 
             tx_hash = $2,
             amount = $3,
             amount_usd = $4,
             completed_at = NOW()
         WHERE event_key = $1`,
        [eventKey, event.txHash, event.amount, event.amountUSD]
      );
    } catch (error) {
      logger.warn('Failed to mark event completed', { eventKey, error });
    }
  }

  /**
   * Mark event as failed
   */
  protected async markEventFailed(eventKey: string, error: Error): Promise<void> {
    try {
      await db.query(
        `UPDATE processed_events 
         SET status = 'failed', 
             error_message = $2,
             failed_at = NOW()
         WHERE event_key = $1`,
        [eventKey, error.message]
      );
    } catch (dbError) {
      logger.warn('Failed to mark event failed', { eventKey, dbError });
    }
  }

  /**
   * Generate unique event key
   */
  protected getEventKey(event: ChainEvent): string {
    return `${event.chain}:${event.txHash}:${event.to}:${event.amount}`;
  }

  /**
   * Convert token amount to USD
   */
  protected async convertToUSD(symbol: string, amount: string): Promise<number> {
    try {
      const priceOracle = getPriceOracle();
      return await priceOracle.convertToUSD(symbol, amount);
    } catch (error) {
      logger.warn('Price conversion failed, using fallback', { symbol, error });
      // Fallback prices
      const fallbackPrices: Record<string, number> = {
        ETH: 2000,
        WETH: 2000,
        USDC: 1,
        USDT: 1,
        DAI: 1,
        STX: 1.5,
        SOL: 100,
        BTC: 40000,
        MATIC: 0.8,
      };
      const price = fallbackPrices[symbol.toUpperCase()] || 0;
      return parseFloat(amount) * price;
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.processingStats };
  }

  /**
   * Get pending events count
   */
  getPendingCount(): number {
    return this.pendingEvents.size;
  }

  /**
   * Get last processed block
   */
  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  /**
   * Check if listener is healthy
   */
  isHealthy(): boolean {
    const timeSinceActivity = Date.now() - this.processingStats.lastActivity.getTime();
    const maxInactivity = 5 * 60 * 1000; // 5 minutes
    return this.isRunning && timeSinceActivity < maxInactivity;
  }
}

export default BaseListener;
