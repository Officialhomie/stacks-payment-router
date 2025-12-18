/**
 * Vault Management Page
 *
 * Allows agents to:
 * - View vault balance and statistics
 * - Monitor earnings and APY
 * - Withdraw funds from the vault
 * - View withdrawal history
 *
 * @route /dashboard/vault
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { VaultStats } from '@/components/features/vault/vault-stats';
import { WithdrawForm } from '@/components/features/vault/withdraw-form';
import { useWallet } from '@/components/providers/wallet-provider';
import { useVaultStats, useWithdrawalHistory } from '@/lib/hooks/use-agent';
import { formatCurrency, formatAddress } from '@/lib/utils';
import type { Withdrawal } from '@/types';

export default function VaultPage() {
  const { connected, address } = useWallet();
  const { data: vaultStats } = useVaultStats(address || null, {
    refetchInterval: 30000, // Refetch every 30 seconds
  });
  const { data: withdrawalHistory = [], isLoading: isLoadingHistory } = useWithdrawalHistory(address || null, {
    limit: 20,
  });
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  /**
   * Handle successful withdrawal
   */
  const handleWithdrawSuccess = (txId: string) => {
    console.log('Withdrawal successful:', txId);
    setShowWithdrawForm(false);
    setWithdrawAmount('');
    // Vault stats will be refetched automatically by the hook
  };

  /**
   * Handle withdrawal error
   */
  const handleWithdrawError = (error: Error) => {
    console.error('Withdrawal failed:', error);
    // Error notification is handled by the hook
  };

  // Check wallet connection
  if (!connected || !address) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Connect Your Wallet</CardTitle>
            <CardDescription>Please connect your wallet to view your vault</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Yield Vault</h1>
        <p className="text-muted-foreground mt-1">Manage your funds and monitor earnings</p>
      </div>

      {/* Vault Statistics */}
      <VaultStats agentAddress={address} refreshInterval={30000} showChart={false} />

      {/* Action Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Withdraw Form */}
        {showWithdrawForm ? (
          <div className="space-y-4">
            <WithdrawForm
              agentAddress={address}
              availableBalance={vaultStats?.balance || '0'}
              amount={withdrawAmount}
              onAmountChange={setWithdrawAmount}
              onSuccess={handleWithdrawSuccess}
              onError={handleWithdrawError}
              showFees
            />

            {/* Quick Presets */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Amounts</CardTitle>
              </CardHeader>
              <CardContent>
                <WithdrawForm.Presets
                  availableBalance={vaultStats?.balance || '0'}
                  onSelect={setWithdrawAmount}
                />
              </CardContent>
            </Card>

            <Button variant="outline" onClick={() => setShowWithdrawForm(false)} className="w-full">
              Cancel
            </Button>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Withdraw Funds</CardTitle>
              <CardDescription>
                Withdraw USDh from your vault to your Stacks wallet
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-3xl font-bold mt-1">{formatCurrency(vaultStats?.balance || '0')}</p>
              </div>
              <Button onClick={() => setShowWithdrawForm(true)} className="w-full">
                Withdraw Funds
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Withdrawal fee: 0.5% • Minimum: $1.00
              </p>
            </CardContent>
          </Card>
        )}

        {/* Info Cards */}
        <div className="space-y-4">
          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How Withdrawals Work</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium">Enter amount</p>
                  <p className="text-muted-foreground">Specify how much USDh to withdraw</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium">Review fees</p>
                  <p className="text-muted-foreground">0.5% withdrawal fee is deducted</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium">Confirm transaction</p>
                  <p className="text-muted-foreground">Sign with your Stacks wallet</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  4
                </div>
                <div>
                  <p className="font-medium">Receive funds</p>
                  <p className="text-muted-foreground">USDh sent to your wallet (~2 min)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vault Benefits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vault Benefits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 text-green-600 flex-shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p>
                  <strong>Earn Yield:</strong> Auto-deposits into DeFi protocols
                </p>
              </div>
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 text-green-600 flex-shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p>
                  <strong>Withdraw Anytime:</strong> No lock-up periods
                </p>
              </div>
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 text-green-600 flex-shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p>
                  <strong>Compound Interest:</strong> Earnings automatically reinvested
                </p>
              </div>
              <div className="flex items-start gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5 text-green-600 flex-shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p>
                  <strong>Transparent:</strong> View earnings in real-time
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Withdrawal History */}
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal History</CardTitle>
          <CardDescription>Your past withdrawals from the vault</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading withdrawal history...</p>
            </div>
          ) : withdrawalHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No withdrawals yet</p>
              <p className="text-sm mt-1">Your withdrawal history will appear here</p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Date</th>
                      <th className="text-left py-3 px-4">Amount</th>
                      <th className="text-left py-3 px-4">Transaction</th>
                      <th className="text-left py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawalHistory.map((withdrawal: Withdrawal) => (
                      <tr key={withdrawal.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">
                          {withdrawal.requestedAt
                            ? new Date(withdrawal.requestedAt).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-medium">{formatCurrency(withdrawal.amount)}</td>
                        <td className="py-3 px-4">
                          {withdrawal.txHash ? (
                            <a
                              href={`https://explorer.hiro.so/txid/${withdrawal.txHash}?chain=testnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {formatAddress(withdrawal.txHash, 6)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              withdrawal.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : withdrawal.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {withdrawal.status === 'completed'
                              ? '✅ Completed'
                              : withdrawal.status === 'failed'
                              ? '❌ Failed'
                              : '⏳ Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {withdrawalHistory.map((withdrawal: Withdrawal) => (
                  <Card key={withdrawal.id}>
                    <CardContent className="py-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-muted-foreground">Amount</p>
                          <p className="text-lg font-bold">{formatCurrency(withdrawal.amount)}</p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            withdrawal.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : withdrawal.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {withdrawal.status === 'completed'
                            ? '✅ Completed'
                            : withdrawal.status === 'failed'
                            ? '❌ Failed'
                            : '⏳ Pending'}
                        </span>
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground">
                          {withdrawal.requestedAt
                            ? new Date(withdrawal.requestedAt).toLocaleDateString()
                            : 'N/A'}
                        </p>
                      </div>
                      {withdrawal.txHash && (
                        <div>
                          <a
                            href={`https://explorer.hiro.so/txid/${withdrawal.txHash}?chain=testnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            View transaction →
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
