#!/usr/bin/env ts-node
/**
 * Manual Settlement CLI Tool
 *
 * Interactive tool for admins to settle detected payments
 *
 * Usage:
 *   ts-node scripts/settlement/settle-payments.ts
 */

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { SettlementService } from './SettlementService';

dotenv.config({ path: '.env.local' });

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise(resolve => rl.question(query, resolve));
}

class SettlementCLI {
  private service: SettlementService;
  private running = true;

  constructor() {
    this.validateEnv();

    this.service = new SettlementService({
      network: (process.env.STACKS_NETWORK as 'testnet' | 'mainnet') || 'testnet',
      adminPrivateKey: process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY!,
      paymentRouterContract: process.env.PAYMENT_ROUTER_CONTRACT!,
      tokenUsdhContract: process.env.USDH_CONTRACT!,
      yieldVaultContract: process.env.YIELD_VAULT_CONTRACT!,
    });
  }

  private validateEnv() {
    const required = [
      'STACKS_SETTLEMENT_WALLET_PRIVATE_KEY',
      'PAYMENT_ROUTER_CONTRACT',
      'USDH_CONTRACT',
      'YIELD_VAULT_CONTRACT'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      log(`Missing environment variables: ${missing.join(', ')}`, 'red');
      process.exit(1);
    }
  }

  async start() {
    this.showBanner();

    while (this.running) {
      await this.showMenu();
    }

    rl.close();
  }

  private showBanner() {
    console.log('\n' + '='.repeat(60));
    log('💰  PAYMENT SETTLEMENT CLI - MVP', 'cyan');
    log(`Network: ${process.env.STACKS_NETWORK || 'testnet'}`, 'yellow');
    console.log('='.repeat(60) + '\n');
  }

  private async showMenu() {
    log('\n📋 Main Menu:', 'bright');
    console.log('1. View payment intent');
    console.log('2. Settle payment (regular)');
    console.log('3. Settle payment (with auto-withdraw)');
    console.log('4. Mint test USDh');
    console.log('5. Check vault balance');
    console.log('6. Exit');

    const choice = await question('\nSelect option (1-6): ');

    switch (choice.trim()) {
      case '1':
        await this.viewPaymentIntent();
        break;
      case '2':
        await this.settlePayment(false);
        break;
      case '3':
        await this.settlePayment(true);
        break;
      case '4':
        await this.mintUsdh();
        break;
      case '5':
        await this.checkVaultBalance();
        break;
      case '6':
        log('\n👋 Goodbye!', 'green');
        this.running = false;
        break;
      default:
        log('Invalid option. Please try again.', 'red');
    }
  }

  private async viewPaymentIntent() {
    const intentId = await question('\nEnter payment intent ID: ');

    if (!intentId.trim()) {
      log('Intent ID required', 'red');
      return;
    }

    log('\n🔍 Fetching payment intent...', 'yellow');

    const intent = await this.service.getPaymentIntent(intentId.trim());

    if (!intent) {
      log('❌ Payment intent not found', 'red');
      return;
    }

    console.log('\n' + '─'.repeat(60));
    log('📄 Payment Intent Details', 'cyan');
    console.log('─'.repeat(60));
    console.log(`Intent ID:       ${intent.intentId}`);
    console.log(`Status:          ${this.colorizeStatus(intent.status)}`);
    console.log(`Agent:           ${intent.agent}`);
    console.log(`Source Chain:    ${intent.sourceChain}`);
    console.log(`Source Token:    ${intent.sourceToken}`);
    console.log(`Expected USDh:   ${this.service.formatUsdh(intent.expectedUsdh)} USDh`);
    console.log(`Net Amount:      ${this.service.formatUsdh(intent.netAmount)} USDh`);
    console.log(`Fees Paid:       ${this.service.formatUsdh(intent.feesPaid)} USDh`);
    console.log(`Payment Address: ${intent.paymentAddress}`);

    if (intent.sourceTxHash) {
      console.log(`Source TX:       ${intent.sourceTxHash}`);
    }
    if (intent.settlementTxHash) {
      console.log(`Settlement TX:   ${intent.settlementTxHash}`);
    }

    console.log('─'.repeat(60) + '\n');
  }

