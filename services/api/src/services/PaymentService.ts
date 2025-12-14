import { db } from '../db';
import { logger } from '@shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';
import { AgentService } from './AgentService';

export class PaymentService {
  private agentService: AgentService;

  constructor() {
    this.agentService = new AgentService();
  }

  async createIntent(data: {
    agentId: string;
    sourceChain: string;
    sourceToken: string;
    amount: string;
    amountUSD: number;
  }) {
    // Get agent
    const agentResult = await db.query('SELECT id, stacks_address FROM agents WHERE agent_id = $1', [
      data.agentId,
    ]);

    if (agentResult.rows.length === 0) {
      const err: AppError = new Error('Agent not found');
      err.statusCode = 404;
      throw err;
    }

    const agentId = agentResult.rows[0].id;
    const stacksAddress = agentResult.rows[0].stacks_address;
    const intentId = uuidv4();
    
    // Get payment address for the source chain
    const addresses = await this.agentService.getPaymentAddresses(data.agentId);
    const paymentAddress = addresses[data.sourceChain];
    
    if (!paymentAddress) {
      throw new Error(`No payment address found for chain: ${data.sourceChain}`);
    }
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const result = await db.query(
      `INSERT INTO payment_intents (
        agent_id, intent_id, source_chain, source_token, amount, amount_usd,
        payment_address, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        agentId,
        intentId,
        data.sourceChain,
        data.sourceToken,
        data.amount,
        data.amountUSD,
        paymentAddress,
        expiresAt,
      ]
    );

    logger.info(`Payment intent created: ${intentId}`);

    return result.rows[0];
  }

  async getIntent(intentId: string) {
    const result = await db.query('SELECT * FROM payment_intents WHERE intent_id = $1', [
      intentId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async getStatus(intentId: string) {
    const result = await db.query(
      'SELECT status, completed_at FROM payment_intents WHERE intent_id = $1',
      [intentId]
    );

    if (result.rows.length === 0) {
      const err: AppError = new Error('Payment intent not found');
      err.statusCode = 404;
      throw err;
    }

    return result.rows[0];
  }
}

