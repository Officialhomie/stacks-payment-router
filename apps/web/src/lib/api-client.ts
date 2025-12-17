import type { ApiResponse, PaymentIntent, Agent, Settlement, VaultStats, PaymentStats } from '@/types';

/**
 * API Client Configuration
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
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
  private async post<T>(path: string, data?: any): Promise<ApiResponse<T>> {
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
  private async put<T>(path: string, data?: any): Promise<ApiResponse<T>> {
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
  private handleError(error: any): ApiResponse<never> {
    console.error('API Error:', error);
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error.message || 'An unexpected error occurred',
        details: error,
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
    metadata?: Record<string, any>;
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
    const query = new URLSearchParams(params as any).toString();
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
    const query = new URLSearchParams(params as any).toString();
    return this.get<Settlement[]>(`/api/agents/${agentAddress}/settlements?${query}`);
  }

  /**
   * Request settlement (admin only)
   */
  async requestSettlement(intentId: string, autoWithdraw: boolean = false): Promise<ApiResponse<{ txId: string }>> {
    return this.post<{ txId: string }>(`/api/settlements/${intentId}`, { autoWithdraw });
  }

  // ============================================
  // Admin Methods
  // ============================================

  /**
   * Get pending settlements (admin only)
   */
  async getPendingSettlements(): Promise<ApiResponse<any[]>> {
    return this.get<any[]>(`/api/v1/admin/settlements/pending`);
  }

  /**
   * Batch settle payments (admin only)
   */
  async batchSettle(intentIds: string[], autoWithdraw: boolean = false): Promise<ApiResponse<any[]>> {
    return this.post<any[]>(`/api/v1/admin/settlements/batch`, { intentIds, autoWithdraw });
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
  }): Promise<ApiResponse<any[]>> {
    const query = new URLSearchParams(params as any).toString();
    return this.get<any[]>(`/api/v1/agents/${agentAddress}/withdrawals?${query}`);
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
}

/**
 * Default API client instance
 */
export const apiClient = new ApiClient();

/**
 * Export the class for custom instances
 */
export { ApiClient };
