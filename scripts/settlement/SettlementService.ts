/**
 * Settlement Service
 *
 * Handles manual settlement of detected payments
 * For MVP: Admin uses this to complete settlements
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  stringAsciiCV,
  uintCV,
  standardPrincipalCV,
  fetchCallReadOnlyFunction,
  cvToValue
} from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET, StacksNetwork } from '@stacks/network';

export interface PaymentIntent {
  intentId: string;
  agent: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: number;
  expectedUsdh: number;
  paymentAddress: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  detectedAt?: number;
  settledAt?: number;
  sourceTxHash?: string;
  settlementTxHash?: string;
  feesPaid: number;
  netAmount: number;
}

export interface SettlementConfig {
  network: 'testnet' | 'mainnet';
  adminPrivateKey: string;
  paymentRouterContract: string;
  tokenUsdhContract: string;
  yieldVaultContract: string;
}

export class SettlementService {
  private network: StacksNetwork;
  private adminPrivateKey: string;
  private paymentRouter: { address: string; name: string };
  private tokenUsdh: { address: string; name: string };
  private yieldVault: { address: string; name: string };

  constructor(config: SettlementConfig) {
    this.network = config.network === 'mainnet'
      ? STACKS_MAINNET
      : STACKS_TESTNET;

    this.adminPrivateKey = config.adminPrivateKey;
    this.paymentRouter = this.parseContract(config.paymentRouterContract);
    this.tokenUsdh = this.parseContract(config.tokenUsdhContract);
    this.yieldVault = this.parseContract(config.yieldVaultContract);
  }

  /**
   * Get payment intent from smart contract
   */
  async getPaymentIntent(intentId: string): Promise<PaymentIntent | null> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.paymentRouter.address,
        contractName: this.paymentRouter.name,
        functionName: 'get-payment-intent',
        functionArgs: [stringAsciiCV(intentId)],
        network: this.network,
        senderAddress: this.paymentRouter.address,
      });

      const json = cvToValue(result);

      if (!json.success || !json.value) {
        return null;
      }

      const data = json.value.value;

      return {
        intentId,
        agent: data.agent.value,
        sourceChain: data['source-chain'].value,
        sourceToken: data['source-token'].value,
        sourceAmount: parseInt(data['source-amount'].value),
        expectedUsdh: parseInt(data['expected-usdh'].value),
        paymentAddress: data['payment-address'].value,
        status: data.status.value,
        createdAt: parseInt(data['created-at'].value),
        expiresAt: parseInt(data['expires-at'].value),
        detectedAt: data['detected-at'].value ? parseInt(data['detected-at'].value) : undefined,
        settledAt: data['settled-at'].value ? parseInt(data['settled-at'].value) : undefined,
        sourceTxHash: data['source-tx-hash'].value || undefined,
        settlementTxHash: data['settlement-tx-hash'].value || undefined,
        feesPaid: parseInt(data['fees-paid'].value),
        netAmount: parseInt(data['net-amount'].value)
      };
    } catch (error: any) {
      console.error('Error fetching payment intent:', error.message);
      return null;
    }
  }

  /**
   * Complete settlement (MVP - without actual USDh transfer)
   * For MVP, we assume USDh was handled off-chain
   */
  async completeSettlement(
    intentId: string,
    usdhAmount: number,
    settlementTxHash: string = 'manual-settlement'
  ): Promise<string> {
    try {
      console.log(`\n📝 Completing settlement for ${intentId}...`);

      const txOptions = {
        contractAddress: this.paymentRouter.address,
        contractName: this.paymentRouter.name,
        functionName: 'complete-settlement',
        functionArgs: [
          stringAsciiCV(intentId),
          uintCV(usdhAmount),
          stringAsciiCV(settlementTxHash)
        ],
        senderKey: this.adminPrivateKey,
        validateWithAbi: false,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({ transaction, network: this.network });

      if ('error' in broadcastResponse) {
        throw new Error(`Broadcast failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;
      console.log(`✅ Settlement transaction broadcast: ${txId}`);

      return txId;
    } catch (error: any) {
      console.error(`❌ Settlement failed:`, error.message);
      throw error;
    }
  }

  /**
   * Complete settlement with auto-withdraw
   */
  async completeSettlementWithWithdraw(
    intentId: string,
    usdhAmount: number,
    settlementTxHash: string = 'manual-settlement-withdraw'
  ): Promise<string> {
    try {
      console.log(`\n📝 Completing settlement with auto-withdraw for ${intentId}...`);

      const txOptions = {
        contractAddress: this.paymentRouter.address,
        contractName: this.paymentRouter.name,
        functionName: 'complete-settlement-with-withdraw',
        functionArgs: [
          stringAsciiCV(intentId),
          uintCV(usdhAmount),
          stringAsciiCV(settlementTxHash)
        ],
        senderKey: this.adminPrivateKey,
        validateWithAbi: false,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({ transaction, network: this.network });

      if ('error' in broadcastResponse) {
        throw new Error(`Broadcast failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;
      console.log(`✅ Settlement with withdraw transaction broadcast: ${txId}`);

      return txId;
    } catch (error: any) {
      console.error(`❌ Settlement with withdraw failed:`, error.message);
      throw error;
    }
  }

  /**
   * Mint USDh tokens (for testing on testnet)
   */
  async mintUsdh(amount: number, recipient: string): Promise<string> {
    try {
      console.log(`\n💰 Minting ${amount} USDh to ${recipient}...`);

      const txOptions = {
        contractAddress: this.tokenUsdh.address,
        contractName: this.tokenUsdh.name,
        functionName: 'mint',
        functionArgs: [
          uintCV(amount),
          standardPrincipalCV(recipient)
        ],
        senderKey: this.adminPrivateKey,
        validateWithAbi: false,
        network: this.network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      };

      const transaction = await makeContractCall(txOptions);
      const broadcastResponse = await broadcastTransaction({ transaction, network: this.network });

      if ('error' in broadcastResponse) {
        throw new Error(`Mint failed: ${broadcastResponse.error}`);
      }

      const txId = broadcastResponse.txid;
      console.log(`✅ Mint transaction broadcast: ${txId}`);

      return txId;
    } catch (error: any) {
      console.error(`❌ Mint failed:`, error.message);
      throw error;
    }
  }

  /**
   * Get vault balance for agent
   */
  async getVaultBalance(agentAddress: string): Promise<any> {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: this.yieldVault.address,
        contractName: this.yieldVault.name,
        functionName: 'get-balance',
        functionArgs: [standardPrincipalCV(agentAddress)],
        network: this.network,
        senderAddress: this.yieldVault.address,
      });

      return cvToValue(result);
    } catch (error: any) {
      console.error('Error fetching vault balance:', error.message);
      return null;
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txId: string, maxAttempts = 30): Promise<boolean> {
    const apiUrl = this.network === STACKS_MAINNET
      ? 'https://api.hiro.so'
      : 'https://api.testnet.hiro.so';

    console.log(`\n⏳ Waiting for confirmation...`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${apiUrl}/extended/v1/tx/${txId}`);
        const data = await response.json();

        if (data.tx_status === 'success') {
          console.log(`✅ Transaction confirmed!`);
          return true;
        }

        if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
          console.error(`❌ Transaction failed: ${data.tx_status}`);
          return false;
        }

        // Show progress
        if (i % 3 === 0) {
          process.stdout.write('.');
        }

        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error: any) {
        // Continue waiting
      }
    }

    console.log(`\n⚠️ Confirmation timeout`);
    return false;
  }

  /**
   * Parse contract identifier
   */
  private parseContract(contractId: string): { address: string; name: string } {
    const parts = contractId.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid contract ID: ${contractId}`);
    }
    return { address: parts[0], name: parts[1] };
  }

  /**
   * Format USDh amount for display (6 decimals)
   */
  formatUsdh(amount: number): string {
    return (amount / 1_000_000).toFixed(2);
  }

  /**
   * Parse USDh amount from user input
   */
  parseUsdh(amountStr: string): number {
    return Math.floor(parseFloat(amountStr) * 1_000_000);
  }
}
