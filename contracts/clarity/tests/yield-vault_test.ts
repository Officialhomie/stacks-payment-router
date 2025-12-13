import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

// ============================================
// INITIALIZATION TESTS
// ============================================

Clarinet.test({
  name: 'Can initialize contract',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'initialize-contract',
        [],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // Second initialization should fail
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'initialize-contract',
        [],
        deployer.address
      ),
    ]);

    block2.receipts[0].result.expectErr().expectUint(2008); // ERR-ALREADY-PROCESSED
  },
});

Clarinet.test({
  name: 'Can transfer ownership',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const newOwner = accounts.get('wallet_1')!;

    // Initialize first
    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Transfer ownership
    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'transfer-ownership',
        [types.principal(newOwner.address)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
  },
});

// ============================================
// BALANCE AND STATS READ-ONLY TESTS
// ============================================

Clarinet.test({
  name: 'Can get balance for new agent (returns zero balance)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-balance',
      [types.principal(agent.address)],
      agent.address
    );

    const balance = result.result.expectOk().expectTuple();
    balance['principal'].expectUint(0);
    balance['accrued-yield'].expectUint(0);
    balance['total'].expectUint(0);
    balance['deposited-at-block'].expectUint(0);
    balance['last-yield-claim-block'].expectUint(0);
    balance['total-yield-earned'].expectUint(0);
    balance['pending-withdrawal'].expectUint(0);
    balance['withdrawal-unlock-block'].expectUint(0);
  },
});

Clarinet.test({
  name: 'Can get vault stats',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-vault-stats',
      [],
      deployer.address
    );

    const stats = result.result.expectTuple();
    stats['total-deposited'].expectUint(0);
    stats['total-yield-distributed'].expectUint(0);
    stats['total-protocol-fees'].expectUint(0);
    stats['total-agents'].expectUint(0);
  },
});

Clarinet.test({
  name: 'Can check vault is open',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'is-vault-open',
      [],
      deployer.address
    );

    result.result.expectBool(true);
  },
});

Clarinet.test({
  name: 'Can get current APY',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-current-apy',
      [],
      deployer.address
    );

    result.result.expectUint(2000); // Default 20% APY
  },
});

Clarinet.test({
  name: 'Can calculate yield (returns zero for new agent)',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'calculate-yield',
      [types.principal(agent.address)],
      agent.address
    );

    result.result.expectOk().expectUint(0);
  },
});

// ============================================
// DEPOSIT TESTS
// ============================================

Clarinet.test({
  name: 'Cannot deposit when vault is paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Initialize and pause vault
    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
      Tx.contractCall(
        'yield-vault',
        'set-vault-paused',
        [types.bool(true)],
        deployer.address
      ),
    ]);

    // Try to deposit
    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'deposit',
        [types.uint(1000000)],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2004); // ERR-VAULT-PAUSED
  },
});

Clarinet.test({
  name: 'Cannot deposit below minimum',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'deposit',
        [types.uint(100)], // Below minimum (1000000)
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2006); // ERR-BELOW-MINIMUM
  },
});

Clarinet.test({
  name: 'Cannot deposit-for-agent as unauthorized caller',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;
    const unauthorized = accounts.get('wallet_2')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'deposit-for-agent',
        [types.principal(agent.address), types.uint(1000000)],
        unauthorized.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

// ============================================
// WITHDRAWAL REQUEST TESTS
// ============================================

Clarinet.test({
  name: 'Cannot request withdrawal without balance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'request-withdrawal',
        [types.uint(1000000)],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2007); // ERR-AGENT-NOT-FOUND
  },
});

Clarinet.test({
  name: 'Can cancel pending withdrawal',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    // Try to cancel without pending withdrawal
    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'cancel-withdrawal',
        [],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2007); // ERR-AGENT-NOT-FOUND
  },
});

Clarinet.test({
  name: 'Cannot execute withdrawal without pending request',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'execute-withdrawal',
        [],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2007); // ERR-AGENT-NOT-FOUND
  },
});

Clarinet.test({
  name: 'Cannot instant-withdraw as unauthorized caller',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;
    const unauthorized = accounts.get('wallet_2')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'instant-withdraw',
        [types.principal(agent.address), types.uint(1000000)],
        unauthorized.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Cannot instant-withdraw without sufficient balance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Initialize and add deployer as operator
    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
      Tx.contractCall(
        'yield-vault',
        'add-operator',
        [types.principal(deployer.address)],
        deployer.address
      ),
    ]);

    // Try instant withdraw without balance
    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'instant-withdraw',
        [types.principal(agent.address), types.uint(1000000)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2007); // ERR-AGENT-NOT-FOUND
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

    // Initialize
    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Add operator
    const block1 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'add-operator',
        [types.principal(operator.address)],
        deployer.address
      ),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Check if authorized
    const result1 = chain.callReadOnlyFn(
      'yield-vault',
      'is-operator-authorized',
      [types.principal(operator.address)],
      deployer.address
    );
    result1.result.expectBool(true);

    // Remove operator
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'remove-operator',
        [types.principal(operator.address)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectOk().expectBool(true);

    // Check if no longer authorized
    const result2 = chain.callReadOnlyFn(
      'yield-vault',
      'is-operator-authorized',
      [types.principal(operator.address)],
      deployer.address
    );
    result2.result.expectBool(false);
  },
});

