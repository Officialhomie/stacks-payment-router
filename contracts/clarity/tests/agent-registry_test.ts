import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

/**
 * AGENT REGISTRY TEST SUITE
 * Tests for production-ready agent registry contract
 */

// Helper function to register an agent
function registerAgent(
  chain: Chain,
  agent: Account,
  agentId: string = 'agent-001',
  chains: string[] = ['ethereum', 'arbitrum'],
  minAmount: number = 1_000_000,
  maxAmount: number = 1_000_000_000,
  autoWithdraw: boolean = false,
  settlementPref: string = 'usdh',
  webhook: string | null = null
) {
  return chain.mineBlock([
    Tx.contractCall(
      'agent-registry',
      'register-agent',
      [
        types.ascii(agentId),
        types.list(chains.map(c => types.ascii(c))),
        types.uint(minAmount),
        types.uint(maxAmount),
        types.bool(autoWithdraw),
        types.ascii(settlementPref),
        webhook ? types.some(types.utf8(webhook)) : types.none(),
      ],
      agent.address
    ),
  ]);
}

// ===========================================
// REGISTRATION TESTS
// ===========================================

Clarinet.test({
  name: 'Can register an agent with all valid parameters',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = registerAgent(chain, agent);

    assertEquals(block.receipts.length, 1);
    assertEquals(block.height, 2);

    const result = block.receipts[0].result.expectOk().expectTuple();
    result['agent-id'].expectAscii('agent-001');
    result['agent-index'].expectUint(1);
    result['stacks-address'].expectPrincipal(agent.address);
  },
});

Clarinet.test({
  name: 'Cannot register agent twice with same address',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent, 'agent-001');

    const block = registerAgent(chain, agent, 'agent-002');

    block.receipts[0].result.expectErr().expectUint(1001); // ERR-AGENT-EXISTS
  },
});

Clarinet.test({
  name: 'Cannot register agent with duplicate agent-id',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent1 = accounts.get('wallet_1')!;
    const agent2 = accounts.get('wallet_2')!;

    registerAgent(chain, agent1, 'agent-001');

    const block = registerAgent(chain, agent2, 'agent-001'); // Same ID

    block.receipts[0].result.expectErr().expectUint(1001); // ERR-AGENT-EXISTS
  },
});

Clarinet.test({
  name: 'Cannot register with min-amount > max-amount',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = registerAgent(
      chain,
      agent,
      'agent-001',
      ['ethereum'],
      10_000_000, // min
      5_000_000   // max (less than min!)
    );

    block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Cannot register with zero min-amount',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = registerAgent(
      chain,
      agent,
      'agent-001',
      ['ethereum'],
      0, // Invalid!
      1_000_000
    );

    block.receipts[0].result.expectErr().expectUint(1003); // ERR-INVALID-AMOUNT
  },
});

Clarinet.test({
  name: 'Cannot register with empty chain list',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = registerAgent(
      chain,
      agent,
      'agent-001',
      [] // Empty chains!
    );

    block.receipts[0].result.expectErr().expectUint(1004); // ERR-INVALID-CHAIN
  },
});

Clarinet.test({
  name: 'Cannot register with more than 10 chains',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = registerAgent(
      chain,
      agent,
      'agent-001',
      ['ethereum', 'arbitrum', 'optimism', 'polygon', 'avalanche',
       'bsc', 'fantom', 'cronos', 'stacks', 'bitcoin', 'solana'] // 11 chains!
    );

    block.receipts[0].result.expectErr().expectUint(1004); // ERR-INVALID-CHAIN
  },
});

// ===========================================
// PAYMENT ADDRESS TESTS
// ===========================================

Clarinet.test({
  name: 'Can set payment address for enabled chain',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent, 'agent-001', ['ethereum']);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'set-payment-address',
        [
          types.ascii('ethereum'),
          types.utf8('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
        ],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);
  },
});

Clarinet.test({
  name: 'Cannot set payment address if not registered',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'set-payment-address',
        [
          types.ascii('ethereum'),
          types.utf8('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
        ],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1002); // ERR-AGENT-NOT-FOUND
  },
});

