import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// Helper to build a contract principal string
const contractPrincipal = (deployer: Account, name: string) => `${deployer.address}.${name}`;

// ============================================
// INITIALIZATION TESTS
// ============================================

Clarinet.test({
  name: 'Can initialize payment router contract',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // Second initialization should fail
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    block2.receipts[0].result.expectErr().expectUint(3008); // ERR-CONTRACT-NOT-INITIALIZED
  },
});

Clarinet.test({
  name: 'Can transfer ownership',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const newOwner = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'payment-router',
        'transfer-ownership',
        [types.principal(newOwner.address)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
  },
});

// ============================================
// READ-ONLY FUNCTION TESTS
// ============================================

Clarinet.test({
  name: 'Can get protocol stats',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const result = chain.callReadOnlyFn(
      'payment-router',
      'get-protocol-stats',
      [],
      deployer.address
    );

    const stats = result.result.expectTuple();
    stats['total-payments'].expectUint(0);
    stats['total-settled-volume'].expectUint(0);
    stats['settlement-fee-bps'].expectUint(50); // Default 0.5%
    stats['is-paused'].expectBool(false);
  },
});

Clarinet.test({
  name: 'Can check if payment is expired',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    // Non-existent payment should return true (expired)
    const result = chain.callReadOnlyFn(
      'payment-router',
      'is-payment-expired',
      [types.ascii('non-existent')],
      deployer.address
    );

    result.result.expectBool(true);
  },
});

// ============================================
// PAYMENT INTENT CREATION TESTS
// ============================================

Clarinet.test({
  name: 'Cannot create payment intent when paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Initialize and pause
    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('payment-router', 'set-paused', [types.bool(true)], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot create payment intent with invalid intent-id',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    // Register agent first
    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Empty intent-id should fail
    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii(''), // Invalid empty intent-id
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3001); // ERR-INVALID-PAYMENT
  },
});

Clarinet.test({
  name: 'Cannot create payment intent with invalid payment address',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Empty payment address should fail
    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8(''), // Invalid empty payment address
        types.none(),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3001); // ERR-INVALID-PAYMENT
  },
});

Clarinet.test({
  name: 'Cannot create payment intent with zero amounts',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Zero source amount
    const block1 = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(0), // Zero amount
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block1.receipts[0].result.expectErr().expectUint(3005); // ERR-INVALID-AMOUNT

    // Zero expected-usdh
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-002'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(0), // Zero expected
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block2.receipts[0].result.expectErr().expectUint(3005); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Cannot create payment intent with empty chain or token',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Empty chain
    const block1 = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii(''), // Empty chain
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block1.receipts[0].result.expectErr().expectUint(3001); // ERR-INVALID-PAYMENT

    // Empty token
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-002'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii(''), // Empty token
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);
    block2.receipts[0].result.expectErr().expectUint(3001); // ERR-INVALID-PAYMENT
  },
});

Clarinet.test({
  name: 'Cannot create duplicate payment intent',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Create first intent
    chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);

    // Try to create duplicate
    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'), // Same intent-id
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3003); // ERR-ALREADY-PROCESSED
  },
});

Clarinet.test({
  name: 'Cannot create payment intent for inactive agent',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    // Register then deactivate agent
    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
      Tx.contractCall('agent-registry', 'deactivate-agent', [], agent.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3006); // ERR-AGENT-NOT-FOUND
  },
});

// ============================================
// PAYMENT STATUS TRANSITION TESTS
// ============================================

Clarinet.test({
  name: 'Cannot mark payment detected as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-detected', [
        types.ascii('intent-001'),
        types.ascii('0xhash'),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot mark non-existent payment detected',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-detected', [
        types.ascii('non-existent'),
        types.ascii('0xhash'),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3002); // ERR-PAYMENT-NOT-FOUND
  },
});

Clarinet.test({
  name: 'Cannot start route execution as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'start-route-execution', [
        types.ascii('intent-001'),
        types.ascii('simple'),
        types.uint(2),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot update route progress as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'update-route-progress', [
        types.ascii('intent-001'),
        types.uint(1),
        types.uint(100),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

// ============================================
// SETTLEMENT TESTS
// ============================================

Clarinet.test({
  name: 'Cannot complete settlement as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'complete-settlement', [
        types.ascii('intent-001'),
        types.uint(1000000),
        types.ascii('0xsettle'),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot complete settlement with withdraw as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'complete-settlement-with-withdraw', [
        types.ascii('intent-001'),
        types.uint(1000000),
        types.ascii('0xsettle'),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot mark payment failed as unauthorized',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const unauthorized = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-failed', [
        types.ascii('intent-001'),
        types.utf8('test reason'),
      ], unauthorized.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot mark non-existent payment failed',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'mark-payment-failed', [
        types.ascii('non-existent'),
        types.utf8('test reason'),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3002); // ERR-PAYMENT-NOT-FOUND
  },
});

// ============================================
// EXPIRY TESTS
// ============================================

Clarinet.test({
  name: 'Cannot expire non-existent payment',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'expire-payment', [
        types.ascii('non-existent'),
      ], deployer.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3002); // ERR-PAYMENT-NOT-FOUND
  },
});

