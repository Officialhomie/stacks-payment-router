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
   * Get vault statistics for an agent
   */
  async getVaultStats(agentId: string) {
    // First get the agent's database ID
    const agentResult = await db.query(
      'SELECT id FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const agentDbId = agentResult.rows[0].id;
    
    const result = await db.query(
      `SELECT ab.*, a.agent_id
       FROM agent_balances ab
       JOIN agents a ON ab.agent_id = a.id
       WHERE ab.agent_id = $1`,
      [agentDbId]
    );

    if (result.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const balance = result.rows[0];
    const principal = parseFloat(balance.principal_usdh || '0');
    const accruedYield = parseFloat(balance.accrued_yield_usdh || '0');
    const yieldInfo = this.calculateYieldFromTimestamp(
      principal,
      balance.last_yield_calculation
    );

    // Calculate total deposited and withdrawn from settlements and withdrawals
    const depositsResult = await db.query(
      `SELECT COALESCE(SUM(net_amount_usdh), 0) as total_deposited
       FROM settlements
       WHERE agent_id = $1 AND deposited_to_vault = true AND status = 'completed'`,
      [balance.agent_id]
    );

    const withdrawalsResult = await db.query(
      `SELECT COALESCE(SUM(amount_usdh), 0) as total_withdrawn
       FROM withdrawals
       WHERE agent_id = $1 AND status = 'completed'`,
      [balance.agent_id]
    );

    const totalDeposited = parseFloat(depositsResult.rows[0]?.total_deposited || '0');
    const totalWithdrawn = parseFloat(withdrawalsResult.rows[0]?.total_withdrawn || '0');
    const totalBalance = principal + yieldInfo.accruedYield;

    return {
      balance: totalBalance.toFixed(6),
      totalDeposited: totalDeposited.toFixed(6),
      totalWithdrawn: totalWithdrawn.toFixed(6),
      yieldEarned: (accruedYield + yieldInfo.accruedYield).toFixed(6),
      lastYieldClaim: balance.last_yield_calculation || undefined,
    };
  }

  /**
   * Get withdrawal history for an agent
   */
  async getWithdrawalHistory(
    agentId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { limit = 50, offset = 0 } = options;

    // First, get the agent's database ID
    const agentResult = await db.query(
      'SELECT id FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const agentDbId = agentResult.rows[0].id;

    const result = await db.query(
      `SELECT 
        id,
        amount_usdh,
        principal_amount,
        yield_amount,
        tx_hash,
        status,
        requested_at,
        completed_at
      FROM withdrawals
      WHERE agent_id = $1
      ORDER BY requested_at DESC
      LIMIT $2 OFFSET $3`,
      [agentDbId, limit, offset]
    );

    return result.rows.map((row) => ({
      id: row.id,
      amount: row.amount_usdh.toString(),
      principalAmount: row.principal_amount?.toString() || '0',
      yieldAmount: row.yield_amount?.toString() || '0',
      txHash: row.tx_hash,
      status: row.status,
      requestedAt: row.requested_at,
      completedAt: row.completed_at,
    }));
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
    return this.updateAgent(agentId, settings);
  }

  /**
   * Update agent (enhanced version supporting name, description, etc.)
   */
  async updateAgent(agentId: string, updates: {
    name?: string;
    description?: string;
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

    const dbUpdates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Handle metadata updates (name, description)
    let metadata = agent.metadata || {};
    if (updates.name !== undefined || updates.description !== undefined) {
      if (updates.name !== undefined) {
        metadata = { ...metadata, name: updates.name };
      }
      if (updates.description !== undefined) {
        metadata = { ...metadata, description: updates.description };
      }
      dbUpdates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(metadata));
    }

    if (updates.minPaymentAmount !== undefined) {
      dbUpdates.push(`min_payment_amount = $${paramIndex++}`);
      values.push(updates.minPaymentAmount);
    }

    if (updates.autoWithdraw !== undefined) {
      dbUpdates.push(`auto_withdraw = $${paramIndex++}`);
      values.push(updates.autoWithdraw);
    }

    if (updates.settlementPreference !== undefined) {
      dbUpdates.push(`settlement_preference = $${paramIndex++}`);
      values.push(updates.settlementPreference);
    }

    if (updates.enabledChains !== undefined) {
      dbUpdates.push(`enabled_chains = $${paramIndex++}`);
      values.push(JSON.stringify(updates.enabledChains));

      // Generate new payment addresses for new chains
      const existingChains = new Set(agent.enabled_chains || []);
      const newChains = updates.enabledChains.filter((c: string) => !existingChains.has(c));

      if (newChains.length > 0) {
        const agentIndex = agent.agent_index || 0;
        const newAddresses = this.hdWalletManager.deriveAllAddresses(
          agentIndex,
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

    if (dbUpdates.length === 0) {
      return agent;
    }

    dbUpdates.push(`updated_at = NOW()`);
    values.push(agent.id);

    await db.query(
      `UPDATE agents SET ${dbUpdates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return this.getAgent(agentId);
  }

  /**
   * Get payment intents for an agent
   */
  async getAgentPayments(
    agentId: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const { status, limit = 50, offset = 0 } = options;

    // First, get the agent's database ID
    const agentResult = await db.query(
      'SELECT id FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const agentDbId = agentResult.rows[0].id;

    // Build query with optional status filter
    let query = `
      SELECT 
        pi.id,
        pi.intent_id,
        pi.agent_id,
        pi.source_chain,
        pi.source_token,
        pi.source_token_address,
        pi.amount,
        pi.amount_usd,
        pi.destination_token,
        pi.status,
        pi.payment_address,
        pi.quote_id,
        pi.route_id,
        pi.created_at,
        pi.expires_at,
        pi.completed_at,
        pi.metadata,
        pe.tx_hash as payment_tx_hash,
        pe.block_number as payment_block_number,
        pe.confirmed as payment_confirmed
      FROM payment_intents pi
      LEFT JOIN payment_events pe ON pi.id = pe.payment_intent_id
      WHERE pi.agent_id = $1
    `;

    const params: any[] = [agentDbId];
    let paramIndex = 2;

    if (status) {
      query += ` AND pi.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY pi.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Format results to match PaymentIntent type
    return result.rows.map((row) => ({
      id: row.id,
      intentId: row.intent_id,
      agentId: agentId,
      sourceChain: row.source_chain,
      sourceToken: row.source_token,
      sourceTokenAddress: row.source_token_address,
      amount: row.amount.toString(),
      amountUSD: parseFloat(row.amount_usd),
      destinationToken: row.destination_token || 'USDh',
      status: row.status,
      paymentAddress: row.payment_address,
      quoteId: row.quote_id,
      routeId: row.route_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      metadata: row.metadata || {},
      paymentTxHash: row.payment_tx_hash,
      paymentBlockNumber: row.payment_block_number ? parseInt(row.payment_block_number) : undefined,
      paymentConfirmed: row.payment_confirmed || false,
    }));
  }
}

export default AgentService;
