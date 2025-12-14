import { Request, Response } from 'express';
import { PaymentFlowService } from '../services/PaymentFlowService';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export class PaymentFlowController {
  private flowService: PaymentFlowService;

  constructor() {
    this.flowService = new PaymentFlowService();
  }

  async processPayment(req: Request, res: Response) {
    try {
      const { intentId } = req.params;
      
      // Process payment flow asynchronously
      this.flowService.processPayment(intentId).catch((error) => {
        logger.error('Payment flow failed', { intentId, error });
      });

      res.json({
        success: true,
        message: 'Payment flow started',
        intentId,
      });
    } catch (error) {
      logger.error('Failed to start payment flow', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to start payment flow',
      });
    }
  }
}

