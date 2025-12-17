#!/usr/bin/env node

import * as bip39 from 'bip39';
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@stacks/common';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read mnemonic from Testnet.toml
const testnetToml = fs.readFileSync(path.join(__dirname, '../settings/Testnet.toml'), 'utf-8');
const mnemonicMatch = testnetToml.match(/mnemonic\s*=\s*"([^"]+)"/);
const mnemonic = mnemonicMatch ? mnemonicMatch[1] : null;

console.log('Mnemonic:', mnemonic);
console.log('');

async function checkAddress() {
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  
  // Try different derivation paths
  const paths = [
    "m/44'/5757'/0'/0/0",  // Standard Stacks BIP44
    "m/44'/5757'/0'/0/1",  // Index 1
    "m/44'/5757'/0'/0/2",  // Index 2
    "m/44'/5757'/0'/0",    // Without last index
    "m/44'/5757'/0'",      // Account level
    "m/888'/0'/0'",        // Older Stacks path
    "m/44'/0'/0'/0/0",     // Bitcoin path
    "m/44'/5757'/0",       // Without hardened account
  ];
  
  for (const path of paths) {
    try {
      const childKey = hdKey.derive(path);
      const privateKey = bytesToHex(childKey.privateKey);
      const address = getAddressFromPrivateKey(privateKey, TransactionVersion.Testnet);
      console.log(`Path: ${path}`);
      console.log(`  Address: ${address}`);
      console.log(`  Private Key (first 20): ${privateKey.substring(0, 20)}...`);
      console.log('');
    } catch (e) {
      console.log(`Path: ${path} - Error: ${e.message}`);
    }
  }
}

checkAddress().catch(console.error);

