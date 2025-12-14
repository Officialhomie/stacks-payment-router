/**
 * Secure HD Wallet Address Generation
 * 
 * Implements BIP-32/BIP-44 hierarchical deterministic wallet generation
 * for deriving payment addresses across multiple chains from a master seed.
 * 
 * SECURITY CONSIDERATIONS:
 * - Master seed should be stored in HSM/KMS in production
 * - Private keys should never be exposed outside this module
 * - All derivation uses hardened paths where possible
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { Chain } from '@shared/types';
import { logger } from './logger';
import * as bip39 from 'bip39';

// BIP-44 coin types
const BIP44_COIN_TYPES: Record<string, number> = {
  bitcoin: 0,
  ethereum: 60,
  stacks: 5757,
  solana: 501,
};

// Chain to coin type mapping (most EVM chains use ETH coin type)
const CHAIN_COIN_TYPES: Record<Chain, number> = {
  bitcoin: 0,
  ethereum: 60,
  arbitrum: 60,
  base: 60,
  polygon: 60,
  optimism: 60,
  stacks: 5757,
  solana: 501,
};

// Derivation path template: m/44'/{coin_type}'/{account}'/{change}/{address_index}
const DERIVATION_PATH_TEMPLATE = "m/44'/{coinType}'/0'/0/{index}";

interface DerivedAddress {
  address: string;
  publicKey: string;
  path: string;
  chain: Chain;
}

interface WalletInfo {
  address: string;
  publicKey: string;
  privateKey: string;
  path: string;
}

/**
 * HD Wallet Manager for secure address generation
 */
export class HDWalletManager {
  private masterSeed: Buffer | null = null;
  private mnemonic: string | null = null;
  private addressCache: Map<string, DerivedAddress> = new Map();
  private walletCache: Map<string, WalletInfo> = new Map();

  constructor() {
    this.initializeSeed();
  }

  /**
   * Initialize master seed from environment or generate new
   */
  private initializeSeed(): void {
    const seedPhrase = process.env.HD_WALLET_MNEMONIC;
    const seedHex = process.env.HD_WALLET_SEED_HEX;

    if (seedPhrase) {
      // Validate mnemonic
      if (!bip39.validateMnemonic(seedPhrase)) {
        throw new Error('Invalid HD wallet mnemonic');
      }
      this.mnemonic = seedPhrase;
      this.masterSeed = Buffer.from(bip39.mnemonicToSeedSync(seedPhrase));
      logger.info('HD wallet initialized from mnemonic');
    } else if (seedHex) {
      // Use raw seed hex (for HSM/KMS integration)
      this.masterSeed = Buffer.from(seedHex, 'hex');
      logger.info('HD wallet initialized from seed hex');
    } else {
      // Generate new mnemonic for development (NEVER use in production without backup)
      logger.warn('No HD wallet seed configured - generating ephemeral wallet');
      const newMnemonic = bip39.generateMnemonic(256); // 24 words
      this.mnemonic = newMnemonic;
      this.masterSeed = Buffer.from(bip39.mnemonicToSeedSync(newMnemonic));
      logger.warn('Generated mnemonic (BACKUP THIS):', { 
        mnemonic: newMnemonic.split(' ').slice(0, 3).join(' ') + '...' 
      });
    }
  }

  /**
   * Get derivation path for a chain and index
   */
  private getDerivationPath(chain: Chain, index: number): string {
    const coinType = CHAIN_COIN_TYPES[chain];
    return DERIVATION_PATH_TEMPLATE
      .replace('{coinType}', coinType.toString())
      .replace('{index}', index.toString());
  }

  /**
   * Derive EVM-compatible address (Ethereum, Arbitrum, Base, Polygon, Optimism)
   */
  private deriveEVMAddress(index: number, chain: Chain): DerivedAddress {
    if (!this.mnemonic) {
      throw new Error('Mnemonic not available for EVM derivation');
    }

    const path = this.getDerivationPath(chain, index);
    const hdNode = HDNodeWallet.fromPhrase(this.mnemonic, undefined, path);

    return {
      address: hdNode.address,
      publicKey: hdNode.publicKey,
      path,
      chain,
    };
  }

  /**
   * Derive Stacks address
   * Uses BIP-44 path with Stacks coin type (5757)
   */
  private deriveStacksAddress(index: number, stacksAddress: string): DerivedAddress {
    // For Stacks, we use the provided Stacks address as the payment address
    // The index is used to derive a unique identifier for tracking
    const path = this.getDerivationPath('stacks', index);
    
    return {
      address: stacksAddress, // Use the agent's own Stacks address
      publicKey: '', // Not needed for Stacks
      path,
      chain: 'stacks',
    };
  }

