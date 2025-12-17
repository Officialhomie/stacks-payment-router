/**
 * Payment Relayer Service
 * 
 * This service:
 * 1. Watches Sepolia for ETH payments
 * 2. Gets ETH/USD price from Chainlink
 * 3. Mints equivalent USDh on Stacks
 * 4. Settles payment in payment-router
 */

import { ethers } from 'ethers';
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
  uintCV,
  stringAsciiCV,
  stringUtf8CV,
  noneCV,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import { generateWallet } from '@stacks/wallet-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getETHPriceWithFallback,
  convertETHToUSD,
  convertUSDToUSDh,
  verifyChainlinkConnection,
} from './chainlink-oracle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Sepolia RPC
  SEPOLIA_RPC: process.env.SEPOLIA_RPC || 'https://sepolia.infura.io/v3/YOUR_KEY',
  
  // Stacks Network
  STACKS_DEPLOYER: 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K',
  STACKS_NETWORK: new StacksTestnet(),
  
  // Chainlink Price Feed (Sepolia)
  CHAINLINK_ETH_USD: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // Sepolia ETH/USD
  
  // Contract Addresses
  SEPOLIA_CONTRACT: process.env.SEPOLIA_CONTRACT || '0x...', // Your PaymentReceiver contract
  STACKS_TOKEN_USDH: 'token-usdh-v2',
  STACKS_PAYMENT_ROUTER: 'payment-router-v2',
  
  // Relayer wallet (needs minting permissions on token-usdh-v2)
  RELAYER_MNEMONIC: process.env.RELAYER_MNEMONIC || '',
};

// ============================================================================
// PRICE ORACLE (Chainlink)
// ============================================================================
// Price oracle functions are imported from chainlink-oracle.js
// This provides:
// - Chainlink price fetching with validation
// - Staleness checking
// - Fallback to CoinGecko API
// - Error handling and retries

// ============================================================================
// STACKS CONTRACT CALLS
// ============================================================================

/**
 * Gets Stacks relayer private key from mnemonic
 */
async function getStacksRelayerKey() {
  const wallet = await generateWallet({
    secretKey: CONFIG.RELAYER_MNEMONIC,
    password: '',
  });
  return wallet.accounts[0].stxPrivateKey;
}

/**
 * Mints USDh tokens on Stacks
 * @param {bigint} amount - Amount in smallest unit (6 decimals)
 * @param {string} recipient - Stacks principal address
 */
async function mintUSDh(amount, recipient) {
  const privateKey = await getStacksRelayerKey();
  
  // Get current nonce
  const nonceResp = await fetch(
    `https://api.testnet.hiro.so/extended/v1/address/${CONFIG.STACKS_DEPLOYER}/nonces`
  );
  const nonceData = await nonceResp.json();
  const nonce = nonceData.possible_next_nonce;
  
  const txOptions = {
    contractAddress: CONFIG.STACKS_DEPLOYER,
    contractName: CONFIG.STACKS_TOKEN_USDH,
    functionName: 'mint',
    functionArgs: [
      uintCV(amount),
      principalCV(recipient),
    ],
    senderKey: privateKey,
    network: CONFIG.STACKS_NETWORK,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };
  
  const tx = await makeContractCall(txOptions);
  console.log(`💰 Minting ${Number(amount) / 1e6} USDh to ${recipient}...`);
  
  const result = await broadcastTransaction(tx, CONFIG.STACKS_NETWORK);
  
  if (result.error) {
    throw new Error(`Minting failed: ${result.reason}`);
  }
  
  console.log(`✅ Minted! TX: ${result.txid}`);
  return result.txid;
}

/**
 * Creates payment intent on Stacks
 * @param {string} intentId - Unique intent identifier
 * @param {string} agent - Stacks principal of agent
 * @param {string} sourceChain - Source chain name
 * @param {string} sourceToken - Token symbol
 * @param {bigint} sourceAmount - Amount in source token units
 * @param {bigint} expectedUSDh - Expected USDh amount
 * @param {string} paymentAddress - Payment address on source chain
 */
