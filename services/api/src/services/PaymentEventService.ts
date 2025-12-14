import { getDb } from '@shared/utils/db';
import { logger } from '@shared/utils/logger';
import { ChainEvent } from '@shared/types';
import { v4 as uuidv4 } from 'uuid';

export class PaymentEventService {
  async processPaymentEvent(event: ChainEvent): Promise<void> {
    const db = getDb();

    try {
      // Find matching payment intent by payment address
      const intentResult = await db.query(
        'SELECT * FROM payment_intents WHERE payment_address = $1 AND status = $2',
        [event.to, 'pending']
      );

      if (intentResult.rows.length === 0) {
        logger.warn('No matching payment intent found', { to: event.to });
        return;
      }

      const intent = intentResult.rows[0];

      // Check if payment event already exists
      const existingEvent = await db.query(
        'SELECT id FROM payment_events WHERE tx_hash = $1',
        [event.txHash]
      );

      if (existingEvent.rows.length > 0) {
        logger.debug('Payment event already processed', { txHash: event.txHash });
        return;
      }

      // Create payment event
      await db.query(
        `INSERT INTO payment_events (
          payment_intent_id, chain, tx_hash, block_number, block_hash,
          from_address, to_address, token_address, amount, amount_usd,
          confirmed, confirmations, detected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          intent.id,
          event.chain,
          event.txHash,
          event.blockNumber,
          event.blockHash,
          event.from,
          event.to,
          event.tokenAddress || null,
          event.amount,
          event.amountUSD,
          event.confirmations >= 12, // Confirmed if enough confirmations
          event.confirmations,
        ]
      );

      // Update payment intent status
      if (event.confirmations >= 12) {
        await db.query(
          'UPDATE payment_intents SET status = $1 WHERE id = $2',
          ['detected', intent.id]
        );

        logger.info('Payment detected and confirmed', {
          intentId: intent.intent_id,
          txHash: event.txHash,
          amount: event.amount,
        });
      } else {
        logger.info('Payment detected, waiting for confirmations', {
          intentId: intent.intent_id,
          txHash: event.txHash,
          confirmations: event.confirmations,
        });
      }
    } catch (error: any) {
      logger.error('Error processing payment event', { error: error.message });
      throw error;
    }
  }
}

