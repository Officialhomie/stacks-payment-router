/**
 * Address Generator
 *
 * Generates Ethereum payment addresses for payment intents.
 * For MVP: Uses a single HD wallet to generate deterministic addresses.
 *
 * Future: Generate unique addresses per payment intent for better tracking.
 */

import { ethers } from 'ethers';
import { logger } from '@shared/utils/logger';

export interface GeneratedAddress {
  address: string;
  chain: string;
  intentId: string;
  derivationPath?: string;
}

export class AddressGenerator {
  private wallet: ethers.Wallet;
  private usedIndices: Set<number> = new Set();

  constructor(mnemonic: string) {
    if (!mnemonic) {
      throw new Error('HD wallet mnemonic is required');
    }

    try {
      this.wallet = ethers.Wallet.fromMnemonic(mnemonic);
      logger.info('AddressGenerator initialized', {
        masterAddress: this.wallet.address
      });
    } catch (error: any) {
      logger.error('Failed to initialize AddressGenerator', { error: error.message });
      throw new Error(`Invalid mnemonic: ${error.message}`);
    }
  }

  /**
   * Generate a deterministic Ethereum address for a payment intent
   * Uses HD wallet derivation: m/44'/60'/0'/0/index
   */
  async generateAddress(intentId: string, index?: number): Promise<GeneratedAddress> {
    try {
      // For MVP, use a simple derivation path
      // In production, you'd want to track used indices in database
      const derivationIndex = index ?? this.getNextAvailableIndex();
      const derivationPath = `m/44'/60'/0'/0/${derivationIndex}`;

      const derived = ethers.Wallet.fromMnemonic(
        this.wallet.mnemonic.phrase,
        derivationPath
      );

      this.usedIndices.add(derivationIndex);

      logger.info('Generated payment address', {
        intentId,
        address: derived.address,
        derivationPath
      });

      return {
        address: derived.address,
        chain: 'ethereum',
        intentId,
        derivationPath
      };
    } catch (error: any) {
      logger.error('Failed to generate address', {
        intentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get the private key for a specific address
   * Used for signing transactions when settling
   */
  getPrivateKey(derivationPath: string): string {
    const derived = ethers.Wallet.fromMnemonic(
      this.wallet.mnemonic.phrase,
      derivationPath
    );
    return derived.privateKey;
  }

  /**
   * Get wallet for a specific derivation path
   */
  getWallet(derivationPath: string): ethers.Wallet {
    return ethers.Wallet.fromMnemonic(
      this.wallet.mnemonic.phrase,
      derivationPath
    );
  }

  /**
   * For MVP: Simple counter for derivation indices
   * In production: Query database for max index used
   */
  private getNextAvailableIndex(): number {
    let index = 0;
    while (this.usedIndices.has(index)) {
      index++;
    }
    return index;
  }

  /**
   * Generate multiple addresses (batch)
   */
  async generateBatch(intentIds: string[]): Promise<GeneratedAddress[]> {
    const addresses: GeneratedAddress[] = [];

    for (let i = 0; i < intentIds.length; i++) {
      const address = await this.generateAddress(intentIds[i], i);
      addresses.push(address);
    }

    return addresses;
  }

  /**
   * Verify an address belongs to our HD wallet
   */
  verifyAddress(address: string, derivationPath: string): boolean {
    try {
      const derived = ethers.Wallet.fromMnemonic(
        this.wallet.mnemonic.phrase,
        derivationPath
      );
      return derived.address.toLowerCase() === address.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * Get master wallet address (for admin/testing)
   */
  getMasterAddress(): string {
    return this.wallet.address;
  }
}

/**
 * Singleton instance
 */
let addressGenerator: AddressGenerator | null = null;

export function initAddressGenerator(mnemonic: string): AddressGenerator {
  if (!addressGenerator) {
    addressGenerator = new AddressGenerator(mnemonic);
  }
  return addressGenerator;
}

export function getAddressGenerator(): AddressGenerator {
  if (!addressGenerator) {
    throw new Error('AddressGenerator not initialized. Call initAddressGenerator first.');
  }
  return addressGenerator;
}
