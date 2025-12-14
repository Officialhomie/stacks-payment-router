import { Route, RouteStep } from '@shared/types';
import { GasAbstractor } from './gas/GasAbstractor';
import { TransactionSigner } from './signing/TransactionSigner';
import { RetryManager } from './retry/RetryManager';
import { DexCalldataProvider } from './providers/DexCalldataProvider';
import { logger } from '@shared/utils/logger';
import { db } from './db';
import { ethers } from 'ethers';

export class ExecutionService {
  private gasAbstractor: GasAbstractor;
  private transactionSigner: TransactionSigner;
  private retryManager: RetryManager;
  private dexCalldataProvider: DexCalldataProvider;

  constructor() {
    this.gasAbstractor = new GasAbstractor();
    this.transactionSigner = new TransactionSigner();
    this.retryManager = new RetryManager();
    this.dexCalldataProvider = new DexCalldataProvider();
  }

  async executeRoute(route: Route, paymentIntentId: string): Promise<string> {
    logger.info('Executing route', { routeId: route.id, paymentIntentId });

    const txHashes: string[] = [];

    try {
      // Update route status
      await db.query('UPDATE routes SET status = $1 WHERE id = $2', ['executing', route.id]);

      // Execute each step
      for (const step of route.steps) {
        const txHash = await this.executeStep(step, paymentIntentId);
        txHashes.push(txHash);

        // Wait for confirmation before next step
        await this.waitForConfirmation(step.fromChain, txHash);
      }

      // Update route status
      await db.query(
        'UPDATE routes SET status = $1, executed_at = NOW(), execution_tx_hash = $2 WHERE id = $3',
        ['completed', txHashes[txHashes.length - 1], route.id]
      );

      return txHashes[txHashes.length - 1]; // Return final tx hash
    } catch (error) {
      logger.error('Route execution failed', error);
      await db.query('UPDATE routes SET status = $1 WHERE id = $2', ['failed', route.id]);

      // Retry logic
      return await this.retryManager.retry(route, paymentIntentId, error as Error);
    }
  }

  private async executeStep(step: RouteStep, paymentIntentId: string): Promise<string> {
    logger.info('Executing step', { step, paymentIntentId });

    // Get gas wallet for chain
    const gasWallet = await this.gasAbstractor.getGasWallet(step.fromChain);

    // Estimate gas
    const gasEstimate = await this.gasAbstractor.estimateGas(step);

    // Build transaction
    const tx = await this.buildTransaction(step, gasWallet.address, gasEstimate);

    // Sign transaction
    const signedTx = await this.transactionSigner.sign(tx, gasWallet as ethers.Wallet);

    // Submit transaction
    const txHash = await this.submitTransaction(step.fromChain, signedTx);

    // Log transaction
    await this.logTransaction(paymentIntentId, step, txHash);

    return txHash;
  }