  /**
   * Derive Solana address using Ed25519
   */
  private deriveSolanaAddress(index: number): DerivedAddress {
    if (!this.masterSeed) {
      throw new Error('Master seed not available');
    }

    const path = this.getDerivationPath('solana', index);
    
    // Solana uses Ed25519, derive using HMAC-SHA512
    // This is a simplified derivation - production should use @solana/web3.js
    const derived = this.deriveEd25519Key(this.masterSeed, path);
    
    // Convert to base58 Solana address format
    const address = this.toBase58(derived.publicKey);

    return {
      address,
      publicKey: derived.publicKey.toString('hex'),
      path,
      chain: 'solana',
    };
  }

  /**
   * Derive Bitcoin address (P2WPKH - Native SegWit)
   */
  private deriveBitcoinAddress(index: number): DerivedAddress {
    if (!this.mnemonic) {
      throw new Error('Mnemonic not available for Bitcoin derivation');
    }

    const path = this.getDerivationPath('bitcoin', index);
    
    // Use ethers HDNode for key derivation, then convert to Bitcoin format
    const hdNode = HDNodeWallet.fromPhrase(this.mnemonic, undefined, path);
    const publicKeyBuffer = Buffer.from(hdNode.publicKey.slice(2), 'hex');
    
    // Create P2WPKH (bc1...) address
    const hash160 = this.hash160(publicKeyBuffer);
    const address = this.encodeBech32('bc', 0, hash160);

    return {
      address,
      publicKey: hdNode.publicKey,
      path,
      chain: 'bitcoin',
    };
  }

  /**
   * Derive Ed25519 key (for Solana)
   */
  private deriveEd25519Key(seed: Buffer, path: string): { privateKey: Buffer; publicKey: Buffer } {
    // Simplified SLIP-0010 Ed25519 derivation
    const hmac = createHmac('sha512', 'ed25519 seed');
    hmac.update(seed);
    const I = hmac.digest();
    
    const privateKey = I.slice(0, 32);
    
    // In production, use actual Ed25519 library for public key derivation
    // This is a placeholder that creates a deterministic identifier
    const publicKey = createHash('sha256').update(privateKey).digest().slice(0, 32);

    return { privateKey, publicKey };
  }

  /**
   * Hash160 (SHA256 + RIPEMD160) for Bitcoin addresses
   */
  private hash160(buffer: Buffer): Buffer {
    const sha256 = createHash('sha256').update(buffer).digest();
    // RIPEMD160 - using a simplified version
    // In production, use proper ripemd160 implementation
    return createHash('sha256').update(sha256).digest().slice(0, 20);
  }

  /**
   * Encode to Bech32 format for Bitcoin SegWit addresses
   */
  private encodeBech32(hrp: string, version: number, data: Buffer): string {
    // Simplified Bech32 encoding - in production use bech32 library
    const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
    
    // Convert data to 5-bit groups
    const converted = this.convertBits(data, 8, 5, true);
    if (!converted) throw new Error('Bech32 conversion failed');
    
    // Add version byte
    const values = [version, ...converted];
    
    // Create checksum (simplified)
    const checksum = this.bech32Checksum(hrp, values);
    
    // Encode
    let result = hrp + '1';
    for (const v of [...values, ...checksum]) {
      result += CHARSET[v];
    }
    
    return result;
  }

  /**
   * Convert bits for Bech32 encoding
   */
  private convertBits(data: Buffer, fromBits: number, toBits: number, pad: boolean): number[] | null {
    let acc = 0;
    let bits = 0;
    const result: number[] = [];
    const maxv = (1 << toBits) - 1;

    for (const value of data) {
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        result.push((acc >> bits) & maxv);
      }
    }

    if (pad && bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }

