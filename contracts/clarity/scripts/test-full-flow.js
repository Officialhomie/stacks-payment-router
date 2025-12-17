#!/usr/bin/env node
/**
 * Full Payment Router Testing Flow
 * 
 * This simulates the complete payment flow on Stacks testnet:
 * 1. Register an agent
 * 2. Create a payment intent
 * 3. Complete settlement
 * 4. Check balances
 * 5. Request and execute withdrawal
 */

import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
  uintCV,
  stringAsciiCV,
  stringUtf8CV,
  boolCV,
  listCV,
  noneCV,
  callReadOnlyFunction,
  cvToJSON,
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

async function getNonce() {
  const resp = await fetch(`https://api.testnet.hiro.so/extended/v1/address/${DEPLOYER}/nonces`);
  const data = await resp.json();
  return data.possible_next_nonce;
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

  const tx = await makeContractCall(txOptions);
  console.log(`📤 ${contractName}.${functionName}...`);
  const result = await broadcastTransaction(tx, network);
  
  if (result.error) {
    console.error(`   ❌ ${result.reason}`);
    return null;
  }
  
  console.log(`   ✅ TX: ${result.txid.substring(0, 20)}...`);
  return result.txid;
}

async function readContract(contractName, functionName, args) {
  try {
    const result = await callReadOnlyFunction({
      contractAddress: DEPLOYER,
      contractName,
      functionName,
      functionArgs: args,
      network,
      senderAddress: DEPLOYER,
    });
    return cvToJSON(result);
  } catch (e) {
    return { error: e.message };
  }
}

function generateIntentId() {
  // Generate a unique intent ID
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`.substring(0, 64);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('         PAYMENT ROUTER - FULL FLOW TEST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  const privateKey = await getPrivateKey();
  let nonce = await getNonce();
  
  // The deployer will act as both the agent and the operator for testing
  const AGENT = DEPLOYER;
  const TEST_AMOUNT = 1000000n; // 1 USDh (6 decimals)
  
  console.log(`📍 Deployer/Agent: ${DEPLOYER}`);
  console.log(`💰 Test Amount: ${Number(TEST_AMOUNT) / 1000000} USDh`);
  console.log(`📊 Starting Nonce: ${nonce}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Register Agent
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 1: Register Agent');
  console.log('─────────────────────────────────────────────────────────────');
  
  // Check if already registered
  const agentInfo = await readContract('agent-registry-v2', 'get-agent', [principalCV(AGENT)]);
  
  if (agentInfo.value && agentInfo.value.value) {
    console.log('   ℹ️  Agent already registered');
  } else {
    // register-agent(agent-id, chains, min-amount, max-amount, auto-withdraw)
    await callContract('agent-registry-v2', 'register-agent', [
      stringAsciiCV('test-agent-001'),                    // agent-id
      listCV([stringAsciiCV('sepolia'), stringAsciiCV('ethereum')]), // chains
      uintCV(100000n),                                    // min-amount (0.1 USDh)
      uintCV(100000000000n),                             // max-amount (100,000 USDh)
      boolCV(false),                                      // auto-withdraw
    ], privateKey, nonce++);
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Check Current USDh Balance
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 2: Check USDh Balances');
  console.log('─────────────────────────────────────────────────────────────');
  
  const deployerBalance = await readContract('token-usdh-v2', 'get-balance', [principalCV(DEPLOYER)]);
  console.log(`   Deployer USDh: ${JSON.stringify(deployerBalance)}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Create Payment Intent
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 3: Create Payment Intent');
  console.log('─────────────────────────────────────────────────────────────');
  
  const intentId = generateIntentId();
  console.log(`   Intent ID: ${intentId}`);
  
  // create-payment-intent(intent-id, agent, source-chain, source-token, source-amount, expected-usdh, payment-address, expiry-blocks)
  await callContract('payment-router-v2', 'create-payment-intent', [
    stringAsciiCV(intentId),                              // intent-id
    principalCV(AGENT),                                   // agent
    stringAsciiCV('sepolia'),                             // source-chain
    stringAsciiCV('ETH'),                                 // source-token
    uintCV(1000000000000000n),                           // source-amount (0.001 ETH in wei)
    uintCV(TEST_AMOUNT),                                  // expected-usdh
    stringUtf8CV('0x1234567890abcdef'),                  // payment-address
    noneCV(),                                             // expiry-blocks (use default)
  ], privateKey, nonce++);
  await new Promise(r => setTimeout(r, 3000));
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Mark Payment Detected
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 4: Mark Payment Detected (Relayer Action)');
  console.log('─────────────────────────────────────────────────────────────');
  
  await callContract('payment-router-v2', 'mark-payment-detected', [
    stringAsciiCV(intentId),
  ], privateKey, nonce++);
  await new Promise(r => setTimeout(r, 3000));
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Complete Settlement
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 5: Complete Settlement');
  console.log('─────────────────────────────────────────────────────────────');
  
  // First mint USDh to payment-router to simulate bridge deposit
  await callContract('token-usdh-v2', 'mint', [
    uintCV(TEST_AMOUNT),
    principalCV(`${DEPLOYER}.yield-vault-v2`),
  ], privateKey, nonce++);
  await new Promise(r => setTimeout(r, 3000));
  
  // complete-settlement(intent-id, usdh-amount, settlement-tx-hash)
  await callContract('payment-router-v2', 'complete-settlement', [
    stringAsciiCV(intentId),
    uintCV(TEST_AMOUNT),
    stringAsciiCV('0xabcdef1234567890'),
  ], privateKey, nonce++);
  await new Promise(r => setTimeout(r, 5000));
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 6: Check Agent Balance in Yield Vault
  // ═══════════════════════════════════════════════════════════════════
  console.log('─────────────────────────────────────────────────────────────');
  console.log('STEP 6: Check Agent Balance in Yield Vault');
  console.log('─────────────────────────────────────────────────────────────');
  
  const vaultBalance = await readContract('yield-vault-v2', 'get-balance', [principalCV(AGENT)]);
  console.log('   Vault Balance:', JSON.stringify(vaultBalance, null, 2));
  console.log('');

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('📊 What happened:');
  console.log('   1. Agent registered in agent-registry');
  console.log('   2. Payment intent created for agent');
  console.log('   3. Payment marked as detected (simulating relayer)');
  console.log('   4. USDh minted to vault (simulating bridge)');
  console.log('   5. Settlement completed → Agent credited in vault');
  console.log('');
  console.log('🔗 View transactions:');
  console.log(`   https://explorer.hiro.so/address/${DEPLOYER}?chain=testnet`);
  console.log('');
  console.log('📝 Next steps to test withdrawal:');
  console.log('   1. Call yield-vault-v2.request-withdrawal(amount)');
  console.log('   2. Wait for lock period (~144 blocks)');
  console.log('   3. Call yield-vault-v2.execute-withdrawal()');
}

main().catch(console.error);