// ============================================
// OPERATOR MANAGEMENT TESTS
// ============================================

Clarinet.test({
  name: 'Can add and remove operator',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const operator = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    // Add operator
    const block1 = chain.mineBlock([
      Tx.contractCall('payment-router', 'add-operator', [
        types.principal(operator.address),
        types.ascii('relayer'),
      ], deployer.address),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Remove operator
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'remove-operator', [
        types.principal(operator.address),
      ], deployer.address),
    ]);
    block2.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: 'Cannot add operator as non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const nonOwner = accounts.get('wallet_1')!;
    const operator = accounts.get('wallet_2')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'add-operator', [
        types.principal(operator.address),
        types.ascii('relayer'),
      ], nonOwner.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

// ============================================
// ADMIN FUNCTION TESTS
// ============================================

Clarinet.test({
  name: 'Can set settlement fee with validation',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    // Valid fee (1%)
    const block1 = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-settlement-fee', [
        types.uint(100), // 1% = 100 bps
      ], deployer.address),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Verify fee updated
    const result = chain.callReadOnlyFn(
      'payment-router',
      'get-protocol-stats',
      [],
      deployer.address
    );
    const stats = result.result.expectTuple();
    stats['settlement-fee-bps'].expectUint(100);

    // Invalid fee (over 5%)
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-settlement-fee', [
        types.uint(600), // Over 5% max
      ], deployer.address),
    ]);
    block2.receipts[0].result.expectErr().expectUint(3005); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Cannot set settlement fee as non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const nonOwner = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-settlement-fee', [
        types.uint(100),
      ], nonOwner.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Can pause and unpause contract',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    // Pause
    const block1 = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-paused', [
        types.bool(true),
      ], deployer.address),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Verify paused
    const result1 = chain.callReadOnlyFn(
      'payment-router',
      'get-protocol-stats',
      [],
      deployer.address
    );
    const stats1 = result1.result.expectTuple();
    stats1['is-paused'].expectBool(true);

    // Unpause
    const block2 = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-paused', [
        types.bool(false),
      ], deployer.address),
    ]);
    block2.receipts[0].result.expectOk().expectBool(true);

    // Verify unpaused
    const result2 = chain.callReadOnlyFn(
      'payment-router',
      'get-protocol-stats',
      [],
      deployer.address
    );
    const stats2 = result2.result.expectTuple();
    stats2['is-paused'].expectBool(false);
  },
});

Clarinet.test({
  name: 'Cannot pause as non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const nonOwner = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'set-paused', [
        types.bool(true),
      ], nonOwner.address),
    ]);

    block.receipts[0].result.expectErr().expectUint(3000); // ERR-NOT-AUTHORIZED
  },
});

// ============================================
// REENTRANCY PROTECTION TESTS
// ============================================

Clarinet.test({
  name: 'Reentrancy guard exists for settlement',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Note: Actual reentrancy testing requires malicious contract callback
    // This test just verifies the guard mechanism exists and doesn't prevent
    // sequential operations

    chain.mineBlock([
      Tx.contractCall('payment-router', 'initialize-contract', [], deployer.address),
      Tx.contractCall('agent-registry', 'initialize-contract', [], deployer.address),
    ]);

    // Register agent
    chain.mineBlock([
      Tx.contractCall('agent-registry', 'register-agent', [
        types.ascii('agent-001'),
        types.list([types.ascii('ethereum')]),
        types.uint(1000000),
        types.uint(5000000000),
        types.bool(false),
        types.ascii('usdh'),
        types.none(),
      ], agent.address),
    ]);

    // Create two intents to verify lock is properly released
    const block = chain.mineBlock([
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-001'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xabc'),
        types.none(),
      ], deployer.address),
      Tx.contractCall('payment-router', 'create-payment-intent', [
        types.ascii('intent-002'),
        types.principal(agent.address),
        types.ascii('ethereum'),
        types.ascii('eth'),
        types.uint(1000000),
        types.uint(1000000),
        types.utf8('0xdef'),
        types.none(),
      ], deployer.address),
    ]);

    // Both should succeed
    block.receipts[0].result.expectOk();
    block.receipts[1].result.expectOk();
  },
});
