import { AppConfig, UserSession, showConnect } from '@stacks/connect';
import { StacksMainnet, StacksTestnet } from '@stacks/network';
import { NETWORK, stacksConfig } from './config';

/**
 * App configuration for Stacks Connect
 */
export const appConfig = new AppConfig(['store_write', 'publish_data']);

/**
 * User session for managing wallet connection
 */
export const userSession = new UserSession({ appConfig });

/**
 * Connect to Stacks wallet
 */
export function connectWallet(
  onFinish: (userData: any) => void,
  onCancel?: () => void
): void {
  showConnect({
    appDetails: {
      name: 'Stacks Payment Router',
      icon: typeof window !== 'undefined' ? window.location.origin + '/logo.png' : '',
    },
    redirectTo: '/',
    onFinish,
    onCancel,
    userSession,
  });
}

/**
 * Disconnect wallet
 */
export function disconnectWallet(): void {
  userSession.signUserOut();
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/**
 * Get current user data
 */
export function getUserData() {
  if (!userSession.isUserSignedIn()) {
    return null;
  }

  return userSession.loadUserData();
}

/**
 * Get user's Stacks address
 */
export function getUserAddress(): string | null {
  const userData = getUserData();
  if (!userData) return null;

  const network = NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
  return userData.profile?.stxAddress?.[network] || null;
}

/**
 * Check if user is signed in
 */
export function isUserSignedIn(): boolean {
  return userSession.isUserSignedIn();
}

/**
 * Get authentication state
 */
export function getAuthState() {
  return {
    isSignedIn: isUserSignedIn(),
    userData: getUserData(),
    address: getUserAddress(),
  };
}
