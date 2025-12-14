/**
 * Vault Stats Component
 *
 * Displays comprehensive statistics about the agent's yield vault.
 * Includes balance, earnings, APY, and historical data.
 *
 * @example Basic Usage
 * ```tsx
 * <VaultStats agentAddress="ST1PQHQKV..." />
 * ```
 *
 * @example With Custom Refresh Interval
 * ```tsx
 * <VaultStats
 *   agentAddress="ST1PQHQKV..."
 *   refreshInterval={10000}
 * />
 * ```
 *
 * @example Compact Mode
 * ```tsx
 * <VaultStats
 *   agentAddress="ST1PQHQKV..."
 *   compact
 *   showChart={false}
 * />
 * ```
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useVaultStats } from '@/lib/hooks/use-agent';

/**
 * Props for the VaultStats component
 */
export interface VaultStatsProps {
  /** Stacks address of the agent */
  agentAddress: string;
  /** Refresh interval in milliseconds */
  refreshInterval?: number;
  /** Show in compact mode */
  compact?: boolean;
  /** Show earnings chart */
  showChart?: boolean;
  /** Custom CSS classes */
  className?: string;
}

/**
 * VaultStats Component
 *
 * Fetches and displays real-time vault statistics with auto-refresh.
 */
export function VaultStats({
  agentAddress,
  refreshInterval = 30000,
  compact = false,
  showChart = true,
  className,
}: VaultStatsProps) {
  const { data: stats, isLoading, error } = useVaultStats(agentAddress, { refetchInterval: refreshInterval });

  if (isLoading) {
    return <VaultStats.Loading compact={compact} />;
  }

  if (error || !stats) {
    return <VaultStats.Error />;
  }

  if (compact) {
    return <VaultStats.Compact stats={stats} className={className} />;
  }

  return (
    <div className={className}>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.balance)}</div>
            <p className="text-xs text-muted-foreground">Available for withdrawal</p>
          </CardContent>
        </Card>

        {/* Total Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalEarnings)}</div>
            <p className="text-xs text-muted-foreground">Lifetime yield earned</p>
          </CardContent>
        </Card>

        {/* Current APY */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current APY</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.currentApy}%</div>
            <p className="text-xs text-muted-foreground">Annual percentage yield</p>
          </CardContent>
        </Card>

        {/* Pending Deposits */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Deposits</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.pendingDeposits)}</div>
            <p className="text-xs text-muted-foreground">Awaiting settlement</p>
          </CardContent>
        </Card>
      </div>

      {/* Earnings Chart (TODO: Implement with recharts or similar) */}
      {showChart && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Earnings History</CardTitle>
            <CardDescription>Your yield earnings over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Chart component (to be implemented with recharts)
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Loading State Component
 */
VaultStats.Loading = function VaultStatsLoading({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-8 bg-muted rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="py-6">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-8 bg-muted rounded w-3/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/**
 * Error State Component
 */
VaultStats.Error = function VaultStatsError() {
  return (
    <Card>
      <CardContent className="py-6">
        <div className="text-center text-destructive">
          <p className="font-medium">Failed to load vault statistics</p>
          <p className="text-sm text-muted-foreground mt-1">Please try again later</p>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Compact Stats Component
 *
 * @example
 * ```tsx
 * <VaultStats.Compact stats={vaultStats} />
 * ```
 */
VaultStats.Compact = function VaultStatsCompact({
  stats,
  className,
}: {
  stats: {
    balance: string;
    totalEarnings: string;
    currentApy: string;
    pendingDeposits: string;
  };
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="py-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-lg font-bold">{formatCurrency(stats.balance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Earnings</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(stats.totalEarnings)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">APY</p>
            <p className="text-lg font-bold">{stats.currentApy}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending</p>
            <p className="text-lg font-bold">{formatCurrency(stats.pendingDeposits)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Single Stat Card Component
 *
 * @example
 * ```tsx
 * <VaultStats.StatCard
 *   label="Balance"
 *   value="$1,234.56"
 *   icon={<WalletIcon />}
 * />
 * ```
 */
VaultStats.StatCard = function StatCard({
  label,
  value,
  description,
  icon,
  trend,
}: {
  label: string;
  value: string;
  description?: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-muted-foreground',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${trend ? trendColors[trend] : ''}`}>{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
};
