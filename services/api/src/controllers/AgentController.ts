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

  async getAgentPayments(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { status, limit, offset } = req.query;

      const payments = await this.agentService.getAgentPayments(agentId, {
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json({
        success: true,
        data: payments,
      });
    } catch (error) {
      logger.error('Get agent payments failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to fetch payments',
      });
    }
  }

  async getVaultStats(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const vaultStats = await this.agentService.getVaultStats(agentId);

      res.json({
        success: true,
        data: vaultStats,
      });
    } catch (error) {
      logger.error('Get vault stats failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to fetch vault stats',
      });
    }
  }

  async getWithdrawalHistory(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { limit, offset } = req.query;

      const withdrawals = await this.agentService.getWithdrawalHistory(agentId, {
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json({
        success: true,
        data: withdrawals,
      });
    } catch (error) {
      logger.error('Get withdrawal history failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Failed to fetch withdrawal history',
      });
    }
  }

  async updateAgent(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const { name, description, autoWithdraw, supportedChains, minPaymentAmount } = req.body;

      const updatedAgent = await this.agentService.updateAgent(agentId, {
        name,
        description,
        autoWithdraw,
        enabledChains: supportedChains,
        minPaymentAmount,
      });

      res.json({
        success: true,
        data: updatedAgent,
      });
    } catch (error) {
      logger.error('Update agent failed', error);
      const err: AppError = error as AppError;
      res.status(err.statusCode || 400).json({
        success: false,
        error: err.message || 'Failed to update agent',
      });
    }
  }
}