  private async buildTransaction(
    step: RouteStep,
    fromAddress: string,
    gasEstimate: number
  ): Promise<ethers.TransactionRequest> {
    switch (step.type) {
      case 'swap':
        return await this.buildSwapTransaction(step, fromAddress, gasEstimate);
      case 'bridge':
        return await this.buildBridgeTransaction(step, fromAddress, gasEstimate);
      case 'transfer':
        return await this.buildTransferTransaction(step, fromAddress, gasEstimate);
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  private async buildSwapTransaction(
    step: RouteStep,
    fromAddress: string,
    gasEstimate: number
  ): Promise<ethers.TransactionRequest> {
    try {
      // Get swap calldata from DEX aggregator
      const calldata = await this.dexCalldataProvider.getSwapCalldata(
        step,
        fromAddress,
        step.estimatedSlippage || 0.01
      );

      // Get the router address for the provider
      const routerAddress = this.getRouterAddress(step.provider, step.fromChain);

      return {
        to: routerAddress,
        data: calldata,
        gasLimit: gasEstimate,
        value: step.fromToken === 'ETH' ? BigInt(step.amount) : 0n,
      };
    } catch (error) {
      logger.error('Failed to build swap transaction', { step, error });
      throw error;
    }
  }

  private getRouterAddress(provider: string, chain: string): string {
    // Router addresses for DEX aggregators
    const routers: Record<string, Record<string, string>> = {
      '1inch': {
        ethereum: '0x1111111254EEB25477B68fb85Ed929f73A960582',
        arbitrum: '0x1111111254EEB25477B68fb85Ed929f73A960582',
        base: '0x1111111254EEB25477B68fb85Ed929f73A960582',
      },
      'lifi': {
        ethereum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
        arbitrum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
      },
      'socket': {
        ethereum: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
        arbitrum: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
      },
    };

    return routers[provider]?.[chain] || provider;
  }

  private async buildBridgeTransaction(
    step: RouteStep,
    fromAddress: string,
    gasEstimate: number
  ): Promise<ethers.TransactionRequest> {
    try {
      // Get bridge calldata
      const calldata = await this.dexCalldataProvider.getBridgeCalldata(step, fromAddress);

      return {
        to: step.provider,
        data: calldata,
        gasLimit: gasEstimate,
        value: step.fromToken === 'ETH' ? BigInt(step.amount) : 0n,
      };
    } catch (error) {
      logger.error('Failed to build bridge transaction', { step, error });
      throw error;
    }
  }

  private async buildTransferTransaction(
    step: RouteStep,
    fromAddress: string,
    gasEstimate: number
  ): Promise<any> {
    // Build transfer transaction
    return {
      to: step.toTokenAddress,
      data: '0x', // Would contain transfer calldata
      gasLimit: gasEstimate,
      value: 0,
    };
  }

  private async waitForConfirmation(chain: string, txHash: string): Promise<void> {
    logger.info('Waiting for confirmation', { chain, txHash });
    
    const provider = this.getProvider(chain);
    if (!provider) {
      throw new Error(`No provider for chain: ${chain}`);
    }

    try {
      // Wait for transaction receipt with confirmations
      const receipt = await provider.waitForTransaction(txHash, 3); // 3 confirmations
      
      if (!receipt || receipt.status === 0) {
        throw new Error(`Transaction failed: ${txHash}`);
      }

      logger.info('Transaction confirmed', { chain, txHash, blockNumber: receipt.blockNumber });
    } catch (error) {
      logger.error('Transaction confirmation failed', { chain, txHash, error });
      throw error;
    }
  }

  private async submitTransaction(chain: string, signedTx: string): Promise<string> {
    logger.info('Submitting transaction', { chain });
    
    // Get RPC provider for chain
    const provider = this.getProvider(chain);
    
    if (!provider) {
      throw new Error(`No provider configured for chain: ${chain}`);
    }

    try {
      // Submit transaction (signedTx is a hex string)
      const txResponse = await provider.broadcastTransaction(signedTx);
      logger.info('Transaction submitted', { chain, txHash: txResponse.hash });
      return txResponse.hash;
    } catch (error) {
      logger.error('Transaction submission failed', { chain, error });
      throw error;
    }
  }

  private getProvider(chain: string): ethers.JsonRpcProvider | null {
    const rpcUrls: Record<string, string> = {
      ethereum: process.env.ETH_RPC_URL || '',
      arbitrum: process.env.ARB_RPC_URL || '',
      base: process.env.BASE_RPC_URL || '',
    };

    const rpcUrl = rpcUrls[chain];
    if (!rpcUrl) {
      return null;
    }

    return new ethers.JsonRpcProvider(rpcUrl);
  }

  private async logTransaction(
    paymentIntentId: string,
    step: RouteStep,
    txHash: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO transaction_logs (
        payment_intent_id, chain, tx_hash, tx_type, status
      ) VALUES ($1, $2, $3, $4, $5)`,
      [paymentIntentId, step.fromChain, txHash, step.type, 'pending']
    );
  }
}

