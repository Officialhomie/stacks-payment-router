import { STACKS_MAINNET, STACKS_TESTNET, type StacksNetwork } from '@stacks/network';
import type { Network } from '@/types';

/**
 * Stacks configuration based on network
 */
export interface StacksConfig {
  network: StacksNetwork;
  contractAddress: string;
  contractName: {
    paymentRouter: string;
    agentRegistry: string;
    yieldVault: string;
    mockToken: string;
  };
  explorerUrl: string;
  apiUrl: string;
}

/**
 * Get Stacks configuration for the current network
 */
export function getStacksConfig(networkType: Network = 'testnet'): StacksConfig {
  const isMainnet = networkType === 'mainnet';

  return {
    network: isMainnet ? STACKS_MAINNET : STACKS_TESTNET,

    // Contract address (update with your deployed addresses)
    contractAddress: process.env.NEXT_PUBLIC_STACKS_CONTRACT_ADDRESS ||
      'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',

    contractName: {
      paymentRouter: 'payment-router',
      agentRegistry: 'agent-registry',
      yieldVault: 'yield-vault',
      mockToken: 'mock-usdh-token',
    },

    explorerUrl: isMainnet
      ? 'https://explorer.hiro.so'
      : 'https://explorer.hiro.so',

    apiUrl: isMainnet
      ? 'https://api.hiro.so'
      : 'https://api.testnet.hiro.so',
  };
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(txId: string, networkType: Network = 'testnet'): string {
  const config = getStacksConfig(networkType);
  const chain = networkType === 'mainnet' ? 'mainnet' : 'testnet';
  return `${config.explorerUrl}/txid/${txId}?chain=${chain}`;
}

/**
 * Get explorer URL for an address
 */
export function getExplorerAddressUrl(address: string, networkType: Network = 'testnet'): string {
  const config = getStacksConfig(networkType);
  const chain = networkType === 'mainnet' ? 'mainnet' : 'testnet';
  return `${config.explorerUrl}/address/${address}?chain=${chain}`;
}

/**
 * Get explorer URL for a contract
 */
export function getExplorerContractUrl(
  contractId: string,
  networkType: Network = 'testnet'
): string {
  const config = getStacksConfig(networkType);
  const chain = networkType === 'mainnet' ? 'mainnet' : 'testnet';
  return `${config.explorerUrl}/txid/${contractId}?chain=${chain}`;
}

/**
 * Network type from environment
 */
export const NETWORK: Network = (process.env.NEXT_PUBLIC_NETWORK as Network) || 'testnet';

/**
 * Default Stacks config
 */
export const stacksConfig = getStacksConfig(NETWORK);
