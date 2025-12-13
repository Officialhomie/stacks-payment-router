#!/bin/bash

# Stacks Payment Router - Local Devnet Deployment Script
# This script starts a local devnet, deploys contracts, and initializes them

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "Stacks Payment Router - Devnet Deployment"
echo "========================================="
echo ""

# Check if clarinet is installed
if ! command -v clarinet &> /dev/null; then
    echo "❌ Error: clarinet is not installed"
    exit 1
fi

echo -e "${GREEN}✅ Clarinet version: $(clarinet --version)${NC}"
echo ""

# Step 1: Verify contracts
echo "📝 Step 1: Verifying contracts..."
if clarinet check; then
    echo -e "${GREEN}✅ All contracts validated${NC}"
else
    echo "❌ Contract validation failed"
    exit 1
fi
echo ""

# Step 2: Start devnet integration
echo "========================================="
echo "📝 Step 2: Starting local devnet"
echo "========================================="
echo ""
echo -e "${YELLOW}This will start a local Stacks devnet with all contracts deployed.${NC}"
echo ""
echo "Once started, you can:"
echo "  - Access Stacks Explorer at: http://localhost:8000"
echo "  - Access Stacks API at: http://localhost:3999"
echo "  - Interact with contracts via console or API"
echo ""
echo "Press Ctrl+C to stop the devnet"
echo ""

read -p "Start devnet? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo "Starting devnet integration..."
echo ""

# Start clarinet integrate (this will deploy contracts automatically)
clarinet integrate

# Note: clarinet integrate runs until interrupted
# The deployment happens automatically using default.devnet-plan.yaml
