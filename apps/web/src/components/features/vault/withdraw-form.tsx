/**
 * Withdraw Form Component
 *
 * Composable form for withdrawing funds from the yield vault.
 * Handles both full and partial withdrawals with validation.
 *
 * @example Basic Usage
 * ```tsx
 * <WithdrawForm
 *   agentAddress="ST1PQHQKV..."
 *   availableBalance="1000.50"
 *   onSuccess={(txId) => console.log('Withdrawn:', txId)}
 * />
 * ```
 *
 * @example With Custom Validation
 * ```tsx
 * <WithdrawForm
 *   agentAddress="ST1PQHQKV..."
 *   availableBalance="1000.50"
 *   minAmount="10"
 *   maxAmount="500"
 *   onSuccess={handleSuccess}
 *   onError={handleError}
 * />
 * ```
 *
 * @example Controlled Component
 * ```tsx
 * const [amount, setAmount] = useState('');
 * <WithdrawForm
 *   agentAddress="ST1PQHQKV..."
 *   availableBalance="1000.50"
 *   amount={amount}
 *   onAmountChange={setAmount}
 * />
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useWithdrawFromVault } from '@/lib/hooks/use-agent';

/**
 * Props for the WithdrawForm component
 */
export interface WithdrawFormProps {
  /** Stacks address of the agent */
  agentAddress: string;
  /** Available balance in the vault (in USDh) */
  availableBalance: string;
  /** Minimum withdrawal amount (optional) */
  minAmount?: string;
  /** Maximum withdrawal amount (optional) */
  maxAmount?: string;
  /** Controlled amount value */
  amount?: string;
  /** Callback when amount changes (for controlled mode) */
  onAmountChange?: (amount: string) => void;
  /** Callback when withdrawal succeeds */
  onSuccess?: (txId: string) => void;
  /** Callback when withdrawal fails */
  onError?: (error: Error) => void;
  /** Custom button text */
  buttonText?: string;
  /** Show fee information */
  showFees?: boolean;
}

/**
 * WithdrawForm Component
 *
 * Provides a user-friendly interface for withdrawing funds from the yield vault.
 * Includes input validation, fee calculation, and success/error handling.
 */
export function WithdrawForm({
  agentAddress,
  availableBalance,
  minAmount = '1',
  maxAmount,
  amount: controlledAmount,
  onAmountChange,
  onSuccess,
  onError,
  buttonText = 'Withdraw',
  showFees = true,
}: WithdrawFormProps) {
  // State management
  const [internalAmount, setInternalAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const withdrawMutation = useWithdrawFromVault(agentAddress);

  // Use controlled or uncontrolled mode
  const amount = controlledAmount !== undefined ? controlledAmount : internalAmount;
  const setAmount = onAmountChange || setInternalAmount;

  // Parse numeric values
  const numericAmount = parseFloat(amount) || 0;
  const numericBalance = parseFloat(availableBalance) || 0;
  const numericMin = parseFloat(minAmount) || 0;
  const numericMax = maxAmount ? parseFloat(maxAmount) : numericBalance;

  // Validation
  const isValidAmount = numericAmount >= numericMin && numericAmount <= numericMax && numericAmount <= numericBalance;
  const canWithdraw = isValidAmount && numericAmount > 0 && !withdrawMutation.isPending;

  /**
   * Calculate withdrawal fee (0.5% default)
   */
  const calculateFee = (withdrawAmount: number): number => {
    return withdrawAmount * 0.005; // 0.5% fee
  };

  /**
   * Calculate net amount after fees
   */
  const calculateNetAmount = (withdrawAmount: number): number => {
    return withdrawAmount - calculateFee(withdrawAmount);
  };

  /**
   * Handle amount input change
   */
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
      setError(null);
    }
  };

  /**
   * Set amount to maximum available balance
   */
  const handleMaxClick = () => {
    setAmount(availableBalance);
    setError(null);
  };

  /**
   * Validate and submit withdrawal
   */
  const handleWithdraw = async () => {
    // Validation
    if (!isValidAmount) {
      setError(`Amount must be between ${formatCurrency(numericMin)} and ${formatCurrency(numericMax)}`);
      return;
    }

    if (numericAmount > numericBalance) {
      setError('Insufficient balance');
      return;
    }

    setError(null);

    try {
      const result = await withdrawMutation.mutateAsync(amount);
      // Success
      onSuccess?.(result.txId);
      setAmount('');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Withdrawal failed');
      setError(error.message);
      onError?.(error);
    }
  };

  /**
   * Handle form submission
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleWithdraw();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Withdraw Funds</CardTitle>
        <CardDescription>
          Withdraw USDh from your yield vault. Available balance: {formatCurrency(numericBalance)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Input */}
          <div className="space-y-2">
            <label htmlFor="withdraw-amount" className="text-sm font-medium">
              Amount (USDh)
            </label>
            <div className="relative">
              <input
                id="withdraw-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={handleAmountChange}
                disabled={withdrawMutation.isPending}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMaxClick}
                disabled={withdrawMutation.isPending}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                Max
              </Button>
            </div>
          </div>

          {/* Fee Information */}
          {showFees && numericAmount > 0 && (
            <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Withdrawal amount:</span>
                <span className="font-medium">{formatCurrency(numericAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee (0.5%):</span>
                <span className="font-medium text-destructive">-{formatCurrency(calculateFee(numericAmount))}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="font-medium">You will receive:</span>
                <span className="font-bold text-lg">{formatCurrency(calculateNetAmount(numericAmount))}</span>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Withdraw Button */}
          <Button type="submit" disabled={!canWithdraw} className="w-full">
            {withdrawMutation.isPending ? 'Processing...' : buttonText}
          </Button>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground text-center">
            Minimum withdrawal: {formatCurrency(numericMin)}
            {maxAmount && ` • Maximum: ${formatCurrency(numericMax)}`}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Compound Component: Withdraw Confirmation Dialog
 *
 * @example
 * ```tsx
 * <WithdrawForm.Confirmation
 *   amount="100.00"
 *   fee="0.50"
 *   netAmount="99.50"
 *   onConfirm={handleConfirm}
 *   onCancel={handleCancel}
 * />
 * ```
 */
WithdrawForm.Confirmation = function WithdrawConfirmation({
  amount,
  fee,
  netAmount,
  onConfirm,
  onCancel,
}: {
  amount: string;
  fee: string;
  netAmount: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm Withdrawal</CardTitle>
        <CardDescription>Please review the withdrawal details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Amount:</span>
            <span className="font-medium">{formatCurrency(amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>Fee:</span>
            <span className="font-medium text-destructive">-{formatCurrency(fee)}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="font-bold">Net Amount:</span>
            <span className="font-bold text-lg">{formatCurrency(netAmount)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="flex-1">
            Confirm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Quick Withdraw Preset Buttons
 *
 * @example
 * ```tsx
 * <WithdrawForm.Presets
 *   availableBalance="1000.00"
 *   onSelect={(amount) => setAmount(amount)}
 * />
 * ```
 */
WithdrawForm.Presets = function WithdrawPresets({
  availableBalance,
  onSelect,
}: {
  availableBalance: string;
  onSelect: (amount: string) => void;
}) {
  const balance = parseFloat(availableBalance) || 0;
  const presets = [
    { label: '25%', value: (balance * 0.25).toFixed(2) },
    { label: '50%', value: (balance * 0.5).toFixed(2) },
    { label: '75%', value: (balance * 0.75).toFixed(2) },
    { label: '100%', value: balance.toFixed(2) },
  ];

  return (
    <div className="flex gap-2">
      {presets.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelect(preset.value)}
          className="flex-1"
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
};
