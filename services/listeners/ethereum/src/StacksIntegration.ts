/**
 * Stacks Integration
 *
 * Handles all interactions with Stacks blockchain smart contracts
 * - Mark payments as detected
 * - Complete settlements
 * - Query payment status
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  stringAsciiCV,
  uintCV,
  fetchCallReadOnlyFunction,
  cvToValue
} from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET, StacksNetwork } from '@stacks/network';
import { logger } from '@shared/utils/logger';

export interface StacksConfig {
  network: 'testnet' | 'mainnet';
  senderKey: string;
  paymentRouterContract: string;
  agentRegistryContract: string;
  yieldVaultContract: string;
}

export class StacksIntegration {
  private network: StacksNetwork;
  private senderKey: string;
  private paymentRouterContract: { address: string; name: string };
  private agentRegistryContract: { address: string; name: string };
  private yieldVaultContract: { address: string; name: string };

  constructor(config: StacksConfig) {
    this.network = config.network === 'mainnet'
      ? STACKS_MAINNET
      : STACKS_TESTNET;

    this.senderKey = config.senderKey;

    // Parse contract addresses (format: ADDRESS.CONTRACT-NAME)
    this.paymentRouterContract = this.parseContract(config.paymentRouterContract);
    this.agentRegistryContract = this.parseContract(config.agentRegistryContract);
    this.yieldVaultContract = this.parseContract(config.yieldVaultContract);

    logger.info('StacksIntegration initialized', {
      network: config.network,
      paymentRouter: config.paymentRouterContract
    });
  }

  /**
   * Mark a payment as detected on-chain
   */
  async markPaymentDetected(
    intentId: string,
    sourceTxHash: string
  ): Promise<string> {
    try {
      logger.info('Marking payment as detected', {
        intentId,
        sourceTxHash
      });

      const txOptions = {
        contractAddress: this.paymentRouterContract.address,
        contractName: this.paymentRouterContract.name,
        functionName: 'mark-payment-detected',
        functionArgs: [
          stringAsciiCV(intentId),
          stringAsciiCV(sourceTxHash)
        ],
        senderKey: this.senderKey,
        validateWithAbi: false,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: this.network
      });

      if ('error' in broadcastResponse) {
        throw new Error(`Broadcast failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;

      logger.info('Payment marked as detected', {
        intentId,
        stacksTxId: txId
      });

      return txId;
    } catch (error: any) {
      logger.error('Failed to mark payment detected', {
        intentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Complete settlement (manual for MVP)
   */
  async completeSettlement(
    intentId: string,
    usdhAmount: number,
    settlementTxHash: string
  ): Promise<string> {
    try {
      logger.info('Completing settlement', {
        intentId,
        usdhAmount,
        settlementTxHash
      });

      const txOptions = {
        contractAddress: this.paymentRouterContract.address,
        contractName: this.paymentRouterContract.name,
        functionName: 'complete-settlement',
        functionArgs: [
          stringAsciiCV(intentId),
          uintCV(usdhAmount),
          stringAsciiCV(settlementTxHash)
        ],
        senderKey: this.senderKey,
        validateWithAbi: false,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({
        transaction,
        network: this.network
      });

      if ('error' in broadcastResponse) {
        throw new Error(`Broadcast failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;

      logger.info('Settlement completed', {
        intentId,
        stacksTxId: txId
      });

      return txId;
    } catch (error: any) {
      logger.error('Failed to complete settlement', {
        intentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get payment intent details from contract
   */
  async getPaymentIntent(intentId: string): Promise<any> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.paymentRouterContract.address,
        contractName: this.paymentRouterContract.name,
        functionName: 'get-payment-intent',
        functionArgs: [stringAsciiCV(intentId)],
        network: this.network,
        senderAddress: this.paymentRouterContract.address,
      });

      return cvToValue(result);
    } catch (error: any) {
      logger.error('Failed to get payment intent', {
        intentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get agent details from registry
   */
  async getAgent(agentAddress: string): Promise<any> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.agentRegistryContract.address,
        contractName: this.agentRegistryContract.name,
        functionName: 'get-agent',
        functionArgs: [stringAsciiCV(agentAddress)],
        network: this.network,
        senderAddress: this.agentRegistryContract.address,
      });

      return cvToValue(result);
    } catch (error: any) {
      logger.error('Failed to get agent', {
        agentAddress,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get vault balance for agent
   */
  async getVaultBalance(agentAddress: string): Promise<any> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.yieldVaultContract.address,
        contractName: this.yieldVaultContract.name,
        functionName: 'get-balance',
        functionArgs: [stringAsciiCV(agentAddress)],
        network: this.network,
        senderAddress: this.yieldVaultContract.address,
      });

      return cvToValue(result);
    } catch (error: any) {
      logger.error('Failed to get vault balance', {
        agentAddress,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Parse contract identifier into address and name
   */
  private parseContract(contractId: string): { address: string; name: string } {
    const parts = contractId.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid contract ID: ${contractId}`);
    }
    return {
      address: parts[0],
      name: parts[1]
    };
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txId: string, maxAttempts = 30): Promise<boolean> {
    const apiUrl = this.network === STACKS_MAINNET
      ? 'https://api.hiro.so'
      : 'https://api.testnet.hiro.so';

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${apiUrl}/extended/v1/tx/${txId}`);
        const data: any = await response.json();

        if (data.tx_status === 'success') {
          logger.info('Transaction confirmed', { txId });
          return true;
        }

        if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
          logger.error('Transaction failed', { txId, status: data.tx_status });
          return false;
        }

        // Wait 10 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error: any) {
        logger.warn('Error checking transaction status', {
          txId,
          attempt: i + 1,
          error: error.message
        });
      }
    }

    logger.warn('Transaction confirmation timeout', { txId });
    return false;
  }
}

/**
 * Singleton instance
 */
let stacksIntegration: StacksIntegration | null = null;

export function initStacksIntegration(config: StacksConfig): StacksIntegration {
  if (!stacksIntegration) {
    stacksIntegration = new StacksIntegration(config);
  }
  return stacksIntegration;
}

export function getStacksIntegration(): StacksIntegration {
  if (!stacksIntegration) {
    throw new Error('StacksIntegration not initialized. Call initStacksIntegration first.');
  }
  return stacksIntegration;
}
