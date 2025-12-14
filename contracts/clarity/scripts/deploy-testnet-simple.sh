#!/bin/bash

# Simple Testnet Deployment Script
# This uses Clarinet's deployment functionality

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "========================================="
echo "Testnet Deployment - Simple Method"
echo "========================================="
echo ""

# Deployer info will be derived from mnemonic in settings/Testnet.toml
echo "Deployer address will be derived from configured mnemonic"
echo ""

# Step 1: Check contracts
echo "📝 Step 1: Verifying contracts..."
if clarinet check; then
    echo -e "${GREEN}✅ Contracts verified${NC}"
else
    echo -e "${RED}❌ Contract check failed${NC}"
    exit 1
fi
echo ""

# Step 2: Check testnet STX
echo "📝 Step 2: Prerequisites"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Before proceeding, ensure you have:${NC}"
echo ""
echo "1. ✅ Testnet STX in deployer account"
echo "   Address: $DEPLOYER"
echo "   Get from: https://explorer.hiro.so/sandbox/faucet?chain=testnet"
echo ""
echo "2. ✅ Deployer mnemonic (already configured):"
echo "   $MNEMONIC"
echo ""
echo "3. ✅ Reviewed deployment plan:"
echo "   deployments/default.testnet-plan.yaml"
echo ""

read -p "Have you completed the prerequisites? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo ""
    echo "Please complete the prerequisites first:"
    echo ""
    echo "→ Go to: https://explorer.hiro.so/sandbox/faucet?chain=testnet"
    echo "→ Request testnet STX for: $DEPLOYER"
    echo "→ Wait for confirmation (~1-2 minutes)"
    echo "→ Then run this script again"
    echo ""
    exit 0
fi

echo ""
echo "========================================="
echo "📝 Step 3: Deploying to Testnet"
echo "========================================="
echo ""

echo "Deployment order:"
echo "  Batch 0: token-usdh, agent-registry"
echo "  Batch 1: yield-vault"
echo "  Batch 2: payment-router"
echo ""

# Generate deployment
echo "Generating deployment transactions..."
clarinet deployments generate --testnet || true

echo ""
echo "Applying deployment plan..."
echo ""

# Apply deployment
if clarinet deployments apply -p deployments/default.testnet-plan.yaml; then
    echo ""
    echo -e "${GREEN}✅ Deployment submitted successfully!${NC}"
    echo ""
else
    echo ""
    echo -e "${RED}❌ Deployment failed${NC}"
    echo ""
    echo "Common issues:"
    echo "  - Insufficient testnet STX"
    echo "  - Network connection issues"
    echo "  - Contracts already deployed"
    echo ""
    exit 1
fi

# Save deployment info
cat > deployment-info.testnet.txt <<EOF
Testnet Deployment Information
================================

Deployment Date: $(date)
Network: Testnet
Deployer: $DEPLOYER

Deployed Contracts:
-------------------
token-usdh:      $DEPLOYER.token-usdh
agent-registry:  $DEPLOYER.agent-registry
yield-vault:     $DEPLOYER.yield-vault
payment-router:  $DEPLOYER.payment-router

Testnet Explorer:
-----------------
https://explorer.hiro.so/?chain=testnet

Search for deployer: $DEPLOYER

Next Steps:
-----------
1. Wait for transactions to confirm (~5-10 minutes)
2. Verify contracts on explorer
3. Initialize contracts using: clarinet console --testnet
4. Run initialization commands from: initialize-testnet.clar

EOF

echo ""
echo "========================================="
echo "📝 Step 4: Next Steps"
echo "========================================="
echo ""
echo "Deployment information saved to: deployment-info.testnet.txt"
echo ""
echo "Your contracts are being deployed to testnet!"
echo ""
echo "What to do next:"
echo ""
echo "1. 🕐 Wait for confirmation (~5-10 minutes)"
echo "   Monitor at: https://explorer.hiro.so/?chain=testnet"
echo "   Search for: $DEPLOYER"
echo ""
echo "2. ✅ Verify deployment succeeded"
echo "   All 4 contracts should appear in explorer"
echo ""
echo "3. 🎯 Initialize contracts"
echo "   Run: clarinet console --testnet"
echo "   Then follow: initialize-testnet.clar"
echo ""
echo -e "${GREEN}✅ Deployment script complete!${NC}"
echo ""
