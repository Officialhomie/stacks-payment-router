/**
 * Metrics API Server
 * Provides HTTP endpoints to query user and fee metrics
 */

import http from 'http';
import { logger } from '@shared/utils/logger';
import { MetricsTracker } from './MetricsTracker';

export interface ApiConfig {
  port: number;
  hostname: string;
}

export class MetricsApi {
  private server?: http.Server;
  private metricsTracker: MetricsTracker;
  private config: ApiConfig;

  constructor(metricsTracker: MetricsTracker, config: ApiConfig) {
    this.metricsTracker = metricsTracker;
    this.config = config;
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    this.server = http.createServer(this.handleRequest.bind(this));

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.listen(this.config.port, this.config.hostname, () => {
        logger.info('Metrics API server started', {
          hostname: this.config.hostname,
          port: this.config.port,
        });
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('Metrics API server error', { error });
        reject(error);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        logger.info('Metrics API server stopped');
        resolve();
      });
    });
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const urlObj = new URL(url, `http://${req.headers.host || 'localhost'}`);

    logger.debug('API request', { method, url });

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Route requests
      if (urlObj.pathname === '/health' || urlObj.pathname === '/') {
        this.handleHealth(res);
      } else if (urlObj.pathname === '/metrics/protocol') {
        this.handleProtocolMetrics(res);
      } else if (urlObj.pathname === '/metrics/users') {
        const query = this.parseQueryParams(urlObj);
        this.handleAllUserMetrics(res, query);
      } else if (urlObj.pathname.startsWith('/metrics/user/')) {
        const agentAddress = urlObj.pathname.split('/metrics/user/')[1];
        this.handleUserMetrics(res, agentAddress);
      } else if (urlObj.pathname === '/metrics/fees') {
        const query = this.parseQueryParams(urlObj);
        this.handleAllFeeMetrics(res, query);
      } else if (urlObj.pathname.startsWith('/metrics/fee/')) {
        const intentId = urlObj.pathname.split('/metrics/fee/')[1];
        this.handleFeeMetrics(res, intentId);
      } else if (urlObj.pathname === '/metrics/summary') {
        const query = this.parseQueryParams(urlObj);
        this.handleMetricsSummary(res, query);
      } else {
        this.send404(res);
      }
    } catch (error) {
      logger.error('Error handling API request', { error, url });
      this.send500(res, error);
    }
  }

  /**
   * Parse query parameters from URL
   */
  private parseQueryParams(url: URL): Record<string, string> {
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * Health check endpoint
   */
  private handleHealth(res: http.ServerResponse): void {
    this.sendJson(res, {
      status: 'ok',
      service: 'chainhooks-metrics',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get protocol-wide metrics
   */
  private handleProtocolMetrics(res: http.ServerResponse): void {
    const metrics = this.metricsTracker.getProtocolMetrics();
    this.sendJson(res, metrics);
  }

  /**
   * Get all user metrics with filtering and pagination
   */
  private handleAllUserMetrics(res: http.ServerResponse, query: Record<string, string>): void {
    let metrics = this.metricsTracker.getAllUserMetrics();

    // Filter by minimum volume
    if (query.minVolume) {
      const minVolume = parseFloat(query.minVolume);
      if (!isNaN(minVolume)) {
        metrics = metrics.filter((m) => m.totalVolumeUSD >= minVolume);
      }
    }

    // Filter by minimum payments
    if (query.minPayments) {
      const minPayments = parseInt(query.minPayments);
      if (!isNaN(minPayments)) {
        metrics = metrics.filter((m) => m.totalPayments >= minPayments);
      }
    }

    // Sort
    const sortBy = query.sortBy || 'volume';
    const sortOrder = query.sortOrder || 'desc';
    metrics.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'volume':
          comparison = a.totalVolumeUSD - b.totalVolumeUSD;
          break;
        case 'payments':
          comparison = a.totalPayments - b.totalPayments;
          break;
        case 'fees':
          comparison = a.totalFeesGenerated - b.totalFeesGenerated;
          break;
        case 'lastPayment':
          comparison = a.lastPaymentAt.getTime() - b.lastPaymentAt.getTime();
          break;
        default:
          comparison = a.totalVolumeUSD - b.totalVolumeUSD;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Pagination
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '50');
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedMetrics = metrics.slice(start, end);

    this.sendJson(res, {
      count: metrics.length,
      page,
      limit,
      totalPages: Math.ceil(metrics.length / limit),
      users: paginatedMetrics,
    });
  }

  /**
   * Get metrics for a specific user
   */
  private handleUserMetrics(res: http.ServerResponse, agentAddress: string): void {
    const metrics = this.metricsTracker.getUserMetrics(agentAddress);
    if (!metrics) {
      this.send404(res, `User not found: ${agentAddress}`);
      return;
    }
    this.sendJson(res, metrics);
  }

  /**
   * Get all fee metrics with filtering and pagination
   */
  private handleAllFeeMetrics(res: http.ServerResponse, query: Record<string, string>): void {
    let metrics = this.metricsTracker.getAllFeeMetrics();

    // Filter by agent address
    if (query.agent) {
      metrics = metrics.filter((m) => m.agentAddress === query.agent);
    }

    // Filter by chain
    if (query.chain) {
      metrics = metrics.filter((m) => m.sourceChain === query.chain);
    }

    // Filter by date range
    if (query.fromDate) {
      const fromDate = new Date(query.fromDate);
      if (!isNaN(fromDate.getTime())) {
        metrics = metrics.filter((m) => m.timestamp >= fromDate);
      }
    }
    if (query.toDate) {
      const toDate = new Date(query.toDate);
      if (!isNaN(toDate.getTime())) {
        metrics = metrics.filter((m) => m.timestamp <= toDate);
      }
    }

    // Filter by minimum fee
    if (query.minFee) {
      const minFee = parseFloat(query.minFee);
      if (!isNaN(minFee)) {
        metrics = metrics.filter((m) => m.totalFeesUSD >= minFee);
      }
    }

    // Sort by timestamp (most recent first)
    metrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Pagination
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '50');
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedMetrics = metrics.slice(start, end);

    this.sendJson(res, {
      count: metrics.length,
      page,
      limit,
      totalPages: Math.ceil(metrics.length / limit),
      fees: paginatedMetrics,
    });
  }

  /**
   * Get fee metrics for a specific intent
   */
  private handleFeeMetrics(res: http.ServerResponse, intentId: string): void {
    const metrics = this.metricsTracker.getFeeMetrics(intentId);
    if (!metrics) {
      this.send404(res, `Fee metrics not found for intent: ${intentId}`);
      return;
    }
    this.sendJson(res, metrics);
  }

  /**
   * Get summary of all metrics with optional filtering
   */
  private handleMetricsSummary(res: http.ServerResponse, query: Record<string, string>): void {
    const protocolMetrics = this.metricsTracker.getProtocolMetrics();
    let userMetrics = this.metricsTracker.getAllUserMetrics();
    let feeMetrics = this.metricsTracker.getAllFeeMetrics();

    // Filter by date range if provided
    if (query.fromDate || query.toDate) {
      const fromDate = query.fromDate ? new Date(query.fromDate) : null;
      const toDate = query.toDate ? new Date(query.toDate) : null;

      if (fromDate && !isNaN(fromDate.getTime())) {
        feeMetrics = feeMetrics.filter((f) => f.timestamp >= fromDate);
      }
      if (toDate && !isNaN(toDate.getTime())) {
        feeMetrics = feeMetrics.filter((f) => f.timestamp <= toDate);
      }
    }

    // Calculate summary statistics
    const topUsersLimit = parseInt(query.topUsers || '10');
    const topUsers = userMetrics
      .sort((a, b) => b.totalVolumeUSD - a.totalVolumeUSD)
      .slice(0, topUsersLimit)
      .map((u) => ({
        address: u.agentAddress,
        volume: u.totalVolumeUSD,
        payments: u.totalPayments,
        fees: u.totalFeesGenerated,
      }));

    const recentFeesLimit = parseInt(query.recentFees || '10');
    const recentFees = feeMetrics
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, recentFeesLimit)
      .map((f) => ({
        intentId: f.intentId,
        agent: f.agentAddress,
        fee: f.totalFeesUSD,
        chain: f.sourceChain,
        timestamp: f.timestamp,
      }));

    // Calculate filtered totals if date range provided
    const filteredTotalFees = feeMetrics.reduce((sum, f) => sum + f.totalFeesUSD, 0);
    const filteredTotalVolume = feeMetrics.reduce((sum, f) => {
      const amount = parseFloat(f.usdhAmount) / 1_000_000;
      return sum + amount;
    }, 0);

    this.sendJson(res, {
      protocol: protocolMetrics,
      topUsers,
      recentFees,
      summary: {
        totalUsers: userMetrics.length,
        totalPayments: protocolMetrics.totalPayments,
        totalVolume: protocolMetrics.totalVolumeUSD,
        totalFees: protocolMetrics.totalFeesCollected,
        averageFee: protocolMetrics.averageFeePerPayment,
        ...(query.fromDate || query.toDate
          ? {
              filteredTotalFees,
              filteredTotalVolume,
              filteredPaymentCount: feeMetrics.length,
            }
          : {}),
      },
    });
  }

  /**
   * Send JSON response
   */
  private sendJson(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Send 404 response
   */
  private send404(res: http.ServerResponse, message?: string): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not Found',
        message: message || 'The requested resource was not found',
      })
    );
  }

  /**
   * Send 500 response
   */
  private send500(res: http.ServerResponse, error: any): void {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Internal Server Error',
        message: error?.message || 'An unexpected error occurred',
      })
    );
  }
}
