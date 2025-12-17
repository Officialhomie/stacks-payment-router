#!/bin/bash
# Deploy PaymentReceiver.sol to Sepolia
# Requires: Foundry (forge) or Hardhat

set -e

echo "═══════════════════════════════════════════════════════════"
echo "    Deploy PaymentReceiver to Sepolia"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if Foundry is installed
if command -v forge &> /dev/null; then
    echo "✅ Foundry detected"
    DEPLOY_METHOD="foundry"
elif command -v npx &> /dev/null; then
    echo "✅ Node.js detected (can use Hardhat)"
    DEPLOY_METHOD="hardhat"
else
    echo "❌ Neither Foundry nor Node.js found"
    echo "   Install Foundry: https://book.getfoundry.sh/getting-started/installation"
    echo "   Or use Remix IDE: https://remix.ethereum.org"
    exit 1
fi

echo ""
echo "Choose deployment method:"
echo "1. Foundry (forge)"
echo "2. Hardhat"
echo "3. Remix IDE (manual)"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "Deploying with Foundry..."
        echo ""
        echo "Make sure you have:"
        echo "  - Sepolia ETH in your wallet"
        echo "  - PRIVATE_KEY set in .env"
        echo "  - SEPOLIA_RPC_URL set in .env"
        echo ""
        read -p "Press Enter to continue..."
        
        cd contracts
        forge build
        forge create PaymentReceiver \
            --rpc-url $SEPOLIA_RPC_URL \
            --private-key $PRIVATE_KEY \
            --verify \
            --etherscan-api-key $ETHERSCAN_API_KEY
        ;;
    2)
        echo ""
        echo "Setting up Hardhat..."
        echo ""
        if [ ! -f "hardhat.config.js" ]; then
            echo "Creating Hardhat config..."
            cat > hardhat.config.js << 'EOF'
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
EOF
        fi
        
        echo "Deploying..."
        npx hardhat run scripts/deploy.js --network sepolia
        ;;
    3)
        echo ""
        echo "Manual deployment with Remix:"
        echo "1. Go to https://remix.ethereum.org"
        echo "2. Create new file: PaymentReceiver.sol"
        echo "3. Copy content from contracts/PaymentReceiver.sol"
        echo "4. Compile with Solidity 0.8.20"
        echo "5. Deploy to Sepolia"
        echo "6. Copy contract address to .env as SEPOLIA_CONTRACT"
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Copy contract address to .env: SEPOLIA_CONTRACT=0x..."
echo "2. Configure relayer: npm run config"
echo "3. Start relayer: npm start"


