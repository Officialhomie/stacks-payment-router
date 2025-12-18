/**
 * Settlement Action Component
 *
 * A composable component for settling payments with one-click actions.
 * This component handles the settlement flow and provides visual feedback.
 *
 * @example Basic Usage
 * ```tsx
 * <SettlementAction
 *   intentId="payment-123"
 *   onSuccess={() => console.log('Settled!')}
 * />
 * ```
 *
 * @example With Custom Styling
 * ```tsx
 * <SettlementAction
 *   intentId="payment-123"
 *   variant="destructive"
 *   size="lg"
 *   showIcon={false}
 *   onSuccess={handleSuccess}
 *   onError={handleError}
 * />
 * ```
 *
 * @example As a Dropdown Option
 * ```tsx
 * <SettlementAction
 *   intentId="payment-123"
 *   asChild
 * >
 *   <DropdownMenuItem>Settle Payment</DropdownMenuItem>
 * </SettlementAction>
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSettlement } from '@/lib/hooks/use-settlement';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

/**
 * Props for the SettlementAction component
 */
interface SettlementActionProps {
  /** Unique identifier for the payment intent to settle */
  intentId: string;

  /** Whether to enable auto-withdraw mode (instant settlement) */
  autoWithdraw?: boolean;

  /** Button variant - controls the visual style */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';

  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';

  /** Whether to show the settlement icon */
  showIcon?: boolean;

  /** Custom class names for styling */
  className?: string;

  /** Callback fired when settlement succeeds */
  onSuccess?: (txId: string) => void;

  /** Callback fired when settlement fails */
  onError?: (error: Error) => void;

  /** Whether to render as a child component (for dropdowns, etc.) */
  asChild?: boolean;

  /** Whether the button is disabled */
  disabled?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * SettlementAction Component
 *
 * Provides a one-click interface for settling payments. Handles loading states,
 * success/error feedback, and integrates with the settlement API.
 *
 * Features:
 * - One-click settlement
 * - Loading states with spinner
 * - Success/error feedback
 * - Auto-withdraw option
 * - Composable design (works as button or dropdown item)
 */
export function SettlementAction({
  intentId,
  autoWithdraw = false,
  variant = 'default',
  size = 'default',
  showIcon = true,
  className,
  onSuccess,
  onError,
  asChild = false,
  disabled = false,
}: SettlementActionProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const settlementMutation = useSettlement();

  /**
   * Handle settlement action
   *
   * This function:
   * 1. Sets loading state
   * 2. Calls the settlement API
   * 3. Handles success/error
   * 4. Fires appropriate callbacks
   */
  const handleSettle = async () => {
    try {
      setStatus('idle');

      const result = await settlementMutation.mutateAsync({
        intentId,
        autoWithdraw,
      });

      setStatus('success');

      if (onSuccess) {
        onSuccess(result.txId);
      }

      // Reset status after 2 seconds
      setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      setStatus('error');

      if (onError) {
        onError(error as Error);
      }

      // Reset status after 3 seconds
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  // Success state
  if (status === 'success') {
    return (
      <Badge variant="success" className={cn('gap-1', className)}>
        <CheckIcon className="h-3 w-3" />
        Settled!
      </Badge>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <Badge variant="destructive" className={cn('gap-1', className)}>
        <XIcon className="h-3 w-3" />
        Failed
      </Badge>
    );
  }

  // Default button state
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSettle}
      disabled={disabled || settlementMutation.isPending}
      className={cn('gap-2', className)}
      asChild={asChild}
    >
      {settlementMutation.isPending ? (
        <>
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Settling...
        </>
      ) : (
        <>
          {showIcon && <SettleIcon className="h-4 w-4" />}
          Settle {autoWithdraw ? '(Instant)' : ''}
        </>
      )}
    </Button>
  );
}

// ============================================================================
// Compound Components (for advanced composition)
// ============================================================================

/**
 * SettlementActionGroup
 *
 * Groups regular and instant settlement actions together.
 * Use this when you want to offer both settlement options.
 *
 * @example
 * ```tsx
 * <SettlementActionGroup intentId="payment-123">
 *   <SettlementActionGroup.Regular />
 *   <SettlementActionGroup.Instant />
 * </SettlementActionGroup>
 * ```
 */
export function SettlementActionGroup({
  children,
  intentId,
  className,
}: {
  children: React.ReactNode;
  intentId: string;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-2', className)} data-intent-id={intentId}>
      {children}
    </div>
  );
}

/**
 * Regular settlement button (deposits to vault)
 */
SettlementActionGroup.Regular = function Regular({
  intentId,
  ...props
}: Omit<SettlementActionProps, 'autoWithdraw'>) {
  return <SettlementAction {...props} intentId={intentId} autoWithdraw={false} />;
};

/**
 * Instant settlement button (auto-withdraw enabled)
 */
SettlementActionGroup.Instant = function Instant({
  intentId,
  ...props
}: Omit<SettlementActionProps, 'autoWithdraw'>) {
  return (
    <SettlementAction
      {...props}
      intentId={intentId}
      autoWithdraw={true}
      variant="secondary"
    />
  );
};

// ============================================================================
// Helper Components & Icons
// ============================================================================

function SettleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
