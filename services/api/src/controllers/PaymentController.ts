import { Request, Response } from 'express';
import { PaymentService } from '../services/PaymentService';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export class PaymentController {
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  async createIntent(req: Request, res: Response) {
    try {
      const intent = await this.paymentService.createIntent(req.body);
      res.status(201).json({
        success: true,
        data: intent,
      });
    } catch (error) {
      logger.error('Create payment intent failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to create payment intent',
      });
    }
  }

  async getIntent(req: Request, res: Response) {
    try {
      const { intentId } = req.params;
      const intent = await this.paymentService.getIntent(intentId);

      if (!intent) {
        return res.status(404).json({
          success: false,
          error: 'Payment intent not found',
        });
      }

      res.json({
        success: true,
        data: intent,
      });
    } catch (error) {
      logger.error('Get payment intent failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async getStatus(req: Request, res: Response) {
    try {
      const { intentId } = req.params;
      const status = await this.paymentService.getStatus(intentId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Get payment status failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}

