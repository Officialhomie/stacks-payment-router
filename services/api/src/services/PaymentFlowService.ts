import { db } from '../db';
import { logger } from '@shared/utils/logger';
import { ExecutionService } from '../../../execution/src/ExecutionService';
import { SettlementEngine } from '../../../settlement/src/SettlementEngine';
import { Route } from '@shared/types';

/**
 * Orchestrates the complete payment flow:
 * Payment Detection → Route Execution → Settlement
 */
export class PaymentFlowService {
  private executionService: ExecutionService;
  private settlementEngine: SettlementEngine;

  constructor() {
    this.executionService = new ExecutionService();
    this.settlementEngine = new SettlementEngine();
  }

  async processPayment(paymentIntentId: string): Promise<void> {
    logger.info(`Processing payment flow for intent: ${paymentIntentId}`);

    try {
      // Get payment intent
      const intentResult = await db.query(
        'SELECT * FROM payment_intents WHERE id = $1',
        [paymentIntentId]
      );

      if (intentResult.rows.length === 0) {
        throw new Error('Payment intent not found');
      }

      const intent = intentResult.rows[0];

      // Update status to routing
      await db.query('UPDATE payment_intents SET status = $1 WHERE id = $2', [
        'routing',
        paymentIntentId,
      ]);

      // Get the route
      const routeResult = await db.query(
        'SELECT * FROM routes WHERE payment_intent_id = $1 ORDER BY created_at DESC LIMIT 1',
        [paymentIntentId]
      );

      if (routeResult.rows.length === 0) {
        throw new Error('No route found for payment intent');
      }

      const route: Route = {
        ...routeResult.rows[0],
        steps: JSON.parse(routeResult.rows[0].steps),
        createdAt: new Date(routeResult.rows[0].created_at),
      };

      // Update status to executing
      await db.query('UPDATE payment_intents SET status = $1 WHERE id = $2', [
        'executing',
        paymentIntentId,
      ]);

      // Execute the route
      logger.info(`Executing route: ${route.id}`);
      const finalTxHash = await this.executionService.executeRoute(route, paymentIntentId);

      // Update payment intent with route execution
      await db.query(
        'UPDATE payment_intents SET route_id = $1, status = $2 WHERE id = $3',
        [route.id, 'executed', paymentIntentId]
      );

      // Settle the payment
      logger.info(`Settling payment: ${paymentIntentId}`);
      await this.settlementEngine.settle(paymentIntentId);

      // Update status to settled
      await db.query(
        'UPDATE payment_intents SET status = $1, completed_at = NOW() WHERE id = $2',
        ['settled', paymentIntentId]
      );

      logger.info(`Payment flow completed: ${paymentIntentId}`);
    } catch (error) {
      logger.error(`Payment flow failed: ${paymentIntentId}`, error);
      
      // Update status to failed
      await db.query('UPDATE payment_intents SET status = $1 WHERE id = $2', [
        'failed',
        paymentIntentId,
      ]);

      throw error;
    }
  }
}

