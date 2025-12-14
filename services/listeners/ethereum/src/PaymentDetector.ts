/**
 * Payment Detector
 *
 * Monitors Ethereum blockchain for incoming payments
 * When payment detected, marks it on Stacks smart contract
 */

import { ethers } from 'ethers';
import { logger } from '@shared/utils/logger';
import { getStacksIntegration } from './StacksIntegration';

export interface PaymentIntent {
  intentId: string;
  paymentAddress: string;
  expectedAmount: string; // in wei
  agentAddress: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface DetectedPayment {
  intentId: string;
  txHash: string;
  from: string;
  to: string;
  amount: string;
  blockNumber: number;
  timestamp: number;
}

export class PaymentDetector {
  private provider: ethers.providers.JsonRpcProvider;
  private monitoredAddresses: Map<string, PaymentIntent> = new Map();
  private detectedPayments: Set<string> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private lastCheckedBlock: number = 0;

  constructor(rpcUrl: string) {
    if (!rpcUrl) {
      throw new Error('Ethereum RPC URL is required');
    }

    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    logger.info('PaymentDetector initialized', { rpcUrl });
  }

  /**
   * Start monitoring for payments
   */
  async start(pollIntervalMs: number = 15000): Promise<void> {
    try {
      // Get current block number
      this.lastCheckedBlock = await this.provider.getBlockNumber();

      logger.info('Starting payment monitoring', {
        startBlock: this.lastCheckedBlock,
        pollInterval: `${pollIntervalMs}ms`
      });

      // Poll for new transactions
      this.pollInterval = setInterval(async () => {
        await this.checkForPayments();
      }, pollIntervalMs);

      logger.info('Payment detector started');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start payment detector', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Payment detector stopped');
    }
  }

  /**
   * Add payment intent to monitor
   */
  addPaymentIntent(intent: PaymentIntent): void {
    const address = intent.paymentAddress.toLowerCase();
    this.monitoredAddresses.set(address, intent);

    logger.info('Added payment intent to monitor', {
      intentId: intent.intentId,
      address,
      expectedAmount: ethers.utils.formatEther(intent.expectedAmount)
    });
  }

  /**
   * Remove payment intent from monitoring
   */
  removePaymentIntent(address: string): void {
    const normalized = address.toLowerCase();
    this.monitoredAddresses.delete(normalized);
    logger.info('Removed payment intent from monitoring', { address });
  }

  /**
   * Check for new payments
   */
  private async checkForPayments(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();

      if (currentBlock <= this.lastCheckedBlock) {
        return; // No new blocks
      }

      logger.debug('Checking for payments', {
        fromBlock: this.lastCheckedBlock + 1,
        toBlock: currentBlock
      });

      // Check each monitored address
      for (const [address, intent] of this.monitoredAddresses.entries()) {
        await this.checkAddressForPayment(address, intent, this.lastCheckedBlock + 1, currentBlock);
      }

      this.lastCheckedBlock = currentBlock;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error checking for payments', { error: errorMessage });
    }
  }

  /**
   * Check specific address for payments
   */
  private async checkAddressForPayment(
    address: string,
    intent: PaymentIntent,
    fromBlock: number,
    toBlock: number
  ): Promise<void> {
    try {
      // Check if address received any ETH by scanning blocks
      // Note: ethers v5 doesn't have getHistory, so we scan blocks manually
      for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
        const block = await this.provider.getBlockWithTransactions(blockNum);
        if (!block || !block.transactions) continue;

        for (const tx of block.transactions) {
          // Skip if already detected
          if (this.detectedPayments.has(tx.hash)) {
            continue;
          }

          // Verify transaction is to our address
          if (tx.to?.toLowerCase() !== address) {
            continue;
          }

          // Verify transaction has value
          if (!tx.value || tx.value.isZero()) {
            continue;
          }

          // Wait for confirmations
          const confirmations = await tx.wait(1);
          if (!confirmations) {
            continue;
          }

          logger.info('Payment detected!', {
            intentId: intent.intentId,
            txHash: tx.hash,
            from: tx.from,
            to: tx.to,
            amount: ethers.utils.formatEther(tx.value),
            blockNumber: tx.blockNumber
          });

          // Mark as detected
          this.detectedPayments.add(tx.hash);

          // Create detected payment object
          const payment: DetectedPayment = {
            intentId: intent.intentId,
            txHash: tx.hash,
            from: tx.from,
            to: tx.to!,
            amount: tx.value.toString(),
            blockNumber: tx.blockNumber!,
            timestamp: Date.now()
          };

          // Process payment
          await this.processDetectedPayment(payment);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error checking address for payment', {
        address,
        intentId: intent.intentId,
        error: errorMessage
      });
    }
  }

  /**
   * Process detected payment
   */
  private async processDetectedPayment(payment: DetectedPayment): Promise<void> {
    try {
      logger.info('Processing detected payment', {
        intentId: payment.intentId,
        txHash: payment.txHash
      });

      // Call Stacks smart contract to mark as detected
      const stacksIntegration = getStacksIntegration();
      const stacksTxId = await stacksIntegration.markPaymentDetected(
        payment.intentId,
        payment.txHash
      );

      logger.info('Payment marked on Stacks', {
        intentId: payment.intentId,
        ethTxHash: payment.txHash,
        stacksTxId
      });

      // Remove from monitoring (payment detected)
      const intent = Array.from(this.monitoredAddresses.values())
        .find(i => i.intentId === payment.intentId);

      if (intent) {
        this.removePaymentIntent(intent.paymentAddress);
      }

      // TODO: Send webhook notification
      // TODO: Update database

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to process detected payment', {
        intentId: payment.intentId,
        txHash: payment.txHash,
        error: errorMessage
      });

      // Don't remove from monitoring on error - will retry
    }
  }

  /**
   * Get current balance of address
   */
  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return balance.toString();
  }

  /**
   * Get transaction by hash
   */
  async getTransaction(txHash: string): Promise<ethers.providers.TransactionResponse | null> {
    return await this.provider.getTransaction(txHash);
  }

  /**
   * Check if address has received payment
   */
  async hasReceivedPayment(address: string, minAmount?: string): Promise<boolean> {
    try {
      const balance = await this.provider.getBalance(address);

      if (minAmount) {
        const minBigNumber = ethers.BigNumber.from(minAmount);
        return balance.gte(minBigNumber);
      }

      return balance.gt(0);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error checking if address received payment', {
        address,
        error: errorMessage
      });
      return false;
    }
  }

  /**
   * Get monitored addresses count
   */
  getMonitoredCount(): number {
    return this.monitoredAddresses.size;
  }

  /**
   * Get all monitored intents
   */
  getMonitoredIntents(): PaymentIntent[] {
    return Array.from(this.monitoredAddresses.values());
  }

  /**
   * Check provider connection
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Singleton instance
 */
let paymentDetector: PaymentDetector | null = null;

export function initPaymentDetector(rpcUrl: string): PaymentDetector {
  if (!paymentDetector) {
    paymentDetector = new PaymentDetector(rpcUrl);
  }
  return paymentDetector;
}

export function getPaymentDetector(): PaymentDetector {
  if (!paymentDetector) {
    throw new Error('PaymentDetector not initialized. Call initPaymentDetector first.');
  }
  return paymentDetector;
}
