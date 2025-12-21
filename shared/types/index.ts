// Shared types across all services

export type Chain = 'ethereum' | 'arbitrum' | 'base' | 'polygon' | 'optimism' | 'stacks' | 'solana' | 'bitcoin';
export type Token = 'ETH' | 'USDC' | 'USDT' | 'WETH' | 'USDh' | 'STX' | 'SOL' | 'BTC';

export interface PaymentIntent {
  id: string;
  intentId?: string;
  agentId: string;
  sourceChain: Chain;
  sourceToken: Token;
  sourceTokenAddress?: string;
  amount: string;
  amountUSD: number;
  destinationToken: Token;
  status: PaymentIntentStatus;
  paymentAddress: string;
  quoteId?: string;
  routeId?: string;
  createdAt: Date;
  expiresAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export type PaymentIntentStatus =
  | 'pending'
  | 'detected'
  | 'routing'
  | 'executing'
  | 'settled'
  | 'failed'
  | 'expired';

export interface Agent {
  id: string;
  stacksAddress: string;
  agentId: string;
  enabledChains: Chain[];
  minPaymentAmount: string;
  autoWithdraw: boolean;
  settlementPreference: 'usdh' | 'stx';
  totalVolumeUSD: number;
  totalPayments: number;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Route {
  id: string;
  paymentIntentId: string;
  routeType: 'direct' | 'bridge' | 'multi_hop';
  steps: RouteStep[];
  estimatedGasCostUSD: number;
  estimatedSlippage: number;
  estimatedTimeSeconds: number;
  totalCostUSD: number;
  status: RouteStatus;
  executedAt?: Date;
  executionTxHash?: string;
  createdAt: Date;
}

export type RouteStatus = 'pending' | 'executing' | 'completed' | 'failed';

export interface RouteStep {
  type: 'swap' | 'bridge' | 'transfer';
  fromChain: Chain;
  toChain: Chain;
  fromToken: Token;
  toToken: Token;
  fromTokenAddress?: string;
  toTokenAddress?: string;
  amount: string;
  provider: string;
  gasEstimate: number;
  fee: number;
  estimatedSlippage?: number;
}

export interface PaymentEvent {
  id: string;
  paymentIntentId: string;
  chain: Chain;
  txHash: string;
  blockNumber?: number;
  blockHash?: string;
  fromAddress: string;
  toAddress: string;
  tokenAddress?: string;
  amount: string;
  amountUSD: number;
  confirmed: boolean;
  confirmations: number;
  detectedAt: Date;
  confirmedAt?: Date;
}

export interface Settlement {
  id: string;
  paymentIntentId: string;
  agentId: string;
  sourceAmount: string;
  sourceToken: Token;
  usdhAmount: string;
  conversionRate: string;
  feesUSD: number;
  gasCostUSD: number;
  netAmountUSDh: string;
  depositedToVault: boolean;
  vaultDepositTxHash?: string;
  status: SettlementStatus;
  createdAt: Date;
  completedAt?: Date;
}

export type SettlementStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AgentBalance {
  agentId: string;
  principalUSDh: string;
  accruedYieldUSDh: string;
  totalUSDh: string;
  lastYieldCalculation: Date;
  lastDepositAt?: Date;
  lastWithdrawalAt?: Date;
  updatedAt: Date;
}

export interface Quote {
  id: string;
  paymentIntentId: string;
  routes: Route[];
  bestRoute: Route;
  expiresAt: Date;
  createdAt: Date;
}

export interface ChainEvent {
  chain: Chain;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  tokenAddress?: string;
  amount: string;
  amountUSD: number;
  timestamp: number;
  confirmations: number;
}

// Chainhook-specific types for tracking users and fees
export interface UserMetrics {
  agentAddress: string;
  totalPayments: number;
  totalVolumeUSD: number;
  totalFeesGenerated: number;
  firstPaymentAt: Date;
  lastPaymentAt: Date;
  sourceChains: Record<Chain, number>; // payments per chain
  updatedAt: Date;
}

export interface FeeMetrics {
  intentId: string;
  agentAddress: string;
  settlementFee: number; // in USDh
  settlementFeeBps: number;
  gasSpentUSD: number;
  totalFeesUSD: number;
  sourceChain: Chain;
  sourceAmount: string;
  usdhAmount: string;
  timestamp: Date;
}

export interface ProtocolMetrics {
  totalUsers: number;
  totalPayments: number;
  totalVolumeUSD: number;
  totalFeesCollected: number;
  averageFeePerPayment: number;
  paymentsByChain: Record<Chain, number>;
  volumeByChain: Record<Chain, number>;
  lastUpdated: Date;
}

export interface ChainhookEvent {
  event: string;
  intentId?: string;
  paymentIndex?: number;
  agent?: string;
  sourceChain?: string;
  sourceAmount?: string;
  expectedUsdh?: string;
  usdhAmount?: string;
  netAmount?: string;
  feesPaid?: string;
  expiresAt?: number;
  detectedAt?: number;
  settledAt?: number;
  sourceTxHash?: string;
  settlementTxHash?: string;
  blockHeight?: number;
  [key: string]: any;
}

