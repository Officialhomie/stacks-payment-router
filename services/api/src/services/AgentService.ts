/**
 * Agent Service
 * Handles agent registration, management, and withdrawal operations
 */

import { db } from '../db';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';
import { getHDWalletManager } from '@shared/utils/addressGeneration';
import { Chain } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';
import {
  makeContractCall,
  broadcastTransaction,
  standardPrincipalCV,
  uintCV,
  noneCV,
  AnchorMode,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  createAssetInfo,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';

// Withdrawal request interface
interface WithdrawalRequest {
  agentId: string;
  amount: string;
  destinationAddress?: string;
  destinationChain?: Chain;
}

// Withdrawal response
interface WithdrawalResponse {
  withdrawalId: string;
  agentId: string;
  amount: string;
  fee: string;
  netAmount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  estimatedCompletionTime?: Date;
  txHash?: string;
}

// USDh token configuration
const USDH_DECIMALS = 6;

export class AgentService {
  private hdWalletManager = getHDWalletManager();
  private network: StacksMainnet | StacksTestnet;
  private usdhContractAddress: string;
  private usdhContractName: string;
  private settlementPrivateKey: string;
  private settlementAddress: string;

  constructor() {
    const networkType = process.env.STACKS_NETWORK || 'testnet';
    this.network = networkType === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
    
    const usdhContract = process.env.USDH_CONTRACT || 
      (networkType === 'mainnet' 
        ? 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usdh'
        : 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-usdh');
    
    [this.usdhContractAddress, this.usdhContractName] = usdhContract.split('.');
    this.settlementPrivateKey = process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY || '';
    this.settlementAddress = process.env.STACKS_SETTLEMENT_WALLET_ADDRESS || '';
  }

  /**
   * Register a new agent
   */
  async register(data: {
    stacksAddress: string;
    agentId: string;
    enabledChains: string[];
    minPaymentAmount?: string;
    autoWithdraw?: boolean;
    settlementPreference?: string;
  }) {
    // Check if agent already exists
    const existing = await db.query(
      'SELECT id FROM agents WHERE stacks_address = $1 OR agent_id = $2',
      [data.stacksAddress, data.agentId]
    );

    if (existing.rows.length > 0) {
      const err: AppError = new Error('Agent already registered');
      err.statusCode = 409;
      err.code = 'AGENT_EXISTS';
      throw err;
    }

    // Get agent index for HD derivation
    const indexResult = await db.query('SELECT COUNT(*) as count FROM agents');
    const agentIndex = parseInt(indexResult.rows[0].count) + 1;

    // Generate deterministic payment addresses for each chain
    const paymentAddresses = this.hdWalletManager.deriveAllAddresses(
      agentIndex,
      data.enabledChains as Chain[],
      data.stacksAddress
    );

    // Insert agent
    const result = await db.query(
      `INSERT INTO agents (
        stacks_address, agent_id, agent_index, enabled_chains, min_payment_amount,
        auto_withdraw, settlement_preference
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        data.stacksAddress,
        data.agentId,
        agentIndex,
        JSON.stringify(data.enabledChains),
        data.minPaymentAmount || '0',
        data.autoWithdraw || false,
        data.settlementPreference || 'usdh',
      ]
    );

    const agentDbId = result.rows[0].id;

    // Store payment addresses in database
    for (const [chain, address] of Object.entries(paymentAddresses)) {
      await db.query(
        `INSERT INTO agent_payment_addresses (agent_id, chain, address)
         VALUES ($1, $2, $3)
         ON CONFLICT (agent_id, chain) DO UPDATE SET address = $3`,
        [agentDbId, chain, address]
      );
    }

    // Initialize balance
    await db.query(
      `INSERT INTO agent_balances (agent_id, principal_usdh, accrued_yield_usdh, total_usdh) 
       VALUES ($1, 0, 0, 0)`,
      [agentDbId]
    );

    logger.info(`Agent registered: ${data.agentId}`, { paymentAddresses });

    return {
      agentId: result.rows[0].agent_id,
      stacksAddress: result.rows[0].stacks_address,
      paymentAddresses,
      enabledChains: data.enabledChains,
    };
  }

  /**
   * Get payment addresses for an agent
   */
  async getPaymentAddresses(agentId: string): Promise<Record<string, string>> {
    const result = await db.query(
      `SELECT chain, address FROM agent_payment_addresses apa
       JOIN agents a ON apa.agent_id = a.id
       WHERE a.agent_id = $1`,
      [agentId]
    );

    const addresses: Record<string, string> = {};
    for (const row of result.rows) {
      addresses[row.chain] = row.address;
    }

    return addresses;
  }

  /**
   * Get agent by agent ID
   */
  async getAgent(agentId: string) {
    const result = await db.query(
      `SELECT a.*, ab.principal_usdh, ab.accrued_yield_usdh, ab.total_usdh as balance_usdh
       FROM agents a
       LEFT JOIN agent_balances ab ON a.id = ab.agent_id
       WHERE a.agent_id = $1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const agent = result.rows[0];
    return {
      ...agent,
      enabled_chains: JSON.parse(agent.enabled_chains || '[]'),
    };
  }

  /**
   * Get agent balance
   */
  async getBalance(agentId: string) {
    const result = await db.query(
      `SELECT ab.*, a.agent_id
       FROM agent_balances ab
       JOIN agents a ON ab.agent_id = a.id
       WHERE a.agent_id = $1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const balance = result.rows[0];
    const yieldInfo = this.calculateYieldFromTimestamp(
      parseFloat(balance.principal_usdh || '0'),
      balance.last_yield_calculation
    );

    return {
      agentId: balance.agent_id,
      principal: parseFloat(balance.principal_usdh || '0'),
      accruedYield: yieldInfo.accruedYield,
      totalBalance: parseFloat(balance.principal_usdh || '0') + yieldInfo.accruedYield,
      lastYieldCalculation: balance.last_yield_calculation,
      lastDepositAt: balance.last_deposit_at,
      lastWithdrawalAt: balance.last_withdrawal_at,
    };
  }

  /**
   * Calculate accrued yield based on timestamp
   */
  private calculateYieldFromTimestamp(
    principal: number, 
    lastCalculation: Date | null
  ): { accruedYield: number; apy: number } {
    if (!lastCalculation || principal <= 0) {
      return { accruedYield: 0, apy: 0.20 };
    }

    const apy = 0.20; // 20% APY
    const now = new Date();
    const daysSince = (now.getTime() - new Date(lastCalculation).getTime()) / (1000 * 60 * 60 * 24);
    const dailyRate = apy / 365;
    const accruedYield = principal * dailyRate * daysSince;

    return { accruedYield, apy };
  }

  /**
   * Get all payment addresses for all agents
   */
  async getAllPaymentAddresses(): Promise<Record<string, string[]>> {
    const result = await db.query(
      `SELECT chain, address FROM agent_payment_addresses`
    );

    const addressesByChain: Record<string, string[]> = {};
    for (const row of result.rows) {
      if (!addressesByChain[row.chain]) {
        addressesByChain[row.chain] = [];
      }
      addressesByChain[row.chain].push(row.address);
    }

    return addressesByChain;
  }

  /**
   * Request a withdrawal
   */
  async withdraw(request: WithdrawalRequest): Promise<WithdrawalResponse> {
    const { agentId, amount, destinationAddress, destinationChain } = request;

    // Get agent and balance
    const agent = await this.getAgent(agentId);
    if (!agent) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const balance = await this.getBalance(agentId);
    const requestedAmount = parseFloat(amount);

    // Validate withdrawal amount
    if (requestedAmount <= 0) {
      const err: AppError = new Error('Invalid withdrawal amount');
      err.statusCode = 400;
      throw err;
    }

    if (requestedAmount > balance.totalBalance) {
      const err: AppError = new Error('Insufficient balance');
      err.statusCode = 400;
      err.code = 'INSUFFICIENT_BALANCE';
      throw err;
    }

    // Calculate fee (1% for instant withdrawals)
    const feeRate = 0.01;
    const fee = requestedAmount * feeRate;
    const netAmount = requestedAmount - fee;

    // Create withdrawal record
    const withdrawalId = uuidv4();
    const destination = destinationAddress || agent.stacks_address;

    await db.query(
      `INSERT INTO withdrawals (
        id, agent_id, amount, fee, net_amount, destination_address, 
        destination_chain, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
      [
        withdrawalId,
        agent.id,
        requestedAmount,
        fee,
        netAmount,
        destination,
        destinationChain || 'stacks',
      ]
    );

    // Start processing withdrawal asynchronously
    this.processWithdrawal(withdrawalId, agent, netAmount, destination, destinationChain)
      .catch((error) => {
        logger.error('Withdrawal processing failed', { withdrawalId, error: (error as Error).message });
      });

    logger.info('Withdrawal requested', {
      withdrawalId,
      agentId,
      amount: requestedAmount,
      fee,
      netAmount,
    });

    return {
      withdrawalId,
      agentId,
      amount,
      fee: fee.toString(),
      netAmount: netAmount.toString(),
      status: 'pending',
      estimatedCompletionTime: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  /**
   * Process withdrawal (async background task)
   */
  private async processWithdrawal(
    withdrawalId: string,
    agent: any,
    netAmount: number,
    destinationAddress: string,
    destinationChain?: Chain
  ): Promise<void> {
    try {
      // Update status to processing
      await db.query(
        `UPDATE withdrawals SET status = 'processing', processing_started_at = NOW() 
         WHERE id = $1`,
        [withdrawalId]
      );

      // Deduct from balance
      await db.query(
        `UPDATE agent_balances 
         SET principal_usdh = principal_usdh - $1,
             total_usdh = total_usdh - $1,
             last_withdrawal_at = NOW(),
             updated_at = NOW()
         WHERE agent_id = $2`,
        [netAmount, agent.id]
      );

      let txHash: string;

      if (destinationChain === 'stacks' || !destinationChain) {
        txHash = await this.executeStacksTransfer(destinationAddress, netAmount);
      } else {
        txHash = await this.executeCrossChainWithdrawal(
          destinationChain,
          destinationAddress,
          netAmount
        );
      }

      // Update withdrawal as completed
      await db.query(
        `UPDATE withdrawals 
         SET status = 'completed', 
             tx_hash = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [txHash, withdrawalId]
      );

      logger.info('Withdrawal completed', { withdrawalId, txHash });
    } catch (error) {
      // Mark as failed
      await db.query(
        `UPDATE withdrawals 
         SET status = 'failed', 
             error_message = $1,
             failed_at = NOW()
         WHERE id = $2`,
        [(error as Error).message, withdrawalId]
      );

      // Refund the balance
      await db.query(
        `UPDATE agent_balances 
         SET principal_usdh = principal_usdh + $1,
             total_usdh = total_usdh + $1,
             updated_at = NOW()
         WHERE agent_id = $2`,
        [netAmount, agent.id]
      );

      throw error;
    }
  }

  /**
   * Execute Stacks USDh transfer using @stacks/transactions
   */
  private async executeStacksTransfer(toAddress: string, amount: number): Promise<string> {
    if (!this.settlementPrivateKey) {
      throw new Error('Settlement wallet private key not configured');
    }

    if (!this.settlementAddress) {
      throw new Error('Settlement wallet address not configured');
    }

    logger.info('Executing Stacks USDh transfer', { toAddress, amount });

    // Convert amount to micro-units (6 decimals)
    const microAmount = BigInt(Math.floor(amount * Math.pow(10, USDH_DECIMALS)));

    // Create post-conditions for safety
    const postConditions = [
      makeStandardFungiblePostCondition(
        this.settlementAddress,
        FungibleConditionCode.LessEqual,
        microAmount,
        createAssetInfo(
          this.usdhContractAddress,
          this.usdhContractName,
          'usdh'
        )
      ),
    ];

    // Build transfer transaction using SIP-010 standard
    const txOptions = {
      contractAddress: this.usdhContractAddress,
      contractName: this.usdhContractName,
      functionName: 'transfer',
      functionArgs: [
        uintCV(microAmount),
        standardPrincipalCV(this.settlementAddress),
        standardPrincipalCV(toAddress),
        noneCV(),
      ],
      senderKey: this.settlementPrivateKey,
      network: this.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
      fee: BigInt(2000),
    };

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, this.network);

    if (broadcastResponse.error) {
      throw new Error(`USDh transfer broadcast failed: ${broadcastResponse.error}`);
    }

    logger.info('USDh transfer broadcast successful', { 
      txId: broadcastResponse.txid, 
      toAddress, 
      amount 
    });

    return broadcastResponse.txid;
  }

  /**
   * Execute cross-chain withdrawal via bridge
   */
  private async executeCrossChainWithdrawal(
    chain: Chain,
    toAddress: string,
    amount: number
  ): Promise<string> {
    logger.info('Cross-chain withdrawal requested', { chain, toAddress, amount });
    
    // Cross-chain withdrawals require:
    // 1. Swap USDh to USDC on Stacks (via Velar/Alex)
    // 2. Bridge USDC to destination chain (via LayerZero/Wormhole)
    // 3. Optionally swap to native token on destination
    
    // This would integrate with:
    // - StacksDexService for the initial swap
    // - DexCalldataProvider for bridge calldata
    // - ExecutionService for executing the bridge transaction
    
    throw new Error(`Cross-chain withdrawal to ${chain} requires bridge integration - use Stacks withdrawal instead`);
  }

  /**
   * Get withdrawal history
   */
  async getWithdrawalHistory(agentId: string, limit: number = 20): Promise<any[]> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const result = await db.query(
      `SELECT * FROM withdrawals 
       WHERE agent_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [agent.id, limit]
    );

    return result.rows;
  }

  /**
   * Get withdrawal by ID
   */
  async getWithdrawal(withdrawalId: string): Promise<any> {
    const result = await db.query(
      `SELECT w.*, a.agent_id 
       FROM withdrawals w
       JOIN agents a ON w.agent_id = a.id
       WHERE w.id = $1`,
      [withdrawalId]
    );

    if (result.rows.length === 0) {
      const err: AppError = new Error('Withdrawal not found');
      err.statusCode = 404;
      throw err;
    }

    return result.rows[0];
  }

  /**
   * Update agent settings
   */
  async updateSettings(agentId: string, settings: {
    minPaymentAmount?: string;
    autoWithdraw?: boolean;
    settlementPreference?: string;
    enabledChains?: string[];
  }): Promise<any> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (settings.minPaymentAmount !== undefined) {
      updates.push(`min_payment_amount = $${paramIndex++}`);
      values.push(settings.minPaymentAmount);
    }

    if (settings.autoWithdraw !== undefined) {
      updates.push(`auto_withdraw = $${paramIndex++}`);
      values.push(settings.autoWithdraw);
    }

    if (settings.settlementPreference !== undefined) {
      updates.push(`settlement_preference = $${paramIndex++}`);
      values.push(settings.settlementPreference);
    }

    if (settings.enabledChains !== undefined) {
      updates.push(`enabled_chains = $${paramIndex++}`);
      values.push(JSON.stringify(settings.enabledChains));

      // Generate new payment addresses for new chains
      const existingChains = new Set(agent.enabled_chains);
      const newChains = settings.enabledChains.filter((c: string) => !existingChains.has(c));

      if (newChains.length > 0) {
        const newAddresses = this.hdWalletManager.deriveAllAddresses(
          agent.agent_index,
          newChains as Chain[],
          agent.stacks_address
        );

        for (const [chain, address] of Object.entries(newAddresses)) {
          await db.query(
            `INSERT INTO agent_payment_addresses (agent_id, chain, address)
             VALUES ($1, $2, $3)
             ON CONFLICT (agent_id, chain) DO UPDATE SET address = $3`,
            [agent.id, chain, address]
          );
        }
      }
    }

    if (updates.length === 0) {
      return agent;
    }

    updates.push(`updated_at = NOW()`);
    values.push(agent.id);

    await db.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return this.getAgent(agentId);
  }
}

export default AgentService;
