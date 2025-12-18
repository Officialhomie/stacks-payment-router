/**
 * Shared TypeScript types for the Payment Router frontend
 */

export type Network = 'mainnet' | 'testnet' | 'devnet';
export type Chain = 'ethereum' | 'arbitrum' | 'base' | 'polygon' | 'optimism' | 'stacks';
export type PaymentStatus = 'pending' | 'detected' | 'settled' | 'expired' | 'failed';

/**
 * Payment Intent - represents a payment request
 */
export interface PaymentIntent {
  id: string;
  agentAddress: string;
  amount: string; // Amount in USD
  expectedAmount: string; // Amount in crypto (wei/microSTX)
  chain: Chain;
  paymentAddress: string;
  status: PaymentStatus;
  txHash?: string;
  createdAt: Date;
  expiresAt: Date;
  settledAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Agent - registered agent who can receive payments
 */
export interface Agent {
  address: string;
  name?: string;
  description?: string;
  autoWithdraw: boolean;
  maxPaymentAmount?: string;
  minPaymentAmount?: string;
  supportedChains: Chain[];
  vaultBalance?: string;
  totalReceived?: string;
  paymentCount?: number;
  registeredAt: Date;
  lastActivityAt?: Date;
}

/**
 * Settlement - represents a completed settlement
 */
export interface Settlement {
  id: string;
  intentId: string;
  agentAddress: string;
  amount: string;
  usdAmount: string;
  txHash: string;
  blockHeight: number;
  settledAt: Date;
  fee: string;
  autoWithdraw: boolean;
}

/**
 * Vault Stats - agent's vault statistics
 */
export interface VaultStats {
  balance: string; // Current USDh balance
  totalDeposited: string;
  totalWithdrawn: string;
  yieldEarned: string;
  lastYieldClaim?: Date;
}

/**
 * Payment Stats - overall payment statistics
 */
export interface PaymentStats {
  totalPayments: number;
  totalVolume: string;
  successRate: number;
  averageAmount: string;
  last24hVolume: string;
  last7dVolume: string;
  last30dVolume: string;
}

/**
 * Transaction - blockchain transaction
 */
export interface Transaction {
  hash: string;
  chain: Chain;
  from: string;
  to: string;
  value: string;
  blockNumber: number;
  timestamp: Date;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: number;
    requestId?: string;
  };
}

/**
 * Pagination params
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Wallet connection state
 */
export interface WalletState {
  connected: boolean;
  address?: string;
  network?: Network;
  balance?: string;
}

/**
 * Toast notification
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

/**
 * Form validation error
 */
export interface FormError {
  field: string;
  message: string;
}

/**
 * Chart data point
 */
export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

/**
 * Activity log entry
 */
export interface ActivityLog {
  id: string;
  type: 'payment_created' | 'payment_detected' | 'settlement_completed' | 'withdrawal';
  description: string;
  amount?: string;
  txHash?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Withdrawal record
 */
export interface Withdrawal {
  id: string;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  requestedAt?: Date | string;
  completedAt?: Date | string;
}

/**
 * Webhook event
 */
export interface WebhookEvent {
  id: string;
  type: string;
  data: unknown;
  timestamp: Date;
  signature: string;
}

/**
 * API Key for developers
 */
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  secret?: string;
  permissions: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  rateLimit?: number;
}

/**
 * System Health
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    api: boolean;
    ethereum: boolean;
    stacks: boolean;
    database: boolean;
  };
  latency: {
    api: number;
    ethereum: number;
    stacks: number;
  };
  lastCheck: Date;
}

/**
 * Fee Configuration
 */
export interface FeeConfig {
  settlementFeeBps: number; // Basis points (100 = 1%)
  instantWithdrawFeeBps: number;
  minimumFee: string;
  maximumFee: string;
}
