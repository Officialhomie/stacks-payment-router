/**
 * ChainhooksService
 * Monitors Stacks blockchain for payment-router contract events using Hiro Chainhooks
 */

import {
  ChainhookEventObserver,
  EventObserverOptions,
  ChainhookNodeOptions,
  EventObserverPredicate,
  Payload,
} from '@hirosystems/chainhook-client';
import { logger } from '@shared/utils/logger';
import { ChainhookEvent } from '@shared/types';
import { MetricsTracker } from './MetricsTracker';

export interface ChainhooksServiceConfig {
  // Chainhook observer server settings
  serverHostname: string;
  serverPort: number;
  serverAuthToken: string;
  externalBaseUrl: string;

  // Chainhook node settings
  chainhookNodeUrl: string;

  // Contract settings
  contractAddress: string;
  network: 'mainnet' | 'testnet' | 'devnet';
  startBlock?: number;
}

export class ChainhooksService {
  private observer?: ChainhookEventObserver;
  private metricsTracker: MetricsTracker;
  private config: ChainhooksServiceConfig;
  private predicates: EventObserverPredicate[];

  constructor(config: ChainhooksServiceConfig) {
    this.config = config;
    this.metricsTracker = new MetricsTracker();
    this.predicates = [];
  }

  /**
   * Initialize the chainhooks service
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Chainhooks service', {
      network: this.config.network,
      contract: this.config.contractAddress,
    });

    // Load existing metrics from database
    await this.metricsTracker.loadMetricsFromDatabase();

    // Create predicates for payment-router contract events
    this.predicates = [
      this.createPaymentIntentCreatedPredicate(),
      this.createPaymentDetectedPredicate(),
      this.createPaymentSettledPredicate(),
      this.createPaymentSettledWithWithdrawPredicate(),
    ];

    // Set up the chainhook observer server
    const serverOptions: EventObserverOptions = {
      hostname: this.config.serverHostname,
      port: this.config.serverPort,
      auth_token: this.config.serverAuthToken,
      external_base_url: this.config.externalBaseUrl,
      predicate_disk_file_path: './predicates',
    };

    const chainhookOptions: ChainhookNodeOptions = {
      base_url: this.config.chainhookNodeUrl,
    };

    this.observer = new ChainhookEventObserver(serverOptions, chainhookOptions);

    logger.info('Chainhooks service initialized', {
      predicates: this.predicates.length,
    });
  }

  /**
   * Start the chainhooks observer
   */
  async start(): Promise<void> {
    if (!this.observer) {
      throw new Error('Chainhooks service not initialized. Call initialize() first.');
    }

    logger.info('Starting Chainhooks observer', {
      predicates: this.predicates.length,
    });

    try {
      await this.observer.start(this.predicates, async (payload: Payload) => {
        await this.handleChainhookEvent(payload);
      });

      logger.info('Chainhooks observer started successfully');

      // Set up graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start Chainhooks observer', { error });
      throw error;
    }
  }

  /**
   * Stop the chainhooks observer
   */
  async stop(): Promise<void> {
    if (!this.observer) {
      return;
    }

    logger.info('Stopping Chainhooks observer');

    try {
      await this.observer.close();
      logger.info('Chainhooks observer stopped');
    } catch (error) {
      logger.error('Error stopping Chainhooks observer', { error });
    }
  }

