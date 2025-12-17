#!/usr/bin/env node

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
  uintCV,
  stringAsciiCV,
  getNonce,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { generateWallet } from '@stacks/wallet-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testnetToml = fs.readFileSync(path.join(__dirname, '../settings/Testnet.toml'), 'utf-8');
const mnemonicMatch = testnetToml.match(/mnemonic\s*=\s*"([^"]+)"/);
const mnemonic = mnemonicMatch[1];

const network = new StacksTestnet();
const DEPLOYER = 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K';

async function getPrivateKey() {
  const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
  return wallet.accounts[0].stxPrivateKey;
}

async function callContract(contractName, functionName, args, senderKey, nonce) {
  const txOptions = {
    contractAddress: DEPLOYER,
    contractName,
    functionName,
    functionArgs: args,
    senderKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };

  try {
    const tx = await makeContractCall(txOptions);
    console.log(`📤 Broadcasting ${contractName}.${functionName} (nonce: ${nonce})...`);
    const result = await broadcastTransaction(tx, network);
    
    if (result.error) {
      console.error(`❌ Error: ${result.reason}`);
      return { success: false };
    }
    
    console.log(`✅ TX: ${result.txid}`);
    return { success: true, txid: result.txid };
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return { success: false };
  }
}

async function main() {
  console.log('🚀 Completing v2 contract initialization\n');
  
  const privateKey = await getPrivateKey();
  
  // Get current nonce
  const nonceResp = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${DEPLOYER}/nonces`);
  const nonceData = await nonceResp.json();
  let nonce = nonceData.possible_next_nonce;
  console.log(`📍 Starting nonce: ${nonce}\n`);

  // Remaining calls - execute one at a time
  const calls = [
    ['agent-registry-v2', 'initialize-contract', []],
    ['payment-router-v2', 'initialize-contract', []],
    ['payment-router-v2', 'set-agent-registry-contract', [principalCV(`${DEPLOYER}.agent-registry-v2`)]],
    ['agent-registry-v2', 'add-operator', [principalCV(`${DEPLOYER}.payment-router-v2`), stringAsciiCV('router')]],
    ['token-usdh-v2', 'mint', [uintCV(10000000000n), principalCV(DEPLOYER)]],
  ];

  for (const [contract, func, args] of calls) {
    const result = await callContract(contract, func, args, privateKey, nonce);
    if (result.success) {
      nonce++;
      // Wait 3 seconds between successful broadcasts
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n✅ Done! Check transactions at:');
  console.log(`https://explorer.hiro.so/address/${DEPLOYER}?chain=testnet`);
}

main().catch(console.error);

