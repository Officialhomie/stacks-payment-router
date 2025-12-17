#!/usr/bin/env node

import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import { TransactionVersion } from '@stacks/transactions';
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

async function deriveWallet() {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: '',
  });

  console.log('Wallet accounts:');
  for (let i = 0; i < Math.min(5, wallet.accounts.length); i++) {
    const account = wallet.accounts[i];
    const address = getStxAddress({ account, transactionVersion: TransactionVersion.Testnet });
    console.log(`  Account ${i}: ${address}`);
    console.log(`    STX Private Key: ${account.stxPrivateKey.substring(0, 20)}...`);
  }
}

deriveWallet().catch(console.error);