  /**
   * Handle chainhook events
   */
  private async handleChainhookEvent(payload: Payload): Promise<void> {
    try {
      logger.debug('Received chainhook event', { payload });

      // Process events in the payload
      if (!payload.apply || !payload.apply.length) {
        logger.debug('No apply events in payload');
        return;
      }

      for (const block of payload.apply) {
        if (!block.transactions) continue;

        for (const tx of block.transactions) {
          // Check for Stacks transaction metadata
          if (tx.metadata && typeof tx.metadata === 'object') {
            const metadata = tx.metadata as any;
            if (metadata.stacks_transaction && metadata.stacks_transaction.receipt) {
              const receipt = metadata.stacks_transaction.receipt;
              if (receipt.events && Array.isArray(receipt.events)) {
                // Process print events from the contract
                for (const event of receipt.events) {
                  if (event.type === 'print_event' && event.data) {
                    await this.processPrintEvent(event.data, block.block_identifier);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error handling chainhook event', { error });
    }
  }

  /**
   * Process print events from the payment-router contract
   */
  private async processPrintEvent(eventData: any, blockIdentifier: any): Promise<void> {
    try {
      // Parse the event data (Clarity print events)
      const chainhookEvent = this.parseClarityEvent(eventData);

      if (!chainhookEvent.event) {
        logger.debug('No event type in print event', { eventData });
        return;
      }

      logger.info('Processing chainhook event', {
        event: chainhookEvent.event,
        intentId: chainhookEvent.intentId,
        agent: chainhookEvent.agent,
        blockHeight: blockIdentifier.index,
      });

      // Route to appropriate handler
      switch (chainhookEvent.event) {
        case 'payment-intent-created':
          await this.metricsTracker.handlePaymentIntentCreated(chainhookEvent);
          break;
        case 'payment-detected':
          await this.metricsTracker.handlePaymentDetected(chainhookEvent);
          break;
        case 'payment-settled':
          await this.metricsTracker.handlePaymentSettled(chainhookEvent);
          break;
        case 'payment-settled-with-withdraw':
          await this.metricsTracker.handlePaymentSettledWithWithdraw(chainhookEvent);
          break;
        default:
          logger.debug('Unknown event type', { event: chainhookEvent.event });
      }
    } catch (error) {
      logger.error('Error processing print event', { error, eventData });
    }
  }

  /**
   * Parse Clarity event data to ChainhookEvent
   */
  private parseClarityEvent(eventData: any): ChainhookEvent {
    // Clarity events come as nested objects with type information
    // This is a simplified parser - you may need to adjust based on actual event structure
    const event: ChainhookEvent = {
      event: '',
    };

    if (typeof eventData === 'object') {
      for (const [key, value] of Object.entries(eventData)) {
        if (typeof value === 'object' && value !== null && 'value' in value) {
          // Handle Clarity value wrappers
          event[key] = (value as any).value;
        } else {
          event[key] = value;
        }
      }
    }

    return event;
  }

  /**
   * Create predicate for payment-intent-created events
   */
  private createPaymentIntentCreatedPredicate(): EventObserverPredicate {
    return {
      name: 'payment-intent-created',
      version: 1,
      chain: 'stacks',
      networks: {
        [this.config.network]: {
          if_this: {
            scope: 'print_event',
            contract_identifier: this.config.contractAddress,
            contains: 'payment-intent-created',
          },
          start_block: this.config.startBlock,
        },
      },
    };
  }

  /**
   * Create predicate for payment-detected events
   */
  private createPaymentDetectedPredicate(): EventObserverPredicate {
    return {
      name: 'payment-detected',
      version: 1,
      chain: 'stacks',
      networks: {
        [this.config.network]: {
          if_this: {
            scope: 'print_event',
            contract_identifier: this.config.contractAddress,
            contains: 'payment-detected',
          },
          start_block: this.config.startBlock,
        },
      },
    };
  }

  /**
   * Create predicate for payment-settled events
   */
  private createPaymentSettledPredicate(): EventObserverPredicate {
    return {
      name: 'payment-settled',
      version: 1,
      chain: 'stacks',
      networks: {
        [this.config.network]: {
          if_this: {
            scope: 'print_event',
            contract_identifier: this.config.contractAddress,
            contains: 'payment-settled',
          },
          start_block: this.config.startBlock,
        },
      },
    };
  }

  /**
   * Create predicate for payment-settled-with-withdraw events
   */
  private createPaymentSettledWithWithdrawPredicate(): EventObserverPredicate {
    return {
      name: 'payment-settled-with-withdraw',
      version: 1,
      chain: 'stacks',
      networks: {
        [this.config.network]: {
          if_this: {
            scope: 'print_event',
            contract_identifier: this.config.contractAddress,
            contains: 'payment-settled-with-withdraw',
          },
          start_block: this.config.startBlock,
        },
      },
    };
  }

  /**
   * Get metrics tracker
   */
  getMetricsTracker(): MetricsTracker {
    return this.metricsTracker;
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    process.once('unhandledRejection', async (error) => {
      logger.error('Unhandled rejection', { error });
      await shutdown();
    });
    process.once('uncaughtException', async (error) => {
      logger.error('Uncaught exception', { error });
      await shutdown();
    });
  }
}
