'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { connectWallet, disconnectWallet, getUserAddress, isUserSignedIn, getUserData } from '@/lib/stacks/wallet';
import type { WalletState } from '@/types';

interface WalletContextValue extends WalletState {
  connect: () => void;
  disconnect: () => void;
  isConnecting: boolean;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

/**
 * Wallet Provider Component
 * Manages Stacks wallet connection state
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: undefined,
    network: undefined,
    balance: undefined,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  // Initialize wallet state on mount
  useEffect(() => {
    const initializeWallet = () => {
      const isSignedIn = isUserSignedIn();
      if (isSignedIn) {
        const address = getUserAddress();
        const userData = getUserData();
        setState({
          connected: true,
          address: address || undefined,
          network: process.env.NEXT_PUBLIC_NETWORK as any || 'testnet',
          balance: undefined, // Will be fetched separately
        });
      }
    };

    initializeWallet();
  }, []);

  // Connect wallet
  const connect = useCallback(() => {
    setIsConnecting(true);
    connectWallet(
      (userData) => {
        console.log('Wallet connected:', userData);
        const address = userData.profile?.stxAddress?.testnet || userData.profile?.stxAddress?.mainnet;
        setState({
          connected: true,
          address,
          network: process.env.NEXT_PUBLIC_NETWORK as any || 'testnet',
          balance: undefined,
        });
        setIsConnecting(false);
      },
      () => {
        console.log('Wallet connection cancelled');
        setIsConnecting(false);
      }
    );
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    disconnectWallet();
    setState({
      connected: false,
      address: undefined,
      network: undefined,
      balance: undefined,
    });
  }, []);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    isConnecting,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

/**
 * Hook to use wallet context
 */
export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
