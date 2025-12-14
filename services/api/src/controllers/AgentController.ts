import { Request, Response } from 'express';
import { AgentService } from '../services/AgentService';
import { logger } from '@shared/utils/logger';
import { AppError } from '../middleware/errorHandler';

export class AgentController {
  private agentService: AgentService;

  constructor() {
    this.agentService = new AgentService();
  }

  async register(req: Request, res: Response) {
    try {
      const { stacksAddress, enabledChains, agentId } = req.body;

      const agent = await this.agentService.register({
        stacksAddress,
        agentId,
        enabledChains,
      });

      res.status(201).json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Agent registration failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Registration failed',
      });
    }
  }

  async getAgent(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const agent = await this.agentService.getAgent(agentId);

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found',
        });
      }

      res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error('Get agent failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async getBalance(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const balance = await this.agentService.getBalance(agentId);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      logger.error('Get balance failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async getAddresses(req: Request, res: Response) {
    try {
      const addresses = await this.agentService.getAllPaymentAddresses();
      res.json({
        success: true,
        data: addresses,
      });
    } catch (error) {
      logger.error('Get addresses failed', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }

  async withdraw(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { amount, destinationAddress, destinationChain } = req.body;

      const withdrawal = await this.agentService.withdraw({
        agentId,
        amount,
        destinationAddress,
        destinationChain,
      });

      res.json({
        success: true,
        data: withdrawal,
      });
    } catch (error) {
      logger.error('Withdrawal failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Withdrawal failed',
      });
    }
  }
}

