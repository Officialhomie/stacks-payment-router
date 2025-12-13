#!/bin/bash

# Stacks Payment Router - Testnet Deployment Script
# This script deploys all contracts to testnet and performs initial configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Stacks Payment Router - Testnet Deployment"
echo "========================================="
echo ""

# Configuration
DEPLOYMENT_PLAN="deployments/default.testnet-plan.yaml"
EXPECTED_SENDER="ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"

# Step 1: Pre-deployment checks
echo "📝 Step 1: Pre-deployment checks..."
echo ""

# Check if clarinet is installed
if ! command -v clarinet &> /dev/null; then
    echo -e "${RED}❌ Error: clarinet is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Clarinet version: $(clarinet --version)${NC}"

# Check if deployment plan exists
if [ ! -f "$DEPLOYMENT_PLAN" ]; then
    echo -e "${RED}❌ Error: Deployment plan not found at $DEPLOYMENT_PLAN${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment plan found${NC}"

# Verify contracts compile
echo ""
echo "Verifying contracts compile..."
if clarinet check; then
    echo -e "${GREEN}✅ All contracts syntax validated${NC}"
else
    echo -e "${RED}❌ Contract compilation failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Before proceeding, ensure you have:${NC}"
echo "   1. Testnet STX in account: $EXPECTED_SENDER"
echo "   2. Private key configured for this account"
echo "   3. Reviewed the deployment plan at: $DEPLOYMENT_PLAN"
echo ""
read -p "Continue with deployment? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

# Step 2: Deploy contracts
echo ""
echo "========================================="
echo "📝 Step 2: Deploying contracts to testnet"
echo "========================================="
echo ""

echo "This will deploy in the following order:"
echo "  Batch 0: token-usdh, agent-registry"
echo "  Batch 1: yield-vault"
echo "  Batch 2: payment-router"
echo ""

# Note: Clarinet 3.x deployment command
echo "Running deployment..."
echo ""

# Generate and apply deployment
clarinet deployments generate --testnet > /dev/null 2>&1 || true
clarinet deployments apply --manifest-path Clarinet.toml -p $DEPLOYMENT_PLAN 2>&1 | tee deployment.log

if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}✅ Contracts deployed successfully${NC}"
else
    echo -e "${RED}❌ Deployment failed. Check deployment.log for details${NC}"
    exit 1
fi

# Step 3: Verify deployment
echo ""
echo "========================================="
echo "📝 Step 3: Verifying deployment"
echo "========================================="
echo ""

# Save contract addresses
TOKEN_CONTRACT="$EXPECTED_SENDER.token-usdh"
REGISTRY_CONTRACT="$EXPECTED_SENDER.agent-registry"
VAULT_CONTRACT="$EXPECTED_SENDER.yield-vault"
ROUTER_CONTRACT="$EXPECTED_SENDER.payment-router"

echo "Deployed contracts:"
echo "  token-usdh:      $TOKEN_CONTRACT"
echo "  agent-registry:  $REGISTRY_CONTRACT"
echo "  yield-vault:     $VAULT_CONTRACT"
echo "  payment-router:  $ROUTER_CONTRACT"
echo ""

# Create contract addresses file for initialization
cat > contract-addresses.testnet.json <<EOF
{
  "network": "testnet",
  "deployer": "$EXPECTED_SENDER",
  "contracts": {
    "token-usdh": "$TOKEN_CONTRACT",
    "agent-registry": "$REGISTRY_CONTRACT",
    "yield-vault": "$VAULT_CONTRACT",
    "payment-router": "$ROUTER_CONTRACT"
  }
}
EOF

echo -e "${GREEN}✅ Contract addresses saved to: contract-addresses.testnet.json${NC}"
echo ""

# Step 4: Generate initialization script
echo "========================================="
echo "📝 Step 4: Generating initialization script"
echo "========================================="
echo ""

cat > initialize-testnet.clar <<EOF
;; Testnet Initialization Script
;; Run these commands in order using clarinet console or stacks CLI

;; Step 1: Initialize all contracts
;; ================================

;; Initialize token-usdh
(contract-call? .token-usdh initialize-contract)

;; Initialize agent-registry
(contract-call? .agent-registry initialize-contract)

;; Initialize yield-vault
(contract-call? .yield-vault initialize-contract)

;; Initialize payment-router
(contract-call? .payment-router initialize-contract)

;; Step 2: Configure operators
;; ============================

;; Add payment-router as operator to agent-registry
(contract-call? .agent-registry add-operator
  .payment-router
  "router")

;; Add payment-router as operator to yield-vault
(contract-call? .yield-vault add-operator
  .payment-router)

;; Step 3: Verify operators
;; =========================

;; Check agent-registry operator
(contract-call? .agent-registry is-operator-authorized .payment-router)

;; Check yield-vault operator
(contract-call? .yield-vault is-operator-authorized .payment-router)

;; Step 4: Mint initial USDh for testing
;; =======================================

;; Mint 10M USDh to payment-router for settlements
(contract-call? .token-usdh mint u10000000000000 .payment-router)

;; Mint 1M USDh to your test account for testing
(contract-call? .token-usdh mint u1000000000000 tx-sender)

;; Step 5: Verify protocol stats
;; ==============================

(contract-call? .agent-registry get-protocol-stats)
(contract-call? .payment-router get-protocol-stats)
(contract-call? .yield-vault get-vault-stats)

;; Step 6: Register a test agent
;; ==============================

(contract-call? .agent-registry register-agent
  "test-agent-001"
  (list "ethereum" "arbitrum")
  u1000000       ;; min 1 USDh
  u5000000000    ;; max 5000 USDh
  false          ;; auto-withdraw disabled
  "usdh"
  none)

;; Verify agent registration
(contract-call? .agent-registry get-agent tx-sender)
EOF

echo -e "${GREEN}✅ Initialization script created: initialize-testnet.clar${NC}"
echo ""

# Step 5: Next steps
echo "========================================="
echo "📝 Step 5: Next Steps"
echo "========================================="
echo ""
echo "Your contracts have been deployed to testnet!"
echo ""
echo "To complete the setup:"
echo ""
echo "Option A - Use Clarinet Console:"
echo "  1. cd /Users/mac/stacks-payment-router/contracts/clarity"
echo "  2. clarinet console --testnet"
echo "  3. Copy and paste commands from: initialize-testnet.clar"
echo ""
echo "Option B - Use Stacks CLI:"
echo "  1. Install: npm install -g @stacks/cli"
echo "  2. Run initialization transactions manually"
echo ""
echo "Option C - Use a frontend/script:"
echo "  1. Use @stacks/transactions library"
echo "  2. Send contract-call transactions for each initialization step"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT:${NC} Run initialization commands in order!"
echo ""
echo "Files created:"
echo "  - contract-addresses.testnet.json (contract addresses)"
echo "  - initialize-testnet.clar (initialization commands)"
echo "  - deployment.log (deployment output)"
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "========================================="
