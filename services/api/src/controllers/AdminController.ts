import { Request, Response } from 'express';
import { SettlementService } from '../services/SettlementService';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export class AdminController {
  private settlementService: SettlementService;

  constructor() {
    this.settlementService = new SettlementService();
  }

  async getPendingSettlements(req: Request, res: Response) {
    try {
      const pendingPayments = await this.settlementService.getPendingSettlements();

      res.json({
        success: true,
        data: pendingPayments,
      });
    } catch (error) {
      logger.error('Get pending settlements failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to fetch pending settlements',
      });
    }
  }

  async settlePayment(req: Request, res: Response) {
    try {
      const { intentId } = req.params;
      const { autoWithdraw } = req.body;

      const txHash = await this.settlementService.settlePayment(intentId, autoWithdraw || false);

      res.json({
        success: true,
        data: { txId: txHash },
      });
    } catch (error) {
      logger.error('Settlement failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Settlement failed',
      });
    }
  }

  async batchSettle(req: Request, res: Response) {
    try {
      const { intentIds, autoWithdraw } = req.body;

      if (!Array.isArray(intentIds) || intentIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'intentIds must be a non-empty array',
        });
      }

      const results = await this.settlementService.batchSettle(intentIds, autoWithdraw || false);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Batch settlement failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Batch settlement failed',
      });
    }
  }
}

