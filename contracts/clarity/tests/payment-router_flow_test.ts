import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Helper to build a contract principal string
const contractPrincipal = (deployer: Account, name: string) => `${deployer.address}.${name}`;

Clarinet.test({
  name: 'Payment router happy path: register agent, create intent, settle',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;
    const intentId = 'intent-001';
    const amount = 2_000_000;

    // Initialize all contracts
    let block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
      Tx.contractCall('token-usdh', 'initialize-contract', [], deployer.address),
    ]);
    block.receipts.forEach(r => r.result.expectOk());

    // Authorize payment-router in registry and vault
    block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'add-operator', [types.principal(contractPrincipal(deployer, 'payment-router')), types.ascii('router')], deployer.address),
      Tx.contractCall('yield-vault', 'add-operator', [types.principal(contractPrincipal(deployer, 'payment-router'))], deployer.address),
    ]);
    block.receipts.forEach(r => r.result.expectOk());

    // Fund payment-router contract with USDh to allow settlement deposits
    block = chain.mineBlock([
      Tx.contractCall('token-usdh', 'mint', [types.uint(5_000_000), types.principal(contractPrincipal(deployer, 'payment-router'))], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Register agent
    block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1_000_000),
        types.uint(5_000_000_000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);
    block.receipts[0].result.expectOk();

    // Create payment intent
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii(intentId),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(amount),
        types.uint(amount),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Mark detected
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-detected', [
        types.ascii(intentId),
        types.ascii('0xhash'),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Start routing
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'start-route-execution', [
        types.ascii(intentId),
        types.ascii('simple'),
        types.uint(2),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Complete settlement (no auto-withdraw)
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'complete-settlement', [
        types.ascii(intentId),
        types.uint(amount),
        types.ascii('0xsettle'),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Assert payment intent is settled
    const ro = chain.callReadOnlyFn('payment-router', 'get-payment-intent', [types.ascii(intentId)], deployer.address);
    const intent = ro.result.expectSome().expectTuple();
    intent['status'].expectAscii('settled');
    intent['net-amount'].expectUint(amount - Math.floor(amount * 50 / 10_000)); // fee-bps default 50
  },
});

Clarinet.test({
  name: 'create-payment-intent fails for unknown agent',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Initialize contracts (router only)
    let block = chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Attempt to create intent for non-registered agent
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('bad-intent'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1_000_000),
        types.uint(1_000_000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectErr();
  },
});

