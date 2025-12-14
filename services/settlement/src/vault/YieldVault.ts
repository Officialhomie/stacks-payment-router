/**
 * Yield Vault Service
 * Manages USDh deposits and yield calculations
 * Integrates with on-chain Clarity contract
 */

import { db } from '../db';
import { logger } from '@shared/utils/logger';
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  standardPrincipalCV,
  callReadOnlyFunction,
  cvToJSON,
  ClarityValue,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
import axios from 'axios';

// Vault configuration
interface VaultConfig {
  contractAddress: string;
  contractName: string;
  network: StacksMainnet | StacksTestnet;
  apiUrl: string;
  privateKey: string;
}

// Agent balance from contract
interface OnChainBalance {
  principal: bigint;
  accruedYield: bigint;
  total: bigint;
  depositedAtBlock: number;
  lastYieldClaimBlock: number;
  totalYieldEarned: bigint;
  pendingWithdrawal: bigint;
  withdrawalUnlockBlock: number;
}

// Vault statistics from contract
interface VaultStats {
  totalDeposited: bigint;
  totalYieldDistributed: bigint;
  totalProtocolFees: bigint;
  totalAgents: number;
  lastYieldDistributionBlock: number;
}

export class YieldVault {
  private config: VaultConfig;

  constructor() {
    const networkType = process.env.STACKS_NETWORK || 'testnet';
    const network = networkType === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
    
    const contractId = process.env.YIELD_VAULT_CONTRACT || 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-vault';
    const [contractAddress, contractName] = contractId.split('.');

    this.config = {
      contractAddress,
      contractName,
      network,
      apiUrl: process.env.STACKS_RPC_URL || 'https://api.testnet.hiro.so',
      privateKey: process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY || '',
    };
  }

  /**
   * Deposit USDh to vault for an agent
   */
  async deposit(agentId: string, amount: number): Promise<string> {
    logger.info('Depositing to yield vault', { agentId, amount });

    // Get agent's Stacks address
    const agentResult = await db.query(
      'SELECT stacks_address FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      throw new Error('Agent not found');
    }

    const agentStacksAddress = agentResult.rows[0].stacks_address;

    // Call on-chain deposit function
    if (this.config.privateKey) {
      try {
        const txId = await this.executeDeposit(agentStacksAddress, amount);
        
        // Update database
        await this.updateDatabaseBalance(agentId, amount, 'deposit');
        
        return txId;
      } catch (error) {
        logger.error('On-chain deposit failed', { error, agentId, amount });
        // Fall back to database only
      }
    }

    // Update database (fallback or if no private key)
    await this.updateDatabaseBalance(agentId, amount, 'deposit');
    
    return 'db-only-deposit';
  }

  /**
   * Execute on-chain deposit
   */
  private async executeDeposit(agentAddress: string, amount: number): Promise<string> {
    const txOptions = {
      contractAddress: this.config.contractAddress,
      contractName: this.config.contractName,
      functionName: 'deposit-for-agent',
      functionArgs: [
        standardPrincipalCV(agentAddress),
        uintCV(BigInt(Math.floor(amount * 1e6))), // USDh has 6 decimals
      ],
      senderKey: this.config.privateKey,
      network: this.config.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: BigInt(10000),
    };

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, this.config.network);

    if (broadcastResponse.error) {
      throw new Error(`Deposit broadcast failed: ${broadcastResponse.error}`);
    }

