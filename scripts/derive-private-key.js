#!/usr/bin/env node

/**
 * Convert Leather Wallet Secret Key (Mnemonic) to Private Key
 * 
 * Usage:
 *   node scripts/derive-private-key.js "your twelve word mnemonic phrase here"
 * 
 * Or set as environment variable:
 *   MNEMONIC="your mnemonic" node scripts/derive-private-key.js
 */

import { generateWallet } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';

async function derivePrivateKey(mnemonic) {
  if (!mnemonic) {
    console.error('❌ Error: No mnemonic provided');
    console.error('');
    console.error('Usage:');
    console.error('  node scripts/derive-private-key.js "your twelve word mnemonic phrase"');
    console.error('');
    console.error('Or set as environment variable:');
    console.error('  MNEMONIC="your mnemonic" node scripts/derive-private-key.js');
    process.exit(1);
  }

  // Validate mnemonic format (should be 12 or 24 words)
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    console.error('❌ Error: Mnemonic should be 12 or 24 words');
    console.error(`   Found ${words.length} words`);
    process.exit(1);
  }

  try {
    console.log('🔐 Deriving private key from mnemonic...');
    console.log('');

    // Generate wallet from mnemonic
    const wallet = await generateWallet({
      secretKey: mnemonic,
      password: '', // Leather wallet doesn't use password for basic derivation
    });

    // Get the first account (index 0)
    const account = wallet.accounts[0];
    const privateKey = account.stxPrivateKey;
    
    // Get address from private key
    const address = getAddressFromPrivateKey(privateKey, TransactionVersion.Testnet);

    console.log('✅ Successfully derived private key!');
    console.log('');
    console.log('📋 Your Wallet Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Address (Testnet): ${address}`);
    console.log(`Private Key:       ${privateKey}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('⚠️  SECURITY WARNING:');
    console.log('   Keep your private key SECRET!');
    console.log('   Never share it or commit it to git!');
    console.log('');
    console.log('📝 Add to your .env file:');
    console.log(`   STACKS_SETTLEMENT_WALLET_PRIVATE_KEY=${privateKey}`);
    console.log(`   STACKS_SETTLEMENT_WALLET_ADDRESS=${address}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error deriving private key:', error.message);
    console.error('');
    console.error('Make sure:');
    console.error('  1. Your mnemonic is correct (12 or 24 words)');
    console.error('  2. Words are separated by spaces');
    console.error('  3. You have @stacks/wallet-sdk installed');
    process.exit(1);
  }
}

// Get mnemonic from command line argument or environment variable
const mnemonic = process.argv[2] || process.env.MNEMONIC;

derivePrivateKey(mnemonic);

