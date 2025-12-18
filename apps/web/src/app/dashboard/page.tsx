'use client';

import React from 'react';
import { useWallet } from '@/components/providers/wallet-provider';
import { useAgent, useVaultStats } from '@/lib/hooks/use-agent';
import { useAgentPayments } from '@/lib/hooks/use-payment-intent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatCompactNumber } from '@/lib/utils';
import { PaymentStatus } from '@/components/features/payment/payment-status';
import { RegistrationForm } from '@/components/features/agent/registration-form';

/**
 * Dashboard Overview Page
 * Shows agent stats, vault balance, and recent payments
 */
export default function DashboardPage() {
  const { connected, address } = useWallet();

  // Fetch agent data
  const { data: agent, isLoading: agentLoading } = useAgent(address || null, {
    enabled: connected && !!address,
  });

  // Fetch vault stats
  const { data: vaultStats, isLoading: vaultLoading } = useVaultStats(address || null, {
    enabled: connected && !!address,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch recent payments
  const { data: payments, isLoading: paymentsLoading } = useAgentPayments(address || null, {
    limit: 5,
    enabled: connected && !!address,
  });

  // Not connected state
  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground mb-6">
            Connect your Stacks wallet to view your agent dashboard
          </p>
          <p className="text-sm text-muted-foreground">
            Click the &quot;Connect Wallet&quot; button in the top right corner
          </p>
        </Card>
      </div>
    );
  }

  // Loading state
  if (agentLoading || vaultLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Not registered state
  if (!agent) {
    return (
      <div className="max-w-4xl mx-auto">
        <RegistrationForm
          onSuccess={() => {
            // Refetch agent data
            window.location.reload();
          }}
          onError={(error) => {
            console.error('Registration failed:', error);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here&apos;s an overview of your payment activity.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Vault Balance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vault Balance</CardTitle>
            <VaultIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaultStats ? formatCurrency(vaultStats.balance) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for withdrawal
            </p>
          </CardContent>
        </Card>

        {/* Total Received */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Received</CardTitle>
            <TrendUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {agent.totalReceived ? formatCurrency(agent.totalReceived) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              All-time earnings
            </p>
          </CardContent>
        </Card>

        {/* Payment Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments</CardTitle>
            <PaymentsIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCompactNumber(agent.paymentCount || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total transactions
            </p>
          </CardContent>
        </Card>

        {/* Yield Earned */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yield Earned</CardTitle>
            <SparklesIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vaultStats ? formatCurrency(vaultStats.yieldEarned) : '$0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              From yield vault
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payments</CardTitle>
          <CardDescription>Your most recent payment transactions</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : payments && payments.length > 0 ? (
            <div className="space-y-4">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <PaymentStatus status={payment.status} />
                      <span className="font-mono text-sm text-muted-foreground">
                        #{payment.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {new Date(payment.createdAt).toLocaleDateString()} • {payment.chain}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(payment.amount)}</div>
                    <div className="text-sm text-muted-foreground">
                      {payment.expectedAmount} {payment.chain.toUpperCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-muted-foreground">No payments yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Share your payment link to start receiving payments
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Info */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Agent Name</div>
              <div className="font-medium">{agent.name || 'Unnamed Agent'}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Auto-Withdraw</div>
              <Badge variant={agent.autoWithdraw ? 'success' : 'secondary'}>
                {agent.autoWithdraw ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Registered</div>
              <div className="text-sm">
                {new Date(agent.registeredAt).toLocaleDateString()}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Supported Chains</div>
              <div className="flex gap-1 flex-wrap">
                {agent.supportedChains?.map((chain) => (
                  <Badge key={chain} variant="outline" className="text-xs">
                    {chain}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Icons
function VaultIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function TrendUpIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function PaymentsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}
