import type { ApiResponse, PaymentIntent, Agent, Settlement, VaultStats, PaymentStats, Withdrawal, UserMetrics, FeeMetrics, ProtocolMetrics, MetricsSummary } from '@/types';
import type { PendingPayment } from './hooks/use-admin';

/**
 * API Client Configuration
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const METRICS_API_BASE_URL = process.env.NEXT_PUBLIC_METRICS_API_URL || 'http://localhost:3101';
const API_TIMEOUT = 30000; // 30 seconds

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = API_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * API Client class with type-safe methods
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic GET request
   */
  private async get<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`);
      return await response.json();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generic POST request
   */
  private async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      return await response.json();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generic PUT request
   */
  private async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      return await response.json();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generic DELETE request
   */
  private async delete<T>(path: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method: 'DELETE',
      });
      return await response.json();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Error handler
   */
  private handleError(error: unknown): ApiResponse<never> {
    const err = error as Error;
    console.error('API Error:', error);
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: err.message || 'An unexpected error occurred',
        details: err,
      },
    };
  }

  // ============================================
  // Payment Intent Methods
  // ============================================

  /**
   * Create a new payment intent
   */
  async createPaymentIntent(data: {
    agentAddress: string;
    amount: string;
    chain: string;
    metadata?: Record<string, unknown>;
  }): Promise<ApiResponse<PaymentIntent>> {
    return this.post<PaymentIntent>('/api/v1/payments/intent', data);
  }

  /**
   * Get payment intent by ID
   */
  async getPaymentIntent(intentId: string): Promise<ApiResponse<PaymentIntent>> {
    return this.get<PaymentIntent>(`/api/v1/payments/intent/${intentId}`);
  }

  /**
   * Get payment intent status
   */
  async getPaymentStatus(intentId: string): Promise<ApiResponse<PaymentIntent>> {
    return this.get<PaymentIntent>(`/api/v1/payments/intent/${intentId}/status`);
  }

  /**
   * Get payment intents for an agent
   */
  async getAgentPayments(agentAddress: string, params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<PaymentIntent[]>> {
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    const query = new URLSearchParams(queryParams).toString();
    return this.get<PaymentIntent[]>(`/api/v1/agents/${agentAddress}/payments?${query}`);
  }

  // ============================================
  // Agent Methods
  // ============================================

  /**
   * Register a new agent
   */
  async registerAgent(data: {
    address: string;
    name?: string;
    description?: string;
    autoWithdraw?: boolean;
    supportedChains?: string[];
  }): Promise<ApiResponse<Agent>> {
    return this.post<Agent>('/api/v1/agents/register', data);
  }

  /**
   * Get agent details
   */
  async getAgent(agentId: string): Promise<ApiResponse<Agent>> {
    return this.get<Agent>(`/api/v1/agents/${agentId}`);
  }

  /**
   * Get agent balance
   */
  async getAgentBalance(agentId: string): Promise<ApiResponse<{ balance: string }>> {
    return this.get<{ balance: string }>(`/api/v1/agents/${agentId}/balance`);
  }

  /**
   * Update agent settings
   */
  async updateAgent(agentId: string, data: Partial<Agent>): Promise<ApiResponse<Agent>> {
    return this.put<Agent>(`/api/v1/agents/${agentId}`, data);
  }

  // ============================================
  // Settlement Methods
  // ============================================

  /**
   * Get settlements for an agent
   */
  async getSettlements(agentAddress: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Settlement[]>> {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    const query = new URLSearchParams(queryParams).toString();
    return this.get<Settlement[]>(`/api/agents/${agentAddress}/settlements?${query}`);
  }

  /**
   * Request settlement (admin only)
   */
  async requestSettlement(intentId: string, autoWithdraw: boolean = false): Promise<ApiResponse<{ txId: string }>> {
    return this.post<{ txId: string }>(`/api/v1/admin/settlements/${intentId}`, { autoWithdraw });
  }

  // ============================================
  // Admin Methods
  // ============================================

  /**
   * Get pending settlements (admin only)
   */
  async getPendingSettlements(): Promise<ApiResponse<PendingPayment[]>> {
    return this.get<PendingPayment[]>(`/api/v1/admin/settlements/pending`);
  }

  /**
   * Batch settle payments (admin only)
   */
  async batchSettle(intentIds: string[], autoWithdraw: boolean = false): Promise<ApiResponse<Array<{ intentId: string; success: boolean; txId?: string; error?: string }>>> {
    return this.post<Array<{ intentId: string; success: boolean; txId?: string; error?: string }>>(`/api/v1/admin/settlements/batch`, { intentIds, autoWithdraw });
  }

  // ============================================
  // Vault Methods
  // ============================================

  /**
   * Get vault stats for an agent
   */
  async getVaultStats(agentAddress: string): Promise<ApiResponse<VaultStats>> {
    return this.get<VaultStats>(`/api/v1/agents/${agentAddress}/vault`);
  }

  /**
   * Get withdrawal history for an agent
   */
  async getWithdrawalHistory(agentAddress: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<Withdrawal[]>> {
    const queryParams: Record<string, string> = {};
    if (params?.limit) queryParams.limit = params.limit.toString();
    if (params?.offset) queryParams.offset = params.offset.toString();
    const query = new URLSearchParams(queryParams).toString();
    return this.get<Withdrawal[]>(`/api/v1/agents/${agentAddress}/withdrawals?${query}`);
  }

  /**
   * Withdraw from vault
   */
  async withdrawFromVault(agentId: string, amount: string): Promise<ApiResponse<{ txId: string }>> {
    return this.post<{ txId: string }>(`/api/v1/agents/${agentId}/withdraw`, { amount });
  }

  // ============================================
  // Stats Methods
  // ============================================

  /**
   * Get payment statistics
   */
  async getPaymentStats(agentAddress?: string): Promise<ApiResponse<PaymentStats>> {
    const path = agentAddress ? `/api/stats/${agentAddress}` : '/api/stats';
    return this.get<PaymentStats>(path);
  }

  // ============================================
  // Health Check
  // ============================================

  /**
   * Check API health
   */
  async healthCheck(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.get<{ status: string; timestamp: string }>('/health');
  }

  // Metrics API (Chainhooks)
  // ============================================

  /**
   * Get protocol-wide metrics
   */
  async getProtocolMetrics(): Promise<ApiResponse<ProtocolMetrics>> {
    try {
      const response = await fetchWithTimeout(`${METRICS_API_BASE_URL}/metrics/protocol`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get all user metrics with optional filtering
   */
  async getUserMetrics(params?: {
    minVolume?: number;
    minPayments?: number;
    sortBy?: 'volume' | 'payments' | 'fees' | 'lastPayment';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ count: number; page: number; limit: number; totalPages: number; users: UserMetrics[] }>> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.minVolume) queryParams.set('minVolume', params.minVolume.toString());
      if (params?.minPayments) queryParams.set('minPayments', params.minPayments.toString());
      if (params?.sortBy) queryParams.set('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder);
      if (params?.page) queryParams.set('page', params.page.toString());
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const url = `${METRICS_API_BASE_URL}/metrics/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get metrics for a specific user
   */
  async getUserMetric(agentAddress: string): Promise<ApiResponse<UserMetrics>> {
    try {
      const response = await fetchWithTimeout(`${METRICS_API_BASE_URL}/metrics/user/${agentAddress}`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get all fee metrics with optional filtering
   */
  async getFeeMetrics(params?: {
    agent?: string;
    chain?: string;
    fromDate?: string;
    toDate?: string;
    minFee?: number;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<{ count: number; page: number; limit: number; totalPages: number; fees: FeeMetrics[] }>> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.agent) queryParams.set('agent', params.agent);
      if (params?.chain) queryParams.set('chain', params.chain);
      if (params?.fromDate) queryParams.set('fromDate', params.fromDate);
      if (params?.toDate) queryParams.set('toDate', params.toDate);
      if (params?.minFee) queryParams.set('minFee', params.minFee.toString());
      if (params?.page) queryParams.set('page', params.page.toString());
      if (params?.limit) queryParams.set('limit', params.limit.toString());

      const url = `${METRICS_API_BASE_URL}/metrics/fees${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get fee metrics for a specific intent
   */
  async getFeeMetric(intentId: string): Promise<ApiResponse<FeeMetrics>> {
    try {
      const response = await fetchWithTimeout(`${METRICS_API_BASE_URL}/metrics/fee/${intentId}`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get metrics summary
   */
  async getMetricsSummary(params?: {
    fromDate?: string;
    toDate?: string;
    topUsers?: number;
    recentFees?: number;
  }): Promise<ApiResponse<MetricsSummary>> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.fromDate) queryParams.set('fromDate', params.fromDate);
      if (params?.toDate) queryParams.set('toDate', params.toDate);
      if (params?.topUsers) queryParams.set('topUsers', params.topUsers.toString());
      if (params?.recentFees) queryParams.set('recentFees', params.recentFees.toString());

      const url = `${METRICS_API_BASE_URL}/metrics/summary${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Check metrics API health
   */
  async metricsHealthCheck(): Promise<ApiResponse<{ status: string; service: string; timestamp: string }>> {
    try {
      const response = await fetchWithTimeout(`${METRICS_API_BASE_URL}/health`);
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return this.handleError(error);
    }
  }
}

/**
 * Default API client instance
 */
export const apiClient = new ApiClient();

/**
 * Export the class for custom instances
 */
export { ApiClient };