  private async settlePayment(withAutoWithdraw: boolean) {
    const intentId = await question('\nEnter payment intent ID: ');

    if (!intentId.trim()) {
      log('Intent ID required', 'red');
      return;
    }

    // Fetch payment intent
    log('\n🔍 Fetching payment intent...', 'yellow');
    const intent = await this.service.getPaymentIntent(intentId.trim());

    if (!intent) {
      log('❌ Payment intent not found', 'red');
      return;
    }

    // Show details
    console.log('\n' + '─'.repeat(60));
    log('📄 Payment to Settle', 'cyan');
    console.log('─'.repeat(60));
    console.log(`Intent ID:     ${intent.intentId}`);
    console.log(`Status:        ${this.colorizeStatus(intent.status)}`);
    console.log(`Agent:         ${intent.agent}`);
    console.log(`Amount:        ${this.service.formatUsdh(intent.expectedUsdh)} USDh`);
    console.log(`Net to Agent:  ${this.service.formatUsdh(intent.netAmount)} USDh`);
    console.log(`Fees:          ${this.service.formatUsdh(intent.feesPaid)} USDh`);
    console.log('─'.repeat(60));

    // Verify status
    if (intent.status !== 'detected' && intent.status !== 'routing') {
      log(`\n⚠️  Warning: Payment status is "${intent.status}"`, 'yellow');
      log('Expected status: "detected" or "routing"', 'yellow');

      const proceed = await question('Proceed anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        log('Settlement cancelled', 'yellow');
        return;
      }
    }

    // Confirm settlement
    const settlementType = withAutoWithdraw ? 'with auto-withdraw' : 'regular';
    log(`\n⚠️  You are about to settle this payment (${settlementType})`, 'yellow');

    const confirm = await question('Type "SETTLE" to confirm: ');
    if (confirm !== 'SETTLE') {
      log('Settlement cancelled', 'yellow');
      return;
    }

    // Perform settlement
    try {
      let txId: string;

      if (withAutoWithdraw) {
        txId = await this.service.completeSettlementWithWithdraw(
          intent.intentId,
          intent.expectedUsdh
        );
      } else {
        txId = await this.service.completeSettlement(
          intent.intentId,
          intent.expectedUsdh
        );
      }

      log(`\n✅ Settlement transaction broadcast!`, 'green');
      log(`Transaction ID: ${txId}`, 'cyan');
      log(`View on explorer: https://explorer.hiro.so/txid/${txId}?chain=testnet`, 'blue');

      // Wait for confirmation
      const waitForConf = await question('\nWait for confirmation? (y/n): ');
      if (waitForConf.toLowerCase() === 'y') {
        const confirmed = await this.service.waitForConfirmation(txId);
        if (confirmed) {
          log('\n🎉 Settlement complete!', 'green');
        } else {
          log('\n⚠️  Settlement transaction failed or timed out', 'yellow');
        }
      }
    } catch (error: any) {
      log(`\n❌ Settlement failed: ${error.message}`, 'red');
    }
  }

  private async mintUsdh() {
    log('\n💰 Mint Test USDh (Testnet Only)', 'cyan');

    const amountStr = await question('Enter amount to mint (e.g., 1000): ');
    const amount = this.service.parseUsdh(amountStr);

    if (!amount || amount <= 0) {
      log('Invalid amount', 'red');
      return;
    }

    const recipient = await question('Enter recipient address (or press Enter for deployer): ');
    const recipientAddress = recipient.trim() || process.env.STACKS_SETTLEMENT_WALLET_ADDRESS!;

    log(`\nMinting ${this.service.formatUsdh(amount)} USDh to ${recipientAddress}`, 'yellow');

    const confirm = await question('Confirm? (y/n): ');
    if (confirm.toLowerCase() !== 'y') {
      log('Mint cancelled', 'yellow');
      return;
    }

    try {
      const txId = await this.service.mintUsdh(amount, recipientAddress);

      log(`\n✅ Mint transaction broadcast!`, 'green');
      log(`Transaction ID: ${txId}`, 'cyan');
      log(`View on explorer: https://explorer.hiro.so/txid/${txId}?chain=testnet`, 'blue');

    } catch (error: any) {
      log(`\n❌ Mint failed: ${error.message}`, 'red');
    }
  }

  private async checkVaultBalance() {
    const agentAddress = await question('\nEnter agent address: ');

    if (!agentAddress.trim()) {
      log('Address required', 'red');
      return;
    }

    log('\n🔍 Fetching vault balance...', 'yellow');

    const balance = await this.service.getVaultBalance(agentAddress.trim());

    if (!balance || !balance.success) {
      log('❌ Could not fetch balance', 'red');
      return;
    }

    const data = balance.value.value;

    console.log('\n' + '─'.repeat(60));
    log('💰 Vault Balance', 'cyan');
    console.log('─'.repeat(60));
    console.log(`Agent:            ${agentAddress.trim()}`);
    console.log(`Principal:        ${this.service.formatUsdh(parseInt(data.principal.value))} USDh`);
    console.log(`Accrued Yield:    ${this.service.formatUsdh(parseInt(data['accrued-yield'].value))} USDh`);
    console.log(`Total:            ${this.service.formatUsdh(parseInt(data.total.value))} USDh`);
    console.log(`Total Earned:     ${this.service.formatUsdh(parseInt(data['total-yield-earned'].value))} USDh`);
    console.log('─'.repeat(60) + '\n');
  }

  private colorizeStatus(status: string): string {
    const statusColors: Record<string, keyof typeof colors> = {
      pending: 'yellow',
      detected: 'cyan',
      routing: 'blue',
      executing: 'magenta',
      settled: 'green',
      failed: 'red',
      expired: 'red',
    };

    const color = statusColors[status] || 'reset';
    return `${colors[color]}${status}${colors.reset}`;
  }
}

// Main
async function main() {
  try {
    const cli = new SettlementCLI();
    await cli.start();
  } catch (error: any) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
