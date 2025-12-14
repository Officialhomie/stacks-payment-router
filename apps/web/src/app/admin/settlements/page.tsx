/**
 * Admin Settlements Page
 *
 * This page provides administrators with tools to:
 * - View all pending payments requiring settlement
 * - Settle individual payments with one click
 * - Batch settle multiple payments
 * - Monitor settlement status in real-time
 *
 * @route /admin/settlements
 *
 * @example Access
 * ```
 * Navigate to: http://localhost:3000/admin/settlements
 * Requires: Admin privileges (to be implemented)
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PaymentStatus } from '@/components/features/payment/payment-status';
import { SettlementAction, SettlementActionGroup } from '@/components/features/admin/settlement-action';
import { formatCurrency, formatAddress } from '@/lib/utils';

// ============================================================================
// Mock Data (Replace with real API calls)
// ============================================================================

/**
 * Mock pending payments
 * In production, this would come from: GET /api/admin/settlements/pending
 */
const mockPendingPayments = [
  {
    id: 'payment-001',
    agentAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    amount: '150.00',
    expectedAmount: '0.075',
    chain: 'ethereum',
    status: 'detected' as const,
    txHash: '0x1234567890abcdef',
    createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 min ago
    detectedAt: new Date(Date.now() - 1000 * 60 * 5), // 5 min ago
  },
  {
    id: 'payment-002',
    agentAddress: 'ST2REHHS5J3CERCRBEPMGH7921Q6PYKAADT7JP2VB',
    amount: '75.50',
    expectedAmount: '0.038',
    chain: 'arbitrum',
    status: 'detected' as const,
    txHash: '0xabcdef1234567890',
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
    detectedAt: new Date(Date.now() - 1000 * 60 * 10), // 10 min ago
  },
  {
    id: 'payment-003',
    agentAddress: 'ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP',
    amount: '200.00',
    expectedAmount: '0.1',
    chain: 'base',
    status: 'detected' as const,
    txHash: '0xfedcba0987654321',
    createdAt: new Date(Date.now() - 1000 * 60 * 45), // 45 min ago
    detectedAt: new Date(Date.now() - 1000 * 60 * 20), // 20 min ago
  },
];

// ============================================================================
// Main Component
// ============================================================================

/**
 * Admin Settlements Page Component
 *
 * Features:
 * - Real-time pending payment queue
 * - One-click settlement actions
 * - Batch settlement capability
 * - Settlement history view
 * - Status filtering
 */
