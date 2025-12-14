#!/usr/bin/env ts-node
/**
 * Quick Settle Script
 *
 * Quickly settle a payment without interactive prompts
 *
 * Usage:
 *   ts-node scripts/settlement/quick-settle.ts <intent-id> [--auto-withdraw]
 *
 * Examples:
 *   ts-node scripts/settlement/quick-settle.ts payment-001
 *   ts-node scripts/settlement/quick-settle.ts payment-002 --auto-withdraw
 */

import * as dotenv from 'dotenv';
import { SettlementService } from './SettlementService';

dotenv.config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: ts-node quick-settle.ts <intent-id> [--auto-withdraw]');
    console.log('');
    console.log('Examples:');
    console.log('  ts-node quick-settle.ts payment-001');
    console.log('  ts-node quick-settle.ts payment-002 --auto-withdraw');
    process.exit(1);
  }

  const intentId = args[0];
  const autoWithdraw = args.includes('--auto-withdraw');

  console.log('\n🚀 Quick Settlement Tool\n');
  console.log(`Intent ID: ${intentId}`);
  console.log(`Mode: ${autoWithdraw ? 'Auto-Withdraw' : 'Regular'}\n`);

  // Initialize service
  const service = new SettlementService({
    network: (process.env.STACKS_NETWORK as 'testnet' | 'mainnet') || 'testnet',
    adminPrivateKey: process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY!,
    paymentRouterContract: process.env.PAYMENT_ROUTER_CONTRACT!,
    tokenUsdhContract: process.env.USDH_CONTRACT!,
    yieldVaultContract: process.env.YIELD_VAULT_CONTRACT!,
  });

  // Fetch payment intent
  console.log('📋 Fetching payment intent...');
  const intent = await service.getPaymentIntent(intentId);

  if (!intent) {
    console.error('❌ Payment intent not found');
    process.exit(1);
  }

  // Display details
  console.log('\nPayment Details:');
  console.log(`  Status:     ${intent.status}`);
  console.log(`  Agent:      ${intent.agent}`);
  console.log(`  Amount:     ${service.formatUsdh(intent.expectedUsdh)} USDh`);
  console.log(`  Net Amount: ${service.formatUsdh(intent.netAmount)} USDh`);
  console.log(`  Fees:       ${service.formatUsdh(intent.feesPaid)} USDh`);

  // Check status
  if (intent.status === 'settled') {
    console.log('\n⚠️  Payment already settled!');
    process.exit(0);
  }

  if (intent.status !== 'detected' && intent.status !== 'routing') {
    console.log(`\n⚠️  Warning: Payment status is "${intent.status}"`);
    console.log('Expected: "detected" or "routing"');
  }

  // Settle
  try {
    let txId: string;

    if (autoWithdraw) {
      console.log('\n💰 Settling with auto-withdraw...');
      txId = await service.completeSettlementWithWithdraw(
        intentId,
        intent.expectedUsdh
      );
    } else {
      console.log('\n💰 Settling payment...');
      txId = await service.completeSettlement(
        intentId,
        intent.expectedUsdh
      );
    }

    console.log(`\n✅ Settlement transaction broadcast!`);
    console.log(`   TX ID: ${txId}`);
    console.log(`   Explorer: https://explorer.hiro.so/txid/${txId}?chain=testnet`);

    // Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...');
    const confirmed = await service.waitForConfirmation(txId, 30);

    if (confirmed) {
      console.log('\n🎉 Settlement complete!');
      console.log(`   ${service.formatUsdh(intent.netAmount)} USDh sent to agent`);
    } else {
      console.log('\n⚠️  Transaction failed or timed out');
      console.log('   Check explorer for details');
    }

  } catch (error: any) {
    console.error(`\n❌ Settlement failed: ${error.message}`);
    process.exit(1);
  }
}

main();
