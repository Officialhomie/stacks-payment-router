#!/usr/bin/env node
/**
 * Grant Minting Permissions Script
 * 
 * Grants the relayer address minting permissions on token-usdh-v2
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { generateWallet } from '@stacks/wallet-sdk';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const STACKS_DEPLOYER = process.env.STACKS_DEPLOYER || 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K';
const RELAYER_MNEMONIC = process.env.RELAYER_MNEMONIC;

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('    Grant Minting Permissions to Relayer');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  if (!RELAYER_MNEMONIC) {
    console.error('❌ RELAYER_MNEMONIC not set in .env');
    console.error('   Add: RELAYER_MNEMONIC="your mnemonic"');
    process.exit(1);
  }
  
  // Derive relayer address
  const wallet = await generateWallet({ secretKey: RELAYER_MNEMONIC, password: '' });
  const relayerPrivateKey = wallet.accounts[0].stxPrivateKey;
  const relayerAddress = getAddressFromPrivateKey(relayerPrivateKey, TransactionVersion.Testnet);
  
  console.log(`📍 Relayer Address: ${relayerAddress}`);
  console.log(`📍 Token Contract: ${STACKS_DEPLOYER}.token-usdh-v2`);
  console.log('');
  
  // Get deployer key (needs to be owner of token-usdh-v2)
  const deployerMnemonic = process.env.DEPLOYER_MNEMONIC;
  if (!deployerMnemonic) {
    console.error('❌ DEPLOYER_MNEMONIC not set in .env');
    console.error('   This should be the mnemonic that deployed token-usdh-v2');
    process.exit(1);
  }
  
  const deployerWallet = await generateWallet({ secretKey: deployerMnemonic, password: '' });
  const deployerKey = deployerWallet.accounts[0].stxPrivateKey;
  
  // Get nonce
  const nonceResp = await fetch(
    `https://api.testnet.hiro.so/extended/v1/address/${STACKS_DEPLOYER}/nonces`
  );
  const nonceData = await nonceResp.json();
  const nonce = nonceData.possible_next_nonce;
  
  console.log(`📤 Granting minting permissions...`);
  console.log(`   Nonce: ${nonce}`);
  console.log('');
  
  const txOptions = {
    contractAddress: STACKS_DEPLOYER,
    contractName: 'token-usdh-v2',
    functionName: 'add-minter',
    functionArgs: [principalCV(relayerAddress)],
    senderKey: deployerKey,
    network: new StacksTestnet(),
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };
  
  try {
    const tx = await makeContractCall(txOptions);
    const result = await broadcastTransaction(tx, new StacksTestnet());
    
    if (result.error) {
      console.error(`❌ Failed: ${result.reason}`);
      process.exit(1);
    }
    
    console.log(`✅ Minting permissions granted!`);
    console.log(`   TX: ${result.txid}`);
    console.log('');
    console.log('Relayer can now mint USDh tokens.');
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);


