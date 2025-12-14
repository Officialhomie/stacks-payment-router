'use client';

import React from 'react';
import { useWallet } from '@/components/providers/wallet-provider';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface WalletConnectButtonProps {
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  showAddress?: boolean;
}

/**
 * Wallet Connect Button
 * Shows "Connect Wallet" when disconnected, shows address when connected
 */
export function WalletConnectButton({
  className,
  size = 'default',
  variant = 'default',
  showAddress = true,
}: WalletConnectButtonProps) {
  const { connected, address, connect, disconnect, isConnecting } = useWallet();

  if (connected && address) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={disconnect}
        className={cn('gap-2', className)}
      >
        <WalletIcon className="h-4 w-4" />
        {showAddress && <span className="font-mono">{formatAddress(address, 4)}</span>}
        <DisconnectIcon className="h-3 w-3 opacity-50" />
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={connect}
      disabled={isConnecting}
      className={cn('gap-2', className)}
    >
      {isConnecting ? (
        <>
          <SpinnerIcon className="h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <WalletIcon className="h-4 w-4" />
          Connect Wallet
        </>
      )}
    </Button>
  );
}

/**
 * Wallet Connect Button with Dropdown
 * Shows wallet info and disconnect option
 */
export function WalletConnectDropdown({
  className,
}: {
  className?: string;
}) {
  const { connected, address, network, connect, disconnect, isConnecting } = useWallet();

  if (!connected) {
    return <WalletConnectButton className={className} />;
  }

  return (
    <div className={cn('relative', className)}>
      <Button variant="outline" className="gap-2">
        <WalletIcon className="h-4 w-4" />
        <div className="flex flex-col items-start">
          <span className="text-xs font-medium">{formatAddress(address!, 4)}</span>
          <span className="text-[10px] text-muted-foreground capitalize">{network}</span>
        </div>
      </Button>
      {/* Dropdown menu would go here - can add later */}
    </div>
  );
}

// Simple SVG Icons
function WalletIcon({ className }: { className?: string }) {
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
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

function DisconnectIcon({ className }: { className?: string }) {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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
