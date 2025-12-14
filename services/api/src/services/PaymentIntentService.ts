import { getDb } from '@shared/utils/db';
import { logger } from '@shared/utils/logger';
import { PaymentIntent, Chain } from '@shared/types';
import { getHDWalletManager } from '@shared/utils/addressGeneration';
import { v4 as uuidv4 } from 'uuid';

export class PaymentIntentService {
  private hdWalletManager = getHDWalletManager();

  async createIntent(data: {
    agentId: string;
    sourceChain: string;
    sourceToken: string;
    sourceTokenAddress?: string;
    amount: string;
    amountUsd: string;
    expiresIn: number;
  }): Promise<PaymentIntent> {
    const db = getDb();

    // Get agent to generate payment address
    const agentResult = await db.query(
      'SELECT id, stacks_address, agent_index FROM agents WHERE agent_id = $1',
      [data.agentId]
    );

    if (agentResult.rows.length === 0) {
      throw new Error('Agent not found');
    }

    const agent = agentResult.rows[0];
    const intentId = uuidv4();
    const expiresAt = new Date(Date.now() + data.expiresIn * 1000);

    // Get the proper payment address for this chain from the agent's addresses
    const paymentAddress = await this.getPaymentAddressForChain(
      agent.id,
      agent.agent_index,
      agent.stacks_address,
      data.sourceChain as Chain
    );

    const result = await db.query(
      `INSERT INTO payment_intents (
        agent_id, intent_id, source_chain, source_token, source_token_address,
        amount, amount_usd, destination_token, payment_address, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        agent.id,
        intentId,
        data.sourceChain,
        data.sourceToken,
        data.sourceTokenAddress || null,
        data.amount,
        data.amountUsd,
        'USDh',
        paymentAddress,
        expiresAt,
      ]
    );

    logger.info('Payment intent created', { intentId, agentId: data.agentId, paymentAddress });

    return this.mapToPaymentIntent(result.rows[0]);
  }

  async getIntent(intentId: string): Promise<PaymentIntent | null> {
    const db = getDb();
    const result = await db.query(
      'SELECT * FROM payment_intents WHERE intent_id = $1',
      [intentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToPaymentIntent(result.rows[0]);
  }

  async updateIntentStatus(intentId: string, status: string, routeId?: string): Promise<void> {
    const db = getDb();
    await db.query(
      'UPDATE payment_intents SET status = $1, route_id = $2 WHERE intent_id = $3',
      [status, routeId || null, intentId]
    );
  }

  /**
   * Get or derive payment address for a specific chain
   */
  private async getPaymentAddressForChain(
    agentDbId: number,
    agentIndex: number,
    stacksAddress: string,
    chain: Chain
  ): Promise<string> {
    const db = getDb();

    // First check if address already exists in DB
    const existingResult = await db.query(
      `SELECT address FROM agent_payment_addresses 
       WHERE agent_id = $1 AND chain = $2`,
      [agentDbId, chain]
    );

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0].address;
    }

    // Derive new address using HD wallet manager
    const addresses = this.hdWalletManager.deriveAllAddresses(
      agentIndex,
      [chain],
      stacksAddress
    );

    const newAddress = addresses[chain];

    // Store the new address
    await db.query(
      `INSERT INTO agent_payment_addresses (agent_id, chain, address)
       VALUES ($1, $2, $3)
       ON CONFLICT (agent_id, chain) DO UPDATE SET address = $3`,
      [agentDbId, chain, newAddress]
    );

    return newAddress;
  }

  private mapToPaymentIntent(row: any): PaymentIntent {
    return {
      id: row.id,
      intentId: row.intent_id,
      agentId: row.agent_id,
      sourceChain: row.source_chain as any,
      sourceToken: row.source_token as any,
      sourceTokenAddress: row.source_token_address,
      amount: row.amount?.toString() || '0',
      amountUSD: parseFloat(row.amount_usd?.toString() || '0'),
      destinationToken: row.destination_token as any,
      status: row.status as any,
      paymentAddress: row.payment_address,
      quoteId: row.quote_id,
      routeId: row.route_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      completedAt: row.completed_at,
      metadata: row.metadata || {},
    };
  }
}
