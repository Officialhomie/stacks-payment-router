/**
 * Ethereum Listener Service - Main Entry Point
 *
 * MVP Version - Week 1, Day 1
 *
 * This service:
 * 1. Monitors Ethereum blockchain for incoming payments
 * 2. Marks payments as detected on Stacks smart contracts
 * 3. Tracks payment intents in database
 */

import dotenv from 'dotenv';
import { logger } from '@shared/utils/logger';
import { initAddressGenerator, getAddressGenerator } from './AddressGenerator';
import { initStacksIntegration, getStacksIntegration } from './StacksIntegration';
import { initPaymentDetector, getPaymentDetector, PaymentIntent } from './PaymentDetector';

// Load environment variables
dotenv.config();

class EthereumListenerService {
  private isRunning = false;

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting Ethereum Listener Service (MVP)');

      // Validate environment variables
      this.validateEnv();

      // 1. Initialize Address Generator
      logger.info('Initializing Address Generator...');
      initAddressGenerator(process.env.HD_WALLET_MNEMONIC!);
      const addressGen = getAddressGenerator();
      logger.info(`Master address: ${addressGen.getMasterAddress()}`);

      // 2. Initialize Stacks Integration
      logger.info('Initializing Stacks Integration...');
      initStacksIntegration({
        network: (process.env.STACKS_NETWORK as 'testnet' | 'mainnet') || 'testnet',
        senderKey: process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY!,
        paymentRouterContract: process.env.PAYMENT_ROUTER_CONTRACT!,
        agentRegistryContract: process.env.AGENT_REGISTRY_CONTRACT!,
        yieldVaultContract: process.env.YIELD_VAULT_CONTRACT!,
      });

      // 3. Initialize Payment Detector
      logger.info('Initializing Payment Detector...');
      const detector = initPaymentDetector(process.env.ETH_RPC_URL!);

      // Test Ethereum connection
      const connected = await detector.checkConnection();
      if (!connected) {
        throw new Error('Failed to connect to Ethereum RPC');
      }
      logger.info('✅ Connected to Ethereum RPC');

      // 4. Start monitoring
      await detector.start(15000); // Poll every 15 seconds

      this.isRunning = true;
      logger.info('✅ Ethereum Listener Service started successfully');
      logger.info(`Monitoring ${detector.getMonitoredCount()} payment addresses`);

      // For MVP: Load any pending payments from database and start monitoring
      // await this.loadPendingPayments();

    } catch (error: any) {
      logger.error('Failed to start Ethereum Listener Service', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Stopping Ethereum Listener Service...');

    const detector = getPaymentDetector();
    detector.stop();

    this.isRunning = false;
    logger.info('Ethereum Listener Service stopped');
  }

  /**
   * Add a new payment intent to monitor
   * This would typically be called via API when a payment intent is created
   */
  async monitorPaymentIntent(intent: PaymentIntent): Promise<void> {
    const detector = getPaymentDetector();
    detector.addPaymentIntent(intent);

    logger.info('Added payment intent to monitoring', {
      intentId: intent.intentId,
      address: intent.paymentAddress
    });
  }

  /**
   * Load pending payments from database and start monitoring them
   * TODO: Implement database integration
   */
  private async loadPendingPayments(): Promise<void> {
    logger.info('Loading pending payments from database...');

    // TODO: Query database for payments in 'pending' status
    // const pendingPayments = await db.payments.findMany({
    //   where: { status: 'pending' }
    // });

    // for (const payment of pendingPayments) {
    //   await this.monitorPaymentIntent({
    //     intentId: payment.intentId,
    //     paymentAddress: payment.paymentAddress,
    //     expectedAmount: payment.expectedAmount,
    //     agentAddress: payment.agentAddress,
    //     createdAt: payment.createdAt,
    //     expiresAt: payment.expiresAt
    //   });
    // }

    logger.info('Pending payments loaded');
  }

  /**
   * Validate required environment variables
   */
  private validateEnv(): void {
    const required = [
      'ETH_RPC_URL',
      'HD_WALLET_MNEMONIC',
      'STACKS_SETTLEMENT_WALLET_PRIVATE_KEY',
      'PAYMENT_ROUTER_CONTRACT',
      'AGENT_REGISTRY_CONTRACT',
      'YIELD_VAULT_CONTRACT'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  getStatus(): { running: boolean; monitored: number } {
    const detector = this.isRunning ? getPaymentDetector() : null;
    return {
      running: this.isRunning,
      monitored: detector ? detector.getMonitoredCount() : 0
    };
  }
}

// Singleton instance
const service = new EthereumListenerService();

// Main entry point
async function main() {
  // Graceful shutdown handlers
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });

  try {
    await service.start();

    // Keep process running
    logger.info('Service is running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Fatal error starting service', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export for testing/external use
export { service as ethereumListenerService };
export { EthereumListenerService };
