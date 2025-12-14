import { Request, Response } from 'express';
import { QuoteService } from '../services/QuoteService';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export class QuoteController {
  private quoteService: QuoteService;

  constructor() {
    this.quoteService = new QuoteService();
  }

  async getQuote(req: Request, res: Response) {
    try {
      const quote = await this.quoteService.getQuote(req.body);
      res.json({
        success: true,
        data: quote,
      });
    } catch (error) {
      logger.error('Get quote failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to get quote',
      });
    }
  }

  async getQuoteDetails(req: Request, res: Response) {
    try {
      const { quoteId } = req.params;
      const quote = await this.quoteService.getQuoteDetails(quoteId);

      if (!quote) {
        return res.status(404).json({
          success: false,
          error: 'Quote not found',
        });
      }

      res.json({
        success: true,
        data: quote,
      });
    } catch (error) {
      logger.error('Get quote details failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
}