Clarinet.test({
  name: 'Cannot set payment address for non-enabled chain',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent, 'agent-001', ['ethereum']); // Only ethereum

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'set-payment-address',
        [
          types.ascii('arbitrum'), // Not enabled!
          types.utf8('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'),
        ],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1004); // ERR-INVALID-CHAIN
  },
});

// ===========================================
// AGENT SETTINGS UPDATE TESTS
// ===========================================

Clarinet.test({
  name: 'Can update agent settings',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'update-agent-settings',
        [
          types.uint(2_000_000), // new min
          types.uint(5_000_000_000), // new max
          types.bool(true), // new auto-withdraw
          types.ascii('stx'), // new settlement preference
          types.some(types.utf8('https://webhook.example.com')),
        ],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    const result = chain.callReadOnlyFn(
      'agent-registry',
      'get-agent',
      [types.principal(agent.address)],
      agent.address
    );

    const agentData = result.result.expectSome().expectTuple();
    agentData['min-payment-amount'].expectUint(2_000_000);
    agentData['max-payment-amount'].expectUint(5_000_000_000);
    agentData['auto-withdraw'].expectBool(true);
    agentData['settlement-preference'].expectAscii('stx');
  },
});

// ===========================================
// ADMIN TESTS
// ===========================================

Clarinet.test({
  name: 'Owner can suspend agent',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'suspend-agent',
        [
          types.principal(agent.address),
          types.utf8('Violating terms'),
        ],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    const result = chain.callReadOnlyFn(
      'agent-registry',
      'get-agent',
      [types.principal(agent.address)],
      agent.address
    );

    const agentData = result.result.expectSome().expectTuple();
    agentData['status'].expectAscii('suspended');
  },
});

Clarinet.test({
  name: 'Non-owner cannot suspend agent',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent1 = accounts.get('wallet_1')!;
    const agent2 = accounts.get('wallet_2')!;

    registerAgent(chain, agent1);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'suspend-agent',
        [
          types.principal(agent1.address),
          types.utf8('Trying to suspend'),
        ],
        agent2.address // Not owner!
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

Clarinet.test({
  name: 'Owner can pause contract',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'set-paused',
        [types.bool(true)],
        deployer.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    // Try to register while paused
    const block2 = registerAgent(chain, agent);
    block2.receipts[0].result.expectErr().expectUint(1000); // ERR-NOT-AUTHORIZED
  },
});

// ===========================================
// CHAIN MANAGEMENT TESTS
// ===========================================

Clarinet.test({
  name: 'Can add enabled chains without duplicates',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent, 'agent-001', ['ethereum']);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'add-enabled-chains',
        [types.list([types.ascii('arbitrum'), types.ascii('optimism')])],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    const result = chain.callReadOnlyFn(
      'agent-registry',
      'get-agent',
      [types.principal(agent.address)],
      agent.address
    );

    const agentData = result.result.expectSome().expectTuple();
    const chains = agentData['enabled-chains'].expectList();
    assertEquals(chains.length, 3); // ethereum, arbitrum, optimism
  },
});

Clarinet.test({
  name: 'Adding duplicate chains does not increase count',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    registerAgent(chain, agent, 'agent-001', ['ethereum', 'arbitrum']);

    const block = chain.mineBlock([
      Tx.contractCall(
        'agent-registry',
        'add-enabled-chains',
        [types.list([types.ascii('ethereum'), types.ascii('optimism')])], // ethereum already exists
        agent.address
      ),
    ]);

    block.receipts[0].result.expectOk().expectBool(true);

    const result = chain.callReadOnlyFn(
      'agent-registry',
      'get-agent',
      [types.principal(agent.address)],
      agent.address
    );

    const agentData = result.result.expectSome().expectTuple();
    const chains = agentData['enabled-chains'].expectList();
    assertEquals(chains.length, 3); // ethereum, arbitrum, optimism (no duplicate ethereum)
  },
});

console.log('✅ Agent Registry test suite loaded - ' + Deno.test.length + ' tests');
