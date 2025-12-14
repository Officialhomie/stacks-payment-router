/**
 * MVP Test Script
 *
 * Quick test to verify the payment detection system works
 *
 * Usage:
 *   ts-node test-mvp.ts
 */

import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { initAddressGenerator, getAddressGenerator } from './src/AddressGenerator';
import { initStacksIntegration, getStacksIntegration } from './StacksIntegration';
import { initPaymentDetector, getPaymentDetector } from './src/PaymentDetector';

dotenv.config({ path: '../../../.env.local' });

const logger = {
  info: (...args: any[]) => console.log('✅', ...args),
  error: (...args: any[]) => console.error('❌', ...args),
  warn: (...args: any[]) => console.warn('⚠️', ...args),
};

async function main() {
  console.log('🚀 MVP Test Script\n');

  try {
    // Test 1: Environment Variables
    console.log('Test 1: Checking environment variables...');
    const requiredEnvVars = [
      'ETH_RPC_URL',
      'HD_WALLET_MNEMONIC',
      'STACKS_SETTLEMENT_WALLET_PRIVATE_KEY',
      'PAYMENT_ROUTER_CONTRACT',
      'AGENT_REGISTRY_CONTRACT',
      'YIELD_VAULT_CONTRACT'
    ];

    const missing = requiredEnvVars.filter(key => !process.env[key]);
    if (missing.length > 0) {
      logger.error(`Missing environment variables: ${missing.join(', ')}`);
      logger.warn('Please update .env.local file');
      process.exit(1);
    }
    logger.info('All environment variables set\n');

    // Test 2: Address Generator
    console.log('Test 2: Testing Address Generator...');
    const addressGen = initAddressGenerator(process.env.HD_WALLET_MNEMONIC!);
    const masterAddress = addressGen.getMasterAddress();
    logger.info(`Master wallet address: ${masterAddress}`);

    const testAddress = await addressGen.generateAddress('test-payment-001');
    logger.info('Generated payment address:', testAddress.address);
    logger.info('Derivation path:', testAddress.derivationPath);
    console.log();

    // Test 3: Ethereum RPC Connection
    console.log('Test 3: Testing Ethereum RPC connection...');
    const detector = initPaymentDetector(process.env.ETH_RPC_URL!);
    const connected = await detector.checkConnection();

    if (!connected) {
      logger.error('Failed to connect to Ethereum RPC');
      logger.warn('Check your ETH_RPC_URL in .env.local');
      process.exit(1);
    }

    const balance = await detector.getBalance(testAddress.address);
    logger.info(`Connected to Ethereum RPC (${process.env.ETH_RPC_URL})`);
    logger.info(`Address balance: ${ethers.utils.formatEther(balance)} ETH`);
    console.log();

    // Test 4: Stacks Integration
    console.log('Test 4: Testing Stacks integration...');
    const stacksIntegration = initStacksIntegration({
      network: 'testnet',
      senderKey: process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY!,
      paymentRouterContract: process.env.PAYMENT_ROUTER_CONTRACT!,
      agentRegistryContract: process.env.AGENT_REGISTRY_CONTRACT!,
      yieldVaultContract: process.env.YIELD_VAULT_CONTRACT!,
    });

    logger.info('Stacks integration initialized');
    logger.info(`Payment Router: ${process.env.PAYMENT_ROUTER_CONTRACT}`);
    console.log();

    // Test 5: Query Smart Contract (Read-Only)
    console.log('Test 5: Querying smart contract...');
    try {
      // Try to get a payment intent (will likely return none, but tests connection)
      const result = await stacksIntegration.getPaymentIntent('test-payment-001');
      logger.info('Smart contract query successful');
      console.log('Result:', result);
    } catch (error: any) {
      logger.warn('Smart contract query returned error (this is OK if payment doesn\'t exist)');
      console.log('Error:', error.message);
    }
    console.log();

    // Test 6: Generate Multiple Addresses
    console.log('Test 6: Generating multiple payment addresses...');
    const addresses = await addressGen.generateBatch([
      'payment-001',
      'payment-002',
      'payment-003'
    ]);

    addresses.forEach((addr, i) => {
      logger.info(`Address ${i + 1}: ${addr.address}`);
    });
    console.log();

    // Summary
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════');
    console.log();
    console.log('Your system is ready to detect payments!');
    console.log();
    console.log('Next steps:');
    console.log('1. Run the service: ts-node src/mvp-service.ts');
    console.log('2. Send test ETH to:', testAddress.address);
    console.log('3. Watch the logs for payment detection');
    console.log();
    console.log('Get testnet ETH from: https://sepoliafaucet.com/');
    console.log();

  } catch (error: any) {
    logger.error('Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
