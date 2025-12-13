import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const principalOf = (deployer: Account, name: string) => `${deployer.address}.${name}`;

Clarinet.test({
  name: 'Auto-withdraw settlement: intent → detect → route → settle-with-withdraw',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;
    const router = principalOf(deployer, 'payment-router');
    const intentId = 'intent-auto-001';
    const amount = 2_000_000;

    // Initialize all contracts
    let block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
      Tx.contractCall('token-usdh', 'initialize-contract', [], deployer.address),
    ]);
    block.receipts.forEach(r => r.result.expectOk());

    // Authorize router
    block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'add-operator', [types.principal(router), types.ascii('router')], deployer.address),
      Tx.contractCall('yield-vault', 'add-operator', [types.principal(router)], deployer.address),
    ]);
    block.receipts.forEach(r => r.result.expectOk());

    // Fund router with USDh for settlement path
    block = chain.mineBlock([
      Tx.contractCall('token-usdh', 'mint', [types.uint(5_000_000), types.principal(router)], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Register auto-withdraw agent
    block = chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-auto'),
        types.list([types.ascii('ethereum')]),
        types.uint(1_000_000),
        types.uint(5_000_000_000),
        types.bool(true), // auto-withdraw enabled
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);
    block.receipts[0].result.expectOk();

    // Create intent
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii(intentId),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(amount),
        types.uint(amount),
        types.utf8('0xauto'),
        types.none(),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Detect
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-detected', [
        types.ascii(intentId),
        types.ascii('0xhashauto'),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Start routing
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'start-route-execution', [
        types.ascii(intentId),
        types.ascii('simple'),
        types.uint(1),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Complete settlement with withdraw
    block = chain.mineBlock([
      Tx.contractCall('payment-router', 'complete-settlement-with-withdraw', [
        types.ascii(intentId),
        types.uint(amount),
        types.ascii('0xsettleauto'),
      ], deployer.address),
    ]);
    block.receipts[0].result.expectOk();

    // Assert intent is settled
    const intentRO = chain.callReadOnlyFn('payment-router', 'get-payment-intent', [types.ascii(intentId)], deployer.address);
    const intent = intentRO.result.expectSome().expectTuple();
    intent['status'].expectAscii('settled');

    // Vault stats should have increased (at least net amount deposited then withdrawn)
    const stats = chain.callReadOnlyFn('yield-vault', 'get-vault-stats', [], deployer.address).result.expectOk().expectTuple();
    stats['total-deposited'].expectUint(0); // after instant-withdraw, principal should be 0
  },
});