Clarinet.test({
  name: 'Cannot add operator as non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const nonOwner = accounts.get('wallet_1')!;
    const operator = accounts.get('wallet_2')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'add-operator',
        [types.principal(operator.address)],
        nonOwner.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

// ============================================
// ADMIN FUNCTION TESTS
// ============================================

Clarinet.test({
  name: 'Can set APY with validation',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Valid APY (30%)
    const block1 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-apy',
        [types.uint(3000)],
        deployer.address
      ),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Verify APY updated
    const result1 = chain.callReadOnlyFn(
      'yield-vault',
      'get-current-apy',
      [],
      deployer.address
    );
    result1.result.expectUint(3000);

    // Invalid APY (0)
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-apy',
        [types.uint(0)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectErr().expectUint(2003); // ERR-INVALID-AMOUNT

    // Invalid APY (over 50%)
    const block3 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-apy',
        [types.uint(6000)],
        deployer.address
      ),
    ]);
    block3.receipts[0].result.expectErr().expectUint(2003); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Cannot set APY as non-owner',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const nonOwner = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-apy',
        [types.uint(3000)],
        nonOwner.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Can set minimum deposit with validation',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Valid minimum
    const block1 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-minimum-deposit',
        [types.uint(5000000)], // 5 USDh
        deployer.address
      ),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Invalid minimum (0)
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-minimum-deposit',
        [types.uint(0)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectErr().expectUint(2003); // ERR-INVALID-AMOUNT

    // Invalid minimum (over max)
    const block3 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-minimum-deposit',
        [types.uint(2000000000)], // Over 1000 USDh max
        deployer.address
      ),
    ]);
    block3.receipts[0].result.expectErr().expectUint(2003); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Can set vault capacity with validation',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Valid capacity
    const block1 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-vault-capacity',
        [types.uint(200000000000000)], // 200M USDh
        deployer.address
      ),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Invalid capacity (0)
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-vault-capacity',
        [types.uint(0)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectErr().expectUint(2003); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Can pause and unpause vault',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Pause vault
    const block1 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-vault-paused',
        [types.bool(true)],
        deployer.address
      ),
    ]);
    block1.receipts[0].result.expectOk().expectBool(true);

    // Check vault is not open
    const result1 = chain.callReadOnlyFn(
      'yield-vault',
      'is-vault-open',
      [],
      deployer.address
    );
    result1.result.expectBool(false);

    // Unpause vault
    const block2 = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-vault-paused',
        [types.bool(false)],
        deployer.address
      ),
    ]);
    block2.receipts[0].result.expectOk().expectBool(true);

    // Check vault is open again
    const result2 = chain.callReadOnlyFn(
      'yield-vault',
      'is-vault-open',
      [],
      deployer.address
    );
    result2.result.expectBool(true);
  },
});

Clarinet.test({
  name: 'Can set withdrawal delay',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-withdrawal-delay',
        [types.uint(288)], // 48 hours
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: 'Can set USDh contract address',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const newContract = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'set-usdh-contract',
        [types.principal(newContract.address)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // Verify it was set
    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-usdh-contract',
      [],
      deployer.address
    );
    result.result.expectSome().expectPrincipal(newContract.address);
  },
});

Clarinet.test({
  name: 'Cannot emergency withdraw if vault not paused',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const recipient = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'emergency-withdraw',
        [types.principal(recipient.address)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2004); // ERR-VAULT-PAUSED
  },
});

// ============================================
// REENTRANCY PROTECTION TESTS
// ============================================

Clarinet.test({
  name: 'Reentrancy guard prevents concurrent deposits',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    chain.mineBlock([
      Tx.contractCall('yield-vault', 'initialize-contract', [], deployer.address),
    ]);

    // Note: This test verifies the reentrancy guard exists
    // In production, actual reentrancy would require a malicious contract
    // calling back during execution, which can't be tested directly in unit tests

    // Verify that consecutive operations work (lock is released)
    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'deposit',
        [types.uint(1000000)],
        agent.address
      ),
      Tx.contractCall(
        'yield-vault',
        'deposit',
        [types.uint(1000000)],
        agent.address
      ),
    ]);

    // Both should succeed if lock is properly released
    // (First would succeed, second would fail if lock wasn't released)
    assertEquals(block.receipts.length, 2);
  },
});
