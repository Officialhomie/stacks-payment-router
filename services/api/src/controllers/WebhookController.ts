import { Request, Response } from 'express';
import { logger } from '@shared/utils/logger';
import { PaymentDetectionService } from '../services/PaymentDetectionService';
import { ChainEvent } from '@shared/types';

export class WebhookController {
  private paymentDetectionService: PaymentDetectionService;

  constructor() {
    this.paymentDetectionService = new PaymentDetectionService();
  }

  async handlePaymentWebhook(req: Request, res: Response) {
    try {
      logger.info('Payment webhook received', req.body);

      const event: ChainEvent = {
        chain: req.body.chain,
        txHash: req.body.txHash,
        blockNumber: req.body.blockNumber,
        blockHash: req.body.blockHash,
        from: req.body.from,
        to: req.body.to,
        tokenAddress: req.body.tokenAddress,
        amount: req.body.amount,
        amountUSD: req.body.amountUSD,
        timestamp: req.body.timestamp || Date.now(),
        confirmations: req.body.confirmations || 0,
      };

      await this.paymentDetectionService.handlePaymentEvent(event);

      res.json({ success: true });
    } catch (error) {
      logger.error('Payment webhook failed', error);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  }

  async handleSettlementWebhook(req: Request, res: Response) {
    try {
      logger.info('Settlement webhook received', req.body);
      // Process settlement webhook
      res.json({ success: true });
    } catch (error) {
      logger.error('Settlement webhook failed', error);
      res.status(500).json({ success: false, error: 'Webhook processing failed' });
    }
  }
}

