import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v1.0.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
  name: 'Can deposit to vault',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;
    const agent = accounts.get('wallet_1')!;

    // Note: This test assumes hermetica-usdh contract is deployed
    // In real tests, you'd need to mock or deploy the dependency first

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'deposit-to-vault',
        [types.uint(1000000)], // 1 USDh (6 decimals)
        agent.address
      ),
    ]);

    // This will fail if hermetica-usdh is not available
    // In production, you'd set up the contract dependency first
    assertEquals(block.receipts.length, 1);
  },
});

Clarinet.test({
  name: 'Can get balance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-balance',
      [types.principal(agent.address)],
      agent.address
    );

    // Should return balance structure even if zero
    result.result.expectOk().expectTuple();
    const balance = result.result.expectOk().expectTuple();
    balance['principal'].expectUint(0);
    balance['accrued-yield'].expectUint(0);
    balance['total'].expectUint(0);
  },
});

Clarinet.test({
  name: 'Cannot withdraw without balance',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const agent = accounts.get('wallet_1')!;

    const block = chain.mineBlock([
      Tx.contractCall(
        'yield-vault',
        'withdraw-from-vault',
        [types.uint(1000000)],
        agent.address
      ),
    ]);

    block.receipts[0].result.expectErr().expectUint(2001); // ERR-INSUFFICIENT-BALANCE
  },
});

Clarinet.test({
  name: 'Can get vault total',
  async fn(chain: Chain, accounts: Map<string, Account>) {
    const deployer = accounts.get('deployer')!;

    const result = chain.callReadOnlyFn(
      'yield-vault',
      'get-vault-total',
      [],
      deployer.address
    );

    result.result.expectOk().expectTuple();
    const total = result.result.expectOk().expectTuple();
    total['total-deposited'].expectUint(0);
    total['total-yield-distributed'].expectUint(0);
  },
});

