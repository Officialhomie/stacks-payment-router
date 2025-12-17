#!/usr/bin/env node

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
  uintCV,
  stringAsciiCV,
  getAddressFromPrivateKey,
  TransactionVersion,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read mnemonic from Testnet.toml
const testnetToml = fs.readFileSync(path.join(__dirname, '../settings/Testnet.toml'), 'utf-8');
const mnemonicMatch = testnetToml.match(/mnemonic\s*=\s*"([^"]+)"/);
const mnemonic = mnemonicMatch ? mnemonicMatch[1] : null;

if (!mnemonic) {
  console.error('Could not find mnemonic in settings/Testnet.toml');
  process.exit(1);
}

// Network setup
const network = new StacksTestnet();
const DEPLOYER = 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K';

// Derive private key from mnemonic using @stacks/wallet-sdk
import { generateWallet } from '@stacks/wallet-sdk';

async function getPrivateKey(mnemonic) {
  const wallet = await generateWallet({
    secretKey: mnemonic,
    password: '',
  });
  return wallet.accounts[0].stxPrivateKey;
}

// Call a contract function
async function callContract(contractName, functionName, args, senderKey) {
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName: contractName,
    functionName: functionName,
    functionArgs: args,
    senderKey: senderKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n, // 0.5 STX fee
  };

  try {
    const tx = await makeContractCall(txOptions);
    console.log(`📤 Broadcasting ${contractName}.${functionName}...`);
    
    const result = await broadcastTransaction(tx, network);
    
    if (result.error) {
      console.error(`❌ Error: ${result.error}`);
      console.error(`   Reason: ${result.reason}`);
      console.error(`   Full result: ${JSON.stringify(result)}`);
      return null;
    }
    
    console.log(`✅ TX: ${result.txid}`);
    return result.txid;
  } catch (error) {
    console.error(`❌ Error calling ${contractName}.${functionName}:`, error.message);
    return null;
  }
}

// Wait between transactions
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Initializing v2 contracts on Stacks Testnet\n');
  
  const privateKey = await getPrivateKey(mnemonic);
  const derivedAddress = getAddressFromPrivateKey(privateKey, TransactionVersion.Testnet);
  
  console.log(`📍 Expected Deployer: ${DEPLOYER}`);
  console.log(`📍 Derived Address: ${derivedAddress}`);
  console.log(`🔑 Private Key (first 10 chars): ${privateKey.substring(0, 10)}...`);
  
  if (derivedAddress !== DEPLOYER) {
    console.error(`❌ Address mismatch! The derived address doesn't match the expected deployer.`);
    process.exit(1);
  }
  console.log(`✅ Address verified!\n`);

  // Step 1: Initialize contracts
  console.log('=== STEP 1: Initialize Contracts ===\n');

  await callContract('token-usdh-v2', 'initialize-contract', [], privateKey);
  await sleep(2000);

  await callContract('agent-registry-v2', 'initialize-contract', [], privateKey);
  await sleep(2000);

  await callContract('yield-vault-v2', 'initialize-contract', [
    principalCV(`${DEPLOYER}.yield-vault-v2`)
  ], privateKey);
  await sleep(2000);

  await callContract('payment-router-v2', 'initialize-contract', [], privateKey);
  await sleep(2000);

  // Step 2: Authorize yield-vault for token transfers
  console.log('\n=== STEP 2: Authorize yield-vault ===\n');

  await callContract('token-usdh-v2', 'add-authorized-contract', [
    principalCV(`${DEPLOYER}.yield-vault-v2`)
  ], privateKey);
  await sleep(2000);

  // Step 3: Configure payment-router
  console.log('\n=== STEP 3: Configure payment-router ===\n');

  await callContract('payment-router-v2', 'set-agent-registry-contract', [
    principalCV(`${DEPLOYER}.agent-registry-v2`)
  ], privateKey);
  await sleep(2000);

  await callContract('payment-router-v2', 'set-yield-vault-contract', [
    principalCV(`${DEPLOYER}.yield-vault-v2`)
  ], privateKey);
  await sleep(2000);

  // Step 4: Add operators
  console.log('\n=== STEP 4: Add Operators ===\n');

  await callContract('agent-registry-v2', 'add-operator', [
    principalCV(`${DEPLOYER}.payment-router-v2`),
    stringAsciiCV('router')
  ], privateKey);
  await sleep(2000);

  await callContract('yield-vault-v2', 'add-operator', [
    principalCV(`${DEPLOYER}.payment-router-v2`)
  ], privateKey);
  await sleep(2000);

  // Step 5: Mint test tokens
  console.log('\n=== STEP 5: Mint Test Tokens ===\n');

  await callContract('token-usdh-v2', 'mint', [
    uintCV(10000000000n), // 10,000 USDh (6 decimals)
    principalCV(DEPLOYER)
  ], privateKey);

  console.log('\n✅ Initialization complete!');
  console.log('\nTransactions are being processed on testnet.');
  console.log('Check the Stacks Explorer for confirmation:');
  console.log(`https://explorer.hiro.so/address/${DEPLOYER}?chain=testnet`);
}

main().catch(console.error);