export default function AdminSettlementsPage() {
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [isLoading] = useState(false);

  // ============================================================================
  // Handlers
  // ============================================================================

  /**
   * Handle individual payment selection
   * Used for batch operations
   */
  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPayments(prev =>
      prev.includes(paymentId)
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  /**
   * Select all payments in the queue
   */
  const selectAll = () => {
    setSelectedPayments(mockPendingPayments.map(p => p.id));
  };

  /**
   * Clear all selections
   */
  const clearSelection = () => {
    setSelectedPayments([]);
  };

  /**
   * Handle batch settlement
   * Settles all selected payments in sequence
   */
  const handleBatchSettle = async () => {
    console.log('Batch settling:', selectedPayments);
    // TODO: Implement batch settlement API call
    // await apiClient.batchSettle(selectedPayments);
  };

  /**
   * Handle successful individual settlement
   */
  const handleSettlementSuccess = (paymentId: string, txId: string) => {
    console.log(`Payment ${paymentId} settled with tx ${txId}`);
    // TODO: Refresh data, show toast notification
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* ===================================================================
          Page Header
          =================================================================== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settlement Queue</h1>
          <p className="text-muted-foreground">
            Review and settle detected payments requiring manual approval
          </p>
        </div>

        {/* Batch Actions */}
        {selectedPayments.length > 0 && (
          <div className="flex gap-2">
            <Badge variant="secondary">
              {selectedPayments.length} selected
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={clearSelection}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={handleBatchSettle}
            >
              Settle Selected
            </Button>
          </div>
        )}
      </div>

      {/* ===================================================================
          Stats Overview
          =================================================================== */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Settlements</CardTitle>
            <PendingIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockPendingPayments.length}</div>
            <p className="text-xs text-muted-foreground">
              Detected payments awaiting settlement
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                mockPendingPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Combined value of pending payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oldest Payment</CardTitle>
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45m</div>
            <p className="text-xs text-muted-foreground">
              Time since oldest detection
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ===================================================================
          Pending Payments Queue
          =================================================================== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending Payments</CardTitle>
              <CardDescription>
                Payments detected on-chain and ready for settlement
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={selectedPayments.length > 0 ? clearSelection : selectAll}
            >
              {selectedPayments.length > 0 ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            // Loading State
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : mockPendingPayments.length > 0 ? (
            // Payments List
            <div className="space-y-4">
              {mockPendingPayments.map((payment) => (
                <PaymentQueueItem
                  key={payment.id}
                  payment={payment}
                  isSelected={selectedPayments.includes(payment.id)}
                  onToggleSelect={() => togglePaymentSelection(payment.id)}
                  onSettlementSuccess={(txId) => handleSettlementSuccess(payment.id, txId)}
                />
              ))}
            </div>
          ) : (
            // Empty State
            <div className="text-center py-12">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-muted-foreground font-medium">All caught up!</p>
              <p className="text-sm text-muted-foreground mt-1">
                No pending payments requiring settlement
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================================================================
          Instructions
          =================================================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong>1. Review pending payments:</strong> Check payment details and transaction hashes</p>
          <p><strong>2. Verify on-chain:</strong> Click transaction hash to view on block explorer</p>
          <p><strong>3. Settle individually:</strong> Click "Settle" button for single payments</p>
          <p><strong>4. Batch settle:</strong> Select multiple payments and click "Settle Selected"</p>
          <p><strong>5. Choose settlement type:</strong> Regular (vault) or Instant (auto-withdraw)</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * PaymentQueueItem
 *
 * Renders a single payment in the settlement queue with all actions.
 * This is a highly composable component that can be customized.
 */
function PaymentQueueItem({
  payment,
  isSelected,
  onToggleSelect,
  onSettlementSuccess,
}: {
  payment: typeof mockPendingPayments[0];
  isSelected: boolean;
  onToggleSelect: () => void;
  onSettlementSuccess: (txId: string) => void;
}) {
  return (
    <div
      className={`
        flex items-center gap-4 p-4 border rounded-lg
        hover:bg-accent/50 transition-colors
        ${isSelected ? 'border-primary bg-accent' : ''}
      `}
    >
      {/* Selection Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className="h-4 w-4 rounded border-gray-300"
      />

      {/* Payment Info */}
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3">
          <PaymentStatus status={payment.status} />
          <code className="text-xs font-mono text-muted-foreground">
            {formatAddress(payment.id, 6)}
          </code>
          <Badge variant="outline" className="uppercase text-xs">
            {payment.chain}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Amount:</span>{' '}
            <span className="font-semibold">{formatCurrency(payment.amount)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Agent:</span>{' '}
            <code className="text-xs">{formatAddress(payment.agentAddress, 4)}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Detected:</span>{' '}
            <span>{Math.round((Date.now() - payment.detectedAt.getTime()) / 60000)}m ago</span>
          </div>
        </div>

        {/* Transaction Hash */}
        <div className="text-xs">
          <a
            href={`https://etherscan.io/tx/${payment.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-mono"
          >
            {payment.txHash}
          </a>
        </div>
      </div>

      {/* Settlement Actions */}
      <SettlementActionGroup intentId={payment.id}>
        <SettlementActionGroup.Regular
          intentId={payment.id}
          onSuccess={onSettlementSuccess}
        />
        <SettlementActionGroup.Instant
          intentId={payment.id}
          onSuccess={onSettlementSuccess}
        />
      </SettlementActionGroup>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function PendingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
