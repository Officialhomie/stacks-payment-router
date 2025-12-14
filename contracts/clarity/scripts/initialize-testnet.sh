#!/bin/bash
# Initialize deployed contracts on testnet

set -e

echo "=== Initializing Contracts on Testnet ==="
echo ""

# DEPLOYER address will be derived from mnemonic in settings/Testnet.toml

echo "Step 1: Initialize token-usdh"
clarinet run --allow-wallets scripts/init-token-usdh.ts

echo ""
echo "Step 2: Initialize agent-registry"
clarinet run --allow-wallets scripts/init-agent-registry.ts

echo ""
echo "Step 3: Initialize yield-vault"
clarinet run --allow-wallets scripts/init-yield-vault.ts

echo ""
echo "Step 4: Initialize payment-router"
clarinet run --allow-wallets scripts/init-payment-router.ts

echo ""
echo "Step 5: Configure operators"
clarinet run --allow-wallets scripts/configure-operators.ts

echo ""
echo "=== Initialization Complete ==="
echo ""
echo "Deployed contracts:"
echo "  - token-usdh: $DEPLOYER.token-usdh"
echo "  - agent-registry: $DEPLOYER.agent-registry"
echo "  - yield-vault: $DEPLOYER.yield-vault"
echo "  - payment-router: $DEPLOYER.payment-router"
echo ""
echo "Next steps:"
echo "  1. Verify contracts on testnet explorer"
echo "  2. Mint test USDh tokens"
echo "  3. Register test agent"
echo "  4. Create and settle test payment"
