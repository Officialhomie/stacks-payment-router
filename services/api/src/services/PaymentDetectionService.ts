import { ChainEvent } from '@shared/types';
import { db } from '../db';
import { logger } from '@shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class PaymentDetectionService {

  async handlePaymentEvent(event: ChainEvent): Promise<void> {
    logger.info('Payment event detected', {
      chain: event.chain,
      txHash: event.txHash,
      to: event.to,
      amount: event.amount,
    });

    try {
      // Find payment intent by payment address
      const intentResult = await db.query(
        'SELECT * FROM payment_intents WHERE payment_address = $1 AND status = $2',
        [event.to, 'pending']
      );

      if (intentResult.rows.length === 0) {
        logger.warn('No matching payment intent found', { to: event.to });
        return;
      }

      const intent = intentResult.rows[0];

      // Create payment event record
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

        // Trigger payment flow (routing → execution → settlement)
        await this.triggerPaymentFlow(intent.id);
      }

      logger.info('Payment event processed', { intentId: intent.id, txHash: event.txHash });
    } catch (error) {
      logger.error('Error handling payment event', error);
      throw error;
    }
  }

  private async triggerPaymentFlow(paymentIntentId: string): Promise<void> {
    // In production, would use a message queue or event system
    // For now, process payment flow directly
    try {
      const { PaymentFlowService } = await import('./PaymentFlowService');
      const flowService = new PaymentFlowService();
      
      // Process asynchronously
      flowService.processPayment(paymentIntentId).catch((error) => {
        logger.error('Payment flow processing failed', { paymentIntentId, error });
      });
    } catch (error) {
      logger.error('Failed to trigger payment flow', error);
    }
  }
}

