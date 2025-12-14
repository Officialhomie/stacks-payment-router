#!/bin/bash
# Deploy Clarity contracts to Stacks

set -e

NETWORK=${1:-testnet}
CONTRACT_DIR="contracts/clarity"

echo "Deploying contracts to $NETWORK..."

if [ "$NETWORK" = "mainnet" ]; then
  echo "WARNING: Deploying to MAINNET!"
  read -p "Are you sure? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Deployment cancelled"
    exit 1
  fi
fi

# Deploy agent-registry contract
echo "Deploying agent-registry..."
stx deploy "$CONTRACT_DIR/agent-registry.clar" \
  --network "$NETWORK" \
  --contract-name agent-registry

# Deploy yield-vault contract
echo "Deploying yield-vault..."
stx deploy "$CONTRACT_DIR/yield-vault.clar" \
  --network "$NETWORK" \
  --contract-name yield-vault

echo "Contracts deployed successfully!"

