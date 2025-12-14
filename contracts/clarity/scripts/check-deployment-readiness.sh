#!/bin/bash

# Stacks Payment Router - Deployment Readiness Check Script
# Checks wallet balance, contract compilation, and deployment plan

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "Deployment Readiness Check"
echo "========================================="
echo ""

# Configuration
DEPLOYMENT_ADDRESS="ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K"
DEPLOYMENT_PLAN="deployments/default.testnet-plan.yaml"
NETWORK="testnet"

# Track issues
ISSUES=0
WARNINGS=0

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 1. Check Clarinet installation
echo -e "${BLUE}1. Checking Clarinet installation...${NC}"
if command_exists clarinet; then
    CLARINET_VERSION=$(clarinet --version 2>&1 | head -1)
    echo -e "${GREEN}✅ Clarinet installed: $CLARINET_VERSION${NC}"
else
    echo -e "${RED}❌ Clarinet not found. Please install Clarinet first.${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 2. Check contract compilation
echo -e "${BLUE}2. Checking contract compilation...${NC}"
cd "$(dirname "$0")/.." || exit 1
if clarinet check > /dev/null 2>&1; then
    echo -e "${GREEN}✅ All contracts compile successfully${NC}"
else
    echo -e "${RED}❌ Contract compilation failed${NC}"
    echo "Running clarinet check to see errors..."
    clarinet check
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 3. Check deployment plan exists
echo -e "${BLUE}3. Checking deployment plan...${NC}"
if [ -f "$DEPLOYMENT_PLAN" ]; then
    echo -e "${GREEN}✅ Deployment plan found: $DEPLOYMENT_PLAN${NC}"
    
    # Extract costs
    TOTAL_COST=$(grep "cost:" "$DEPLOYMENT_PLAN" | awk '{sum+=$2} END {print sum}')
    TOTAL_COST_STX=$(echo "scale=2; $TOTAL_COST / 1000000" | bc)
    CONTRACT_COUNT=$(grep -c "contract-publish:" "$DEPLOYMENT_PLAN")
    
    echo "   Contracts to deploy: $CONTRACT_COUNT"
    echo "   Total cost: $TOTAL_COST microSTX (~$TOTAL_COST_STX STX)"
    
    if (( $(echo "$TOTAL_COST_STX > 10" | bc -l) )); then
        echo -e "${YELLOW}⚠️  Warning: Deployment cost seems high (>10 STX)${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${RED}❌ Deployment plan not found: $DEPLOYMENT_PLAN${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 4. Check wallet balance
echo -e "${BLUE}4. Checking wallet balance...${NC}"
BALANCE_RESPONSE=$(curl -s "https://api.testnet.hiro.so/v2/accounts/$DEPLOYMENT_ADDRESS" 2>/dev/null)

if [ -n "$BALANCE_RESPONSE" ]; then
    BALANCE=$(echo "$BALANCE_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('balance', '0'))" 2>/dev/null)
    
    if [ -n "$BALANCE" ] && [ "$BALANCE" != "0" ] && [ "$BALANCE" != "None" ]; then
        BALANCE_STX=$(echo "scale=6; $BALANCE / 1000000" | bc)
        echo -e "${GREEN}✅ Wallet balance: $BALANCE microSTX (~$BALANCE_STX STX)${NC}"
        
        # Compare with deployment cost
        if [ -n "$TOTAL_COST" ]; then
            if (( $(echo "$BALANCE < $TOTAL_COST" | bc -l) )); then
                SHORTFALL=$(echo "scale=2; ($TOTAL_COST - $BALANCE) / 1000000" | bc)
                echo -e "${RED}❌ Insufficient balance! Need ~$TOTAL_COST_STX STX, have ~$BALANCE_STX STX${NC}"
                echo -e "${YELLOW}   Shortfall: ~$SHORTFALL STX${NC}"
                echo -e "${YELLOW}   Get testnet STX from: https://explorer.hiro.so/sandbox/faucet?chain=testnet${NC}"
                ISSUES=$((ISSUES + 1))
            else
                REMAINING=$(echo "scale=2; ($BALANCE - $TOTAL_COST) / 1000000" | bc)
                echo -e "${GREEN}✅ Sufficient balance. Will have ~$REMAINING STX remaining${NC}"
            fi
        fi
    else
        echo -e "${YELLOW}⚠️  Could not parse balance from API response${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}⚠️  Could not fetch wallet balance from API${NC}"
    echo "   Address: $DEPLOYMENT_ADDRESS"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 5. Check network connectivity
echo -e "${BLUE}5. Checking network connectivity...${NC}"
if curl -s --max-time 5 "https://api.testnet.hiro.so/v2/info" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Can reach Stacks testnet API${NC}"
else
    echo -e "${RED}❌ Cannot reach Stacks testnet API${NC}"
    ISSUES=$((ISSUES + 1))
fi
echo ""

# 6. Check for conflicting fee rates
echo -e "${BLUE}6. Checking fee rate configuration...${NC}"
TESTNET_FEE_RATE=$(grep "deployment_fee_rate" settings/Testnet.toml 2>/dev/null | awk '{print $3}' || echo "not found")
CLARINET_FEE_RATE=$(grep -A 5 "\[networks.testnet\]" Clarinet.toml 2>/dev/null | grep "deployment_fee_rate" | awk '{print $3}' || echo "not found")

if [ "$TESTNET_FEE_RATE" != "$CLARINET_FEE_RATE" ] && [ "$TESTNET_FEE_RATE" != "not found" ] && [ "$CLARINET_FEE_RATE" != "not found" ]; then
    echo -e "${YELLOW}⚠️  Conflicting fee rates detected:${NC}"
    echo "   Testnet.toml: $TESTNET_FEE_RATE"
    echo "   Clarinet.toml: $CLARINET_FEE_RATE"
    echo "   This may cause incorrect cost calculations"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ Fee rate configuration consistent${NC}"
fi
echo ""

# 7. Check contract sizes
echo -e "${BLUE}7. Checking contract sizes...${NC}"
LARGE_CONTRACTS=0
for contract in *.clar; do
    if [ -f "$contract" ]; then
        SIZE=$(wc -c < "$contract")
        SIZE_KB=$(echo "scale=2; $SIZE / 1024" | bc)
        if [ "$SIZE" -gt 100000 ]; then
            echo -e "${YELLOW}⚠️  $contract is large: ${SIZE_KB}KB${NC}"
            LARGE_CONTRACTS=$((LARGE_CONTRACTS + 1))
        fi
    fi
done

if [ $LARGE_CONTRACTS -eq 0 ]; then
    echo -e "${GREEN}✅ All contracts are reasonably sized${NC}"
else
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Summary
echo "========================================="
echo "Summary"
echo "========================================="

if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to deploy.${NC}"
    echo ""
    echo "To deploy, run:"
    echo "  cd contracts/clarity"
    echo "  clarinet deployments apply -p $DEPLOYMENT_PLAN --no-dashboard"
    exit 0
elif [ $ISSUES -eq 0 ]; then
    echo -e "${YELLOW}⚠️  $WARNINGS warning(s) found, but deployment may still work${NC}"
    echo ""
    echo "To deploy, run:"
    echo "  cd contracts/clarity"
    echo "  clarinet deployments apply -p $DEPLOYMENT_PLAN --no-dashboard"
    exit 0
else
    echo -e "${RED}❌ $ISSUES issue(s) found that must be resolved before deployment${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}   Also $WARNINGS warning(s)${NC}"
    fi
    exit 1
fi