async function createPaymentIntent(intentId, agent, sourceChain, sourceToken, sourceAmount, expectedUSDh, paymentAddress) {
  const privateKey = await getStacksRelayerKey();
  
  const nonceResp = await fetch(
    `https://api.testnet.hiro.so/extended/v1/address/${CONFIG.STACKS_DEPLOYER}/nonces`
  );
  const nonceData = await nonceResp.json();
  const nonce = nonceData.possible_next_nonce;
  
  const txOptions = {
    contractAddress: CONFIG.STACKS_DEPLOYER,
    contractName: CONFIG.STACKS_PAYMENT_ROUTER,
    functionName: 'create-payment-intent',
    functionArgs: [
      stringAsciiCV(intentId),
      principalCV(agent),
      stringAsciiCV(sourceChain),
      stringAsciiCV(sourceToken),
      uintCV(sourceAmount),
      uintCV(expectedUSDh),
      stringUtf8CV(paymentAddress),
      noneCV(), // expiry-blocks (use default)
    ],
    senderKey: privateKey,
    network: CONFIG.STACKS_NETWORK,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };
  
  const tx = await makeContractCall(txOptions);
  console.log(`📝 Creating payment intent ${intentId}...`);
  
  const result = await broadcastTransaction(tx, CONFIG.STACKS_NETWORK);
  
  if (result.error) {
    throw new Error(`Create intent failed: ${result.reason}`);
  }
  
  console.log(`✅ Intent created! TX: ${result.txid}`);
  return result.txid;
}

/**
 * Marks payment as detected
 */
async function markPaymentDetected(intentId) {
  const privateKey = await getStacksRelayerKey();
  
  const nonceResp = await fetch(
    `https://api.testnet.hiro.so/extended/v1/address/${CONFIG.STACKS_DEPLOYER}/nonces`
  );
  const nonceData = await nonceResp.json();
  const nonce = nonceData.possible_next_nonce;
  
  const txOptions = {
    contractAddress: CONFIG.STACKS_DEPLOYER,
    contractName: CONFIG.STACKS_PAYMENT_ROUTER,
    functionName: 'mark-payment-detected',
    functionArgs: [stringAsciiCV(intentId)],
    senderKey: privateKey,
    network: CONFIG.STACKS_NETWORK,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };
  
  const tx = await makeContractCall(txOptions);
  const result = await broadcastTransaction(tx, CONFIG.STACKS_NETWORK);
  
  if (result.error) {
    throw new Error(`Mark detected failed: ${result.reason}`);
  }
  
  return result.txid;
}

/**
 * Completes settlement on Stacks
 * @param {string} intentId - Payment intent ID
 * @param {bigint} usdhAmount - USDh amount to settle
 * @param {string} settlementTxHash - Settlement transaction hash
 */
async function completeSettlement(intentId, usdhAmount, settlementTxHash) {
  const privateKey = await getStacksRelayerKey();
  
  // First, mint USDh to the yield vault
  const yieldVault = `${CONFIG.STACKS_DEPLOYER}.yield-vault-v2`;
  await mintUSDh(usdhAmount, yieldVault);
  
  // Wait for mint to confirm
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Then complete settlement
  const nonceResp = await fetch(
    `https://api.testnet.hiro.so/extended/v1/address/${CONFIG.STACKS_DEPLOYER}/nonces`
  );
  const nonceData = await nonceResp.json();
  const nonce = nonceData.possible_next_nonce;
  
  const txOptions = {
    contractAddress: CONFIG.STACKS_DEPLOYER,
    contractName: CONFIG.STACKS_PAYMENT_ROUTER,
    functionName: 'complete-settlement',
    functionArgs: [
      stringAsciiCV(intentId),
      uintCV(usdhAmount),
      stringAsciiCV(settlementTxHash),
    ],
    senderKey: privateKey,
    network: CONFIG.STACKS_NETWORK,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n,
    nonce: BigInt(nonce),
  };
  
  const tx = await makeContractCall(txOptions);
  console.log(`✅ Completing settlement for intent ${intentId}...`);
  
  const result = await broadcastTransaction(tx, CONFIG.STACKS_NETWORK);
  
  if (result.error) {
    throw new Error(`Settlement failed: ${result.reason}`);
  }
  
  console.log(`✅ Settlement complete! TX: ${result.txid}`);
  return result.txid;
}

