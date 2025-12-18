'use client';

import React from 'react';
import { QueryProvider } from './query-provider';
import { WalletProvider } from './wallet-provider';
import { ToastProvider } from './toast-provider';

/**
 * Root Providers Component
 * Combines all providers needed for the app
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <WalletProvider>
        <ToastProvider />
        {children}
      </WalletProvider>
    </QueryProvider>
  );
}
