// Main listener service that coordinates all chain listeners
import { EthereumListener } from '../ethereum/src/EthereumListener';
import { ArbitrumListener } from '../arbitrum/src/ArbitrumListener';
import { StacksListener } from '../stacks/src/StacksListener';
import { ChainEvent } from '@shared/types';
import { ListenerConfig } from '../shared/src/BaseListener';
import { logger } from '@shared/utils/logger';
import { CONFIRMATIONS_REQUIRED } from '@shared/constants/chains';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class ListenerService {
  private listeners: Map<string, any> = new Map();
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.API_URL || 'http://localhost:3000';
  }

  async start() {
    logger.info('Starting listener service');

    // Get payment addresses from API
    const addresses = await this.getPaymentAddresses();

    // Start Ethereum listener
    if (process.env.ETH_RPC_URL) {
      const ethListener = new EthereumListener({
        chain: 'ethereum',
        rpcUrl: process.env.ETH_RPC_URL,
        addresses: addresses.ethereum || [],
        confirmationsRequired: CONFIRMATIONS_REQUIRED.ethereum,
        onPayment: this.handlePayment.bind(this),
      });
      await ethListener.start();
      this.listeners.set('ethereum', ethListener);
    }

    // Start Arbitrum listener
    if (process.env.ARB_RPC_URL) {
      const arbListener = new ArbitrumListener({
        chain: 'arbitrum',
        rpcUrl: process.env.ARB_RPC_URL,
        addresses: addresses.arbitrum || [],
        confirmationsRequired: CONFIRMATIONS_REQUIRED.arbitrum,
        onPayment: this.handlePayment.bind(this),
      });
      await arbListener.start();
      this.listeners.set('arbitrum', arbListener);
    }

    // Start Stacks listener
    if (process.env.STACKS_RPC_URL) {
      const stacksListener = new StacksListener({
        chain: 'stacks',
        rpcUrl: process.env.STACKS_RPC_URL,
        addresses: addresses.stacks || [],
        confirmationsRequired: CONFIRMATIONS_REQUIRED.stacks,
        onPayment: this.handlePayment.bind(this),
      });
      await stacksListener.start();
      this.listeners.set('stacks', stacksListener);
    }

    logger.info(`Started ${this.listeners.size} chain listeners`);
  }

  async stop() {
    logger.info('Stopping listener service');
    for (const [chain, listener] of this.listeners) {
      await listener.stop();
    }
    this.listeners.clear();
  }

  private async handlePayment(event: ChainEvent) {
    try {
      logger.info('Payment detected', {
        chain: event.chain,
        txHash: event.txHash,
        amount: event.amount,
        to: event.to,
      });

      // Send webhook to API service
      await axios.post(`${this.apiUrl}/api/v1/webhooks/payment`, event);
    } catch (error: any) {
      logger.error('Error handling payment', { error: error.message });
    }
  }

  private async getPaymentAddresses(): Promise<Record<string, string[]>> {
    try {
      // Fetch payment addresses from API
      const response = await axios.get(`${this.apiUrl}/api/v1/agents/addresses`);
      
      if (response.data.success && response.data.data) {
        return response.data.data;
      }
      
      return {
        ethereum: [],
        arbitrum: [],
        stacks: [],
      };
    } catch (error: any) {
      logger.error('Error fetching payment addresses', { error: error.message });
      return {
        ethereum: [],
        arbitrum: [],
        stacks: [],
      };
    }
  }
}

// Main entry point
async function main() {
  const service = new ListenerService();

  // Handle graceful shutdown
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

  try {
    await service.start();
    logger.info('Listener service started successfully');
  } catch (error) {
    logger.error('Failed to start listener service', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