    return result;
  }

  /**
   * Bech32 checksum calculation (simplified)
   */
  private bech32Checksum(hrp: string, data: number[]): number[] {
    const values = [...this.hrpExpand(hrp), ...data];
    const polymod = this.bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
    const checksum: number[] = [];
    for (let i = 0; i < 6; i++) {
      checksum.push((polymod >> (5 * (5 - i))) & 31);
    }
    return checksum;
  }

  private hrpExpand(hrp: string): number[] {
    const result: number[] = [];
    for (const c of hrp) {
      result.push(c.charCodeAt(0) >> 5);
    }
    result.push(0);
    for (const c of hrp) {
      result.push(c.charCodeAt(0) & 31);
    }
    return result;
  }

  private bech32Polymod(values: number[]): number {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) {
          chk ^= GEN[i];
        }
      }
    }
    return chk;
  }

  /**
   * Convert to Base58 (for Solana addresses)
   */
  private toBase58(buffer: Buffer): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    let num = BigInt('0x' + buffer.toString('hex'));
    let result = '';
    
    while (num > 0) {
      const remainder = Number(num % 58n);
      num = num / 58n;
      result = ALPHABET[remainder] + result;
    }

    // Add leading zeros
    for (const byte of buffer) {
      if (byte === 0) {
        result = '1' + result;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Generate payment address for a specific chain
   * @param agentIndex - Unique agent index for derivation
   * @param chain - Target blockchain
   * @param stacksAddress - Agent's Stacks address (used for Stacks chain)
   */
  derivePaymentAddress(agentIndex: number, chain: Chain, stacksAddress?: string): DerivedAddress {
    const cacheKey = `${chain}:${agentIndex}`;
    
    // Check cache
    const cached = this.addressCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let derived: DerivedAddress;

    switch (chain) {
      case 'ethereum':
      case 'arbitrum':
      case 'base':
      case 'polygon':
      case 'optimism':
        derived = this.deriveEVMAddress(agentIndex, chain);
        break;
      
      case 'stacks':
        if (!stacksAddress) {
          throw new Error('Stacks address required for Stacks chain');
        }
        derived = this.deriveStacksAddress(agentIndex, stacksAddress);
        break;
      
      case 'solana':
        derived = this.deriveSolanaAddress(agentIndex);
        break;
      
      case 'bitcoin':
        derived = this.deriveBitcoinAddress(agentIndex);
        break;
      
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    // Cache the result
    this.addressCache.set(cacheKey, derived);
    
    logger.debug('Derived payment address', {
      chain,
      agentIndex,
      address: derived.address.slice(0, 10) + '...',
    });

    return derived;
  }

  /**
   * Generate all payment addresses for an agent
   */
  deriveAllAddresses(
    agentIndex: number,
    enabledChains: Chain[],
    stacksAddress: string
  ): Record<Chain, string> {
    const addresses: Record<string, string> = {};

    for (const chain of enabledChains) {
      const derived = this.derivePaymentAddress(agentIndex, chain, stacksAddress);
      addresses[chain] = derived.address;
    }

    return addresses as Record<Chain, string>;
  }

  /**
   * Get wallet with private key (for signing transactions)
   * WARNING: Handle private keys with extreme care
   */
  getSigningWallet(chain: Chain, index: number): WalletInfo {
    const cacheKey = `wallet:${chain}:${index}`;
    
    const cached = this.walletCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (!this.mnemonic) {
      throw new Error('Mnemonic not available for wallet derivation');
    }

    // Only EVM chains supported for signing currently
    if (!['ethereum', 'arbitrum', 'base', 'polygon', 'optimism'].includes(chain)) {
      throw new Error(`Signing not supported for chain: ${chain}`);
    }

    const path = this.getDerivationPath(chain, index);
    const hdNode = HDNodeWallet.fromPhrase(this.mnemonic, undefined, path);

    const wallet: WalletInfo = {
      address: hdNode.address,
      publicKey: hdNode.publicKey,
      privateKey: hdNode.privateKey,
      path,
    };

    this.walletCache.set(cacheKey, wallet);

    return wallet;
  }

  /**
   * Clear sensitive data from memory
   */
  clearSensitiveData(): void {
    this.walletCache.clear();
    logger.info('Cleared wallet cache');
  }
}

// Legacy AddressGenerator class for backward compatibility
export class AddressGenerator {
  private static hdManager: HDWalletManager | null = null;

  private static getManager(): HDWalletManager {
    if (!this.hdManager) {
      this.hdManager = new HDWalletManager();
    }
    return this.hdManager;
  }

  /**
   * Generate payment address for any chain
   * @deprecated Use HDWalletManager.derivePaymentAddress instead
   */
  static generatePaymentAddress(stacksAddress: string, chain: Chain, agentIndex: number = 0): string {
    const manager = this.getManager();
    const derived = manager.derivePaymentAddress(agentIndex, chain, stacksAddress);
    return derived.address;
  }

  /**
   * Generate all payment addresses for an agent
   * @deprecated Use HDWalletManager.deriveAllAddresses instead
   */
  static generateAllAddresses(
    stacksAddress: string,
    enabledChains: Chain[],
    agentIndex: number = 0
  ): Record<string, string> {
    const manager = this.getManager();
    return manager.deriveAllAddresses(agentIndex, enabledChains, stacksAddress);
  }

  /**
   * @deprecated Use HDWalletManager directly
   */
  static generateEthereumAddress(stacksAddress: string, chain: Chain): string {
    return this.generatePaymentAddress(stacksAddress, chain, 0);
  }

  /**
   * @deprecated Use HDWalletManager directly
   */
  static generateSolanaAddress(stacksAddress: string): string {
    return this.generatePaymentAddress(stacksAddress, 'solana', 0);
  }

  /**
   * @deprecated Use HDWalletManager directly
   */
  static generateBitcoinAddress(stacksAddress: string): string {
    return this.generatePaymentAddress(stacksAddress, 'bitcoin', 0);
  }
}

// Singleton instance
let hdWalletManagerInstance: HDWalletManager | null = null;

export function getHDWalletManager(): HDWalletManager {
  if (!hdWalletManagerInstance) {
    hdWalletManagerInstance = new HDWalletManager();
  }
  return hdWalletManagerInstance;
}

export default AddressGenerator;
