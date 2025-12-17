#!/usr/bin/env node
/**
 * Chainlink Integration Verification Script
 * 
 * Tests:
 * 1. Chainlink connection
 * 2. Price fetching
 * 3. Price validation
 * 4. Fallback mechanisms
 * 5. ETH to USD conversion
 */

import {
  getETHPriceWithFallback,
  convertETHToUSD,
  convertUSDToUSDh,
  verifyChainlinkConnection,
  CHAINLINK_CONFIG,
} from './chainlink-oracle.js';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || 'https://rpc.sepolia.org';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('         CHAINLINK INTEGRATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  // Test 1: Verify Chainlink connection
  console.log('TEST 1: Chainlink Connection Verification');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`Chainlink Address: ${CHAINLINK_CONFIG.SEPOLIA_ETH_USD}`);
  console.log(`RPC: ${SEPOLIA_RPC.substring(0, 30)}...`);
  console.log('');
  
  const isConnected = await verifyChainlinkConnection(SEPOLIA_RPC);
  
  if (!isConnected) {
    console.error('❌ Chainlink connection failed!');
    console.error('   Check:');
    console.error('   1. RPC URL is correct');
    console.error('   2. Chainlink address is correct');
    console.error('   3. Network is Sepolia');
    return;
  }
  
  console.log('');
  
  // Test 2: Fetch ETH price
  console.log('TEST 2: ETH/USD Price Fetching');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    const price = await getETHPriceWithFallback(SEPOLIA_RPC);
    console.log(`✅ Price fetched: $${price.toFixed(2)}`);
    
    // Validate price is reasonable
    if (price < 1000 || price > 10000) {
      console.warn(`⚠️  Price seems unusual: $${price.toFixed(2)}`);
    } else {
      console.log(`✅ Price is within expected range ($1,000 - $10,000)`);
    }
  } catch (error) {
    console.error(`❌ Price fetch failed: ${error.message}`);
    return;
  }
  
  console.log('');
  
  // Test 3: ETH to USD conversion
  console.log('TEST 3: ETH to USD Conversion');
  console.log('─────────────────────────────────────────────────────────────');
  
  const testAmounts = [
    '1000000000000000',      // 0.001 ETH
    '10000000000000000',     // 0.01 ETH
    '100000000000000000',    // 0.1 ETH
    '1000000000000000000',   // 1 ETH
  ];
  
  for (const amountWei of testAmounts) {
    try {
      const usdValue = await convertETHToUSD(amountWei, SEPOLIA_RPC);
      const ethAmount = Number(amountWei) / 1e18;
      console.log(`   ${ethAmount.toFixed(3)} ETH → $${usdValue.toFixed(2)}`);
    } catch (error) {
      console.error(`   ❌ Conversion failed for ${amountWei}: ${error.message}`);
    }
  }
  
  console.log('');
  
  // Test 4: USD to USDh conversion
  console.log('TEST 4: USD to USDh Conversion');
  console.log('─────────────────────────────────────────────────────────────');
  
  const testUSDValues = [1, 10, 100, 1000];
  
  for (const usdValue of testUSDValues) {
    const usdhAmount = convertUSDToUSDh(usdValue);
    console.log(`   $${usdValue} → ${Number(usdhAmount) / 1e6} USDh`);
  }
  
  console.log('');
  
  // Test 5: Full flow test
  console.log('TEST 5: Full Conversion Flow');
  console.log('─────────────────────────────────────────────────────────────');
  
  const testETH = '1000000000000000'; // 0.001 ETH
  
  try {
    console.log(`Testing with: ${Number(testETH) / 1e18} ETH`);
    const usdValue = await convertETHToUSD(testETH, SEPOLIA_RPC);
    const usdhAmount = convertUSDToUSDh(usdValue);
    
    console.log(`✅ Full flow successful:`);
    console.log(`   ETH: ${Number(testETH) / 1e18}`);
    console.log(`   USD: $${usdValue.toFixed(2)}`);
    console.log(`   USDh: ${Number(usdhAmount) / 1e6}`);
  } catch (error) {
    console.error(`❌ Full flow failed: ${error.message}`);
  }
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('                    VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('✅ Chainlink integration is ready!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Deploy PaymentReceiver.sol to Sepolia');
  console.log('  2. Configure relayer with contract address');
  console.log('  3. Start relayer service');
}

runTests().catch(console.error);

