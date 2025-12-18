/**
 * Settlement Service
 * Handles payment settlements and admin operations
 */

import { db } from '../db';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface PendingPayment {
  intentId: string;
  agentId: string;
  agentAddress: string;
  sourceChain: string;
  sourceToken: string;
  amount: string;
  amountUSD: number;
  paymentAddress: string;
  txHash?: string;
  blockNumber?: number;
  detectedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface SettlementResult {
  intentId: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

export class SettlementService {
  /**
   * Get pending settlements (payments with status 'detected')
   */
  async getPendingSettlements(): Promise<PendingPayment[]> {
    const result = await db.query(
      `SELECT 
        pi.intent_id,
        pi.agent_id,
        a.agent_id as agent_agent_id,
        a.stacks_address as agent_address,
        pi.source_chain,
        pi.source_token,
        pi.amount,
        pi.amount_usd,
        pi.payment_address,
        pe.tx_hash,
        pe.block_number,
        pe.detected_at,
        pi.created_at,
        pi.expires_at
      FROM payment_intents pi
      JOIN agents a ON pi.agent_id = a.id
      LEFT JOIN payment_events pe ON pi.id = pe.payment_intent_id
      WHERE pi.status = 'detected'
      ORDER BY pe.detected_at ASC, pi.created_at ASC`
    );

    return result.rows.map((row) => ({
      intentId: row.intent_id,
      agentId: row.agent_agent_id,
      agentAddress: row.agent_address,
      sourceChain: row.source_chain,
      sourceToken: row.source_token,
      amount: row.amount.toString(),
      amountUSD: parseFloat(row.amount_usd),
      paymentAddress: row.payment_address,
      txHash: row.tx_hash,
      blockNumber: row.block_number ? parseInt(row.block_number) : undefined,
      detectedAt: row.detected_at,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * Batch settle multiple payments
   */
  async batchSettle(intentIds: string[], autoWithdraw: boolean): Promise<SettlementResult[]> {
    const results: SettlementResult[] = [];

    for (const intentId of intentIds) {
      try {
        const txHash = await this.settlePayment(intentId, autoWithdraw);
        results.push({
          intentId,
          success: true,
          txHash,
        });
      } catch (error) {
        logger.error(`Settlement failed for intent ${intentId}`, error);
        results.push({
          intentId,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return results;
  }

  /**
   * Settle a single payment
   * TODO: This should call the Stacks contract to complete settlement
   */
  async settlePayment(intentId: string, autoWithdraw: boolean): Promise<string> {
    // Get payment intent
    const intentResult = await db.query(
      'SELECT * FROM payment_intents WHERE intent_id = $1',
      [intentId]
    );

    if (intentResult.rows.length === 0) {
      throw new Error(`Payment intent not found: ${intentId}`);
    }

    const intent = intentResult.rows[0];

    if (intent.status !== 'detected') {
      throw new Error(`Payment intent is not in 'detected' status: ${intent.status}`);
    }

    // TODO: Call payment-router-v2.complete-settlement contract
    // For now, we'll just update the status
    // In production, this should:
    // 1. Call the Stacks contract to complete settlement
    // 2. Handle auto-withdraw if requested
    // 3. Update the settlements table
    // 4. Update payment_intents status to 'settled'

    const mockTxHash = `0x${Math.random().toString(16).substring(2, 66)}`;

    // Update payment intent status
    await db.query(
      'UPDATE payment_intents SET status = $1, completed_at = NOW() WHERE intent_id = $2',
      ['settled', intentId]
    );

    // Create settlement record
    await db.query(
      `INSERT INTO settlements (
        payment_intent_id,
        agent_id,
        source_amount,
        source_token,
        usdh_amount,
        conversion_rate,
        fees_usd,
        gas_cost_usd,
        net_amount_usdh,
        deposited_to_vault,
        status,
        created_at,
        completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        intent.id,
        intent.agent_id,
        intent.amount,
        intent.source_token,
        intent.amount_usd, // Assuming 1:1 conversion for now
        1.0, // Conversion rate
        0, // Fees (to be calculated)
        0, // Gas cost (to be calculated)
        intent.amount_usd, // Net amount
        !autoWithdraw, // If auto-withdraw, don't deposit to vault
        'completed',
      ]
    );

    logger.info(`Settlement completed for intent ${intentId}`, { txHash: mockTxHash });

    return mockTxHash;
  }
}