// ============================================================================
// SEPOLIA EVENT LISTENER
// ============================================================================

/**
 * Processes a payment event from Sepolia
 * @param {Object} event - Payment event from Sepolia contract
 */
async function processPayment(event) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔔 NEW PAYMENT DETECTED');
  console.log('═══════════════════════════════════════════════════════════');
  
  const {
    intentId,
    sender,
    amount, // ETH amount in wei
    stacksAgent,
    txHash,
  } = event.args;
  
  console.log(`📥 Payment Details:`);
  console.log(`   Intent ID: ${intentId}`);
  console.log(`   Sender: ${sender}`);
  console.log(`   Amount: ${ethers.formatEther(amount)} ETH`);
  console.log(`   Stacks Agent: ${stacksAgent}`);
  console.log(`   TX Hash: ${txHash}`);
  
  try {
    // Step 1: Convert ETH to USD value (uses Chainlink with fallback)
    const usdValue = await convertETHToUSD(amount.toString(), CONFIG.SEPOLIA_RPC);
    console.log(`\n💱 Conversion:`);
    console.log(`   ${ethers.formatEther(amount)} ETH = $${usdValue.toFixed(2)}`);
    
    // Step 2: Convert USD to USDh amount
    const usdhAmount = convertUSDToUSDh(usdValue);
    console.log(`   USDh Amount: ${Number(usdhAmount) / 1e6} USDh`);
    
    // Step 3: Create payment intent on Stacks
    await createPaymentIntent(
      intentId,
      stacksAgent,
      'sepolia',
      'ETH',
      BigInt(amount.toString()),
      usdhAmount,
      sender
    );
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Mark payment as detected
    await markPaymentDetected(intentId);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 5: Complete settlement (mints USDh and deposits to vault)
    await completeSettlement(intentId, usdhAmount, txHash);
    
    console.log('\n✅ Payment processed successfully!');
    console.log(`   Agent ${stacksAgent} received ${Number(usdhAmount) / 1e6} USDh`);
    
  } catch (error) {
    console.error('\n❌ Error processing payment:', error);
    // In production, you'd want to retry or alert
  }
}

/**
 * Starts listening for payment events on Sepolia
 */
async function startListening() {
  console.log('🚀 Starting Payment Relayer...');
  console.log(`📍 Watching Sepolia contract: ${CONFIG.SEPOLIA_CONTRACT}`);
  console.log(`📍 Stacks Deployer: ${CONFIG.STACKS_DEPLOYER}`);
  console.log('');
  
  const provider = new ethers.JsonRpcProvider(CONFIG.SEPOLIA_RPC);
  
  // PaymentReceiver contract ABI (simplified)
  const abi = [
    'event PaymentInitiated(bytes32 indexed intentId, address indexed sender, uint256 amount, string stacksAgent, bytes32 txHash)'
  ];
  
  const contract = new ethers.Contract(CONFIG.SEPOLIA_CONTRACT, abi, provider);
  
  // Listen for PaymentInitiated events
  contract.on('PaymentInitiated', async (intentId, sender, amount, stacksAgent, txHash, event) => {
    await processPayment({
      args: {
        intentId,
        sender,
        amount,
        stacksAgent,
        txHash: txHash.toString(),
      },
      event,
    });
  });
  
  console.log('👂 Listening for payments...');
}

// ============================================================================
// MAIN
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  startListening().catch(console.error);
}

export {
  processPayment,
  getETHPrice,
  convertETHToUSD,
  convertUSDToUSDh,
  mintUSDh,
  createPaymentIntent,
  completeSettlement,
};

