'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import type { PaymentStatus as PaymentStatusType } from '@/types';
import { cn } from '@/lib/utils';

interface PaymentStatusProps {
  status: PaymentStatusType;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<
  PaymentStatusType,
  {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    icon: string;
    description: string;
  }
> = {
  pending: {
    label: 'Pending',
    variant: 'warning',
    icon: '⏳',
    description: 'Waiting for payment',
  },
  detected: {
    label: 'Detected',
    variant: 'default',
    icon: '👁️',
    description: 'Payment detected, processing settlement',
  },
  settled: {
    label: 'Settled',
    variant: 'success',
    icon: '✅',
    description: 'Payment settled successfully',
  },
  expired: {
    label: 'Expired',
    variant: 'secondary',
    icon: '⏱️',
    description: 'Payment window expired',
  },
  failed: {
    label: 'Failed',
    variant: 'destructive',
    icon: '❌',
    description: 'Payment failed',
  },
};

/**
 * Payment Status Badge Component
 * Displays the current status of a payment with color coding
 */
export function PaymentStatus({
  status,
  className,
  showIcon = true,
}: PaymentStatusProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <Badge variant={config.variant} className={cn('font-medium', className)}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </Badge>
  );
}

/**
 * Payment Status with Description
 */
export function PaymentStatusDetailed({
  status,
  className,
}: {
  status: PaymentStatusType;
  className?: string;
}) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className={cn('flex items-start space-x-3', className)}>
      <span className="text-2xl">{config.icon}</span>
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <h4 className="font-semibold">{config.label}</h4>
          <PaymentStatus status={status} showIcon={false} />
        </div>
        <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
      </div>
    </div>
  );
}

/**
 * Animated status indicator for pending/detecting states
 */
export function PaymentStatusAnimated({
  status,
  className,
}: {
  status: PaymentStatusType;
  className?: string;
}) {
  const config = statusConfig[status] || statusConfig.pending;
  const isActive = status === 'pending' || status === 'detected';

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div
        className={cn(
          'h-3 w-3 rounded-full',
          isActive && 'animate-pulse',
          status === 'pending' && 'bg-yellow-500',
          status === 'detected' && 'bg-blue-500',
          status === 'settled' && 'bg-green-500',
          status === 'expired' && 'bg-gray-500',
          status === 'failed' && 'bg-red-500'
        )}
      />
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}
