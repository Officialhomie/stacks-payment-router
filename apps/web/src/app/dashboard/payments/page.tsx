'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@/components/providers/wallet-provider';
import { useAgentPayments } from '@/lib/hooks/use-payment-intent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PaymentStatus } from '@/components/features/payment/payment-status';
import { formatCurrency, formatAddress } from '@/lib/utils';
import type { PaymentStatus as PaymentStatusType } from '@/types';

/**
 * Payments History Page
 * Shows all payments with filters and search
 */
export default function PaymentsPage() {
  const { connected, address } = useWallet();
  const [statusFilter, setStatusFilter] = useState<PaymentStatusType | 'all'>('all');

  // Fetch payments
  const { data: payments, isLoading } = useAgentPayments(address || null, {
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50,
    enabled: connected && !!address,
  });

  if (!connected) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">
            Connect your wallet to view payment history
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment History</h1>
          <p className="text-muted-foreground">
            View and manage all your payments
          </p>
        </div>
        <Button>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('pending')}
            >
              Pending
            </Button>
            <Button
              variant={statusFilter === 'detected' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('detected')}
            >
              Detected
            </Button>
            <Button
              variant={statusFilter === 'settled' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('settled')}
            >
              Settled
            </Button>
            <Button
              variant={statusFilter === 'expired' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter('expired')}
            >
              Expired
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            {payments ? `${payments.length} payment(s) found` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : payments && payments.length > 0 ? (
            <div className="space-y-2">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Payment ID
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Chain
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b hover:bg-accent/50 transition-colors">
                        <td className="py-4 px-4">
                          <code className="text-xs font-mono">
                            {formatAddress(payment.id, 6)}
                          </code>
                        </td>
                        <td className="py-4 px-4">
                          <PaymentStatus status={payment.status} />
                        </td>
                        <td className="py-4 px-4">
                          <div className="font-semibold">{formatCurrency(payment.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {payment.expectedAmount} {payment.chain.toUpperCase()}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant="outline" className="uppercase text-xs">
                            {payment.chain}
                          </Badge>
                        </td>
                        <td className="py-4 px-4 text-sm text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4">
                          <Link href={`/pay/${payment.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {payments.map((payment) => (
                  <Card key={payment.id}>
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <code className="text-xs font-mono text-muted-foreground">
                              {formatAddress(payment.id, 6)}
                            </code>
                            <div className="mt-1">
                              <PaymentStatus status={payment.status} />
                            </div>
                          </div>
                          <Badge variant="outline" className="uppercase text-xs">
                            {payment.chain}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{formatCurrency(payment.amount)}</div>
                          <div className="text-sm text-muted-foreground">
                            {payment.expectedAmount} {payment.chain.toUpperCase()}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </div>
                        <Link href={`/pay/${payment.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-muted-foreground">No payments found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusFilter !== 'all'
                  ? `No payments with status "${statusFilter}"`
                  : 'You have no payments yet'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
