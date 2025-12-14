'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  expiresAt: Date | string;
  onExpire?: () => void;
  className?: string;
  showIcon?: boolean;
}

/**
 * Countdown Timer Component
 * Shows time remaining until payment expires
 */
export function CountdownTimer({
  expiresAt,
  onExpire,
  className,
  showIcon = true,
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, isExpired: false });

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        if (onExpire) {
          onExpire();
        }
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ hours, minutes, seconds, isExpired: false });
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  if (timeRemaining.isExpired) {
    return (
      <div className={cn('flex items-center space-x-2 text-destructive', className)}>
        {showIcon && <span className="text-lg">⏱️</span>}
        <span className="font-semibold">Expired</span>
      </div>
    );
  }

  const isUrgent = timeRemaining.hours === 0 && timeRemaining.minutes < 5;

  return (
    <div
      className={cn(
        'flex items-center space-x-2',
        isUrgent && 'text-destructive animate-pulse',
        className
      )}
    >
      {showIcon && <span className="text-lg">⏱️</span>}
      <div className="flex items-center space-x-1 font-mono text-lg font-semibold">
        {timeRemaining.hours > 0 && (
          <>
            <span className="tabular-nums">{String(timeRemaining.hours).padStart(2, '0')}</span>
            <span className="text-muted-foreground">:</span>
          </>
        )}
        <span className="tabular-nums">{String(timeRemaining.minutes).padStart(2, '0')}</span>
        <span className="text-muted-foreground">:</span>
        <span className="tabular-nums">{String(timeRemaining.seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
}

/**
 * Countdown Timer with Label
 */
export function CountdownTimerWithLabel({
  expiresAt,
  onExpire,
  className,
}: {
  expiresAt: Date | string;
  onExpire?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col space-y-1', className)}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">Time Remaining</span>
      <CountdownTimer expiresAt={expiresAt} onExpire={onExpire} />
    </div>
  );
}