    logger.info('Vault deposit broadcast', { txId: broadcastResponse.txid });
    return broadcastResponse.txid;
  }

  /**
   * Withdraw from vault
   */
  async withdraw(agentId: string, amount: number): Promise<string> {
    logger.info('Withdrawing from yield vault', { agentId, amount });

    // Check balance
    const balance = await this.getBalance(agentId);
    
    if (balance.total < amount) {
      throw new Error('Insufficient balance');
    }

    // Get agent's Stacks address
    const agentResult = await db.query(
      'SELECT stacks_address FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      throw new Error('Agent not found');
    }

    const agentStacksAddress = agentResult.rows[0].stacks_address;

    // For instant withdrawal, use the instant-withdraw function (operator only)
    if (this.config.privateKey) {
      try {
        const txId = await this.executeInstantWithdraw(agentStacksAddress, amount);
        
        // Update database
        await this.updateDatabaseBalance(agentId, -amount, 'withdrawal');
        
        return txId;
      } catch (error) {
        logger.error('On-chain withdrawal failed', { error, agentId, amount });
      }
    }

    // Update database
    await this.updateDatabaseBalance(agentId, -amount, 'withdrawal');
    
    return 'db-only-withdrawal';
  }

  /**
   * Execute instant withdrawal (for authorized operators)
   */
  private async executeInstantWithdraw(agentAddress: string, amount: number): Promise<string> {
    const txOptions = {
      contractAddress: this.config.contractAddress,
      contractName: this.config.contractName,
      functionName: 'instant-withdraw',
      functionArgs: [
        standardPrincipalCV(agentAddress),
        uintCV(BigInt(Math.floor(amount * 1e6))),
      ],
      senderKey: this.config.privateKey,
      network: this.config.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
      fee: BigInt(10000),
    };

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, this.config.network);

    if (broadcastResponse.error) {
      throw new Error(`Withdrawal broadcast failed: ${broadcastResponse.error}`);
    }

    logger.info('Vault withdrawal broadcast', { txId: broadcastResponse.txid });
    return broadcastResponse.txid;
  }

  /**
   * Get agent balance (combines on-chain and database)
   */
  async getBalance(agentId: string): Promise<{
    principal: number;
    accruedYield: number;
    total: number;
    pendingWithdrawal: number;
  }> {
    // Try to get on-chain balance first
    const agentResult = await db.query(
      'SELECT stacks_address FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) {
      return { principal: 0, accruedYield: 0, total: 0, pendingWithdrawal: 0 };
    }

    const stacksAddress = agentResult.rows[0].stacks_address;

    try {
      const onChainBalance = await this.getOnChainBalance(stacksAddress);
      return {
        principal: Number(onChainBalance.principal) / 1e6,
        accruedYield: Number(onChainBalance.accruedYield) / 1e6,
        total: Number(onChainBalance.total) / 1e6,
        pendingWithdrawal: Number(onChainBalance.pendingWithdrawal) / 1e6,
      };
    } catch (error) {
      logger.warn('Failed to get on-chain balance, using database', { error });
    }

    // Fall back to database
    const dbResult = await db.query(
      'SELECT * FROM agent_balances WHERE agent_id = (SELECT id FROM agents WHERE agent_id = $1)',
      [agentId]
    );

    if (dbResult.rows.length === 0) {
      return { principal: 0, accruedYield: 0, total: 0, pendingWithdrawal: 0 };
    }

    const dbBalance = dbResult.rows[0];
    const accruedYield = this.calculateAccruedYield(
      parseFloat(dbBalance.principal_usdh || '0'),
      dbBalance.last_yield_calculation
    );

    return {
      principal: parseFloat(dbBalance.principal_usdh || '0'),
      accruedYield,
      total: parseFloat(dbBalance.principal_usdh || '0') + accruedYield,
      pendingWithdrawal: 0,
    };
  }

  /**
   * Get balance from on-chain contract
   */
  private async getOnChainBalance(stacksAddress: string): Promise<OnChainBalance> {
    const result = await callReadOnlyFunction({
      contractAddress: this.config.contractAddress,
      contractName: this.config.contractName,
      functionName: 'get-balance',
      functionArgs: [standardPrincipalCV(stacksAddress)],
      network: this.config.network,
      senderAddress: this.config.contractAddress,
    });

    const json = cvToJSON(result);

    // Parse the response
    if (json.success && json.value) {
      const data = json.value;
      return {
        principal: BigInt(data.principal?.value || '0'),
        accruedYield: BigInt(data['accrued-yield']?.value || '0'),
        total: BigInt(data.total?.value || '0'),
        depositedAtBlock: parseInt(data['deposited-at-block']?.value || '0'),
        lastYieldClaimBlock: parseInt(data['last-yield-claim-block']?.value || '0'),
        totalYieldEarned: BigInt(data['total-yield-earned']?.value || '0'),
        pendingWithdrawal: BigInt(data['pending-withdrawal']?.value || '0'),
        withdrawalUnlockBlock: parseInt(data['withdrawal-unlock-block']?.value || '0'),
      };
    }

    throw new Error('Failed to parse on-chain balance');
  }

  /**
   * Get vault statistics
   */
  async getVaultStats(): Promise<VaultStats> {
    try {
      const result = await callReadOnlyFunction({
        contractAddress: this.config.contractAddress,
        contractName: this.config.contractName,
        functionName: 'get-vault-stats',
        functionArgs: [],
        network: this.config.network,
        senderAddress: this.config.contractAddress,
      });

      const json = cvToJSON(result);

      if (json.value) {
        return {
          totalDeposited: BigInt(json.value['total-deposited']?.value || '0'),
          totalYieldDistributed: BigInt(json.value['total-yield-distributed']?.value || '0'),
          totalProtocolFees: BigInt(json.value['total-protocol-fees']?.value || '0'),
          totalAgents: parseInt(json.value['total-agents']?.value || '0'),
          lastYieldDistributionBlock: parseInt(json.value['last-yield-distribution-block']?.value || '0'),
        };
      }
    } catch (error) {
      logger.warn('Failed to get on-chain vault stats', { error });
    }

    // Fall back to database
    const result = await db.query(`
      SELECT 
        COALESCE(SUM(principal_usdh), 0) as total_deposited,
        COALESCE(SUM(accrued_yield_usdh), 0) as total_yield,
        COUNT(*) as total_agents
      FROM agent_balances
    `);

    const row = result.rows[0];
    return {
      totalDeposited: BigInt(Math.floor(parseFloat(row.total_deposited) * 1e6)),
      totalYieldDistributed: BigInt(Math.floor(parseFloat(row.total_yield) * 1e6)),
      totalProtocolFees: 0n,
      totalAgents: parseInt(row.total_agents),
      lastYieldDistributionBlock: 0,
    };
  }

  /**
   * Calculate accrued yield based on time
   */
  calculateAccruedYield(principal: number, lastCalculation: Date | null): number {
    if (!lastCalculation || principal <= 0) return 0;

    const now = new Date();
    const daysSince = (now.getTime() - new Date(lastCalculation).getTime()) / (1000 * 60 * 60 * 24);
    
    // 20% APY
    const dailyRate = 0.2 / 365;
    return principal * dailyRate * daysSince;
  }

  /**
   * Update database balance
   */
  private async updateDatabaseBalance(
    agentId: string,
    amount: number,
    type: 'deposit' | 'withdrawal'
  ): Promise<void> {
    if (type === 'deposit') {
      await db.query(
        `UPDATE agent_balances 
         SET principal_usdh = principal_usdh + $1,
             total_usdh = principal_usdh + accrued_yield_usdh + $1,
             last_deposit_at = NOW(),
             updated_at = NOW()
         WHERE agent_id = (SELECT id FROM agents WHERE agent_id = $2)`,
        [amount, agentId]
      );
    } else {
      await db.query(
        `UPDATE agent_balances 
         SET principal_usdh = principal_usdh - $1,
             total_usdh = principal_usdh + accrued_yield_usdh - $1,
             last_withdrawal_at = NOW(),
             updated_at = NOW()
         WHERE agent_id = (SELECT id FROM agents WHERE agent_id = $2)`,
        [Math.abs(amount), agentId]
      );
    }
  }

  /**
   * Sync database with on-chain state
   */
  async syncWithChain(agentId: string): Promise<void> {
    const agentResult = await db.query(
      'SELECT id, stacks_address FROM agents WHERE agent_id = $1',
      [agentId]
    );

    if (agentResult.rows.length === 0) return;

    const { id: dbAgentId, stacks_address: stacksAddress } = agentResult.rows[0];

    try {
      const onChainBalance = await this.getOnChainBalance(stacksAddress);

      await db.query(
        `UPDATE agent_balances 
         SET principal_usdh = $1,
             accrued_yield_usdh = $2,
             total_usdh = $3,
             last_yield_calculation = NOW(),
             updated_at = NOW()
         WHERE agent_id = $4`,
        [
          Number(onChainBalance.principal) / 1e6,
          Number(onChainBalance.accruedYield) / 1e6,
          Number(onChainBalance.total) / 1e6,
          dbAgentId,
        ]
      );

      logger.info('Balance synced with chain', { agentId });
    } catch (error) {
      logger.error('Failed to sync balance with chain', { agentId, error });
    }
  }
}

export default YieldVault;
