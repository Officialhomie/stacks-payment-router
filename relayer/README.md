# Payment Relayer: Sepolia ETH → Stacks USDh

## 🎯 What This Does

This relayer service bridges payments from Ethereum Sepolia to Stacks:

```
User sends ETH on Sepolia → Relayer detects → Mints USDh on Stacks → Credits agent
```

## 🔑 How Conversion Works

**Short Answer:** ETH doesn't convert directly. The relayer:
1. Gets ETH/USD price from Chainlink
2. Calculates USD value of ETH received
3. Mints equivalent USDh on Stacks
4. Deposits to agent's vault

**See [CONVERSION-EXPLAINED.md](./CONVERSION-EXPLAINED.md) for details.**

## 📁 Project Structure

```
relayer/
├── contracts/
│   └── PaymentReceiver.sol      # Sepolia contract (receives ETH)
├── src/
│   └── payment-relayer.js        # Relayer service (watches & processes)
├── CONVERSION-EXPLAINED.md       # Detailed conversion explanation
├── package.json
└── README.md
```

## 🚀 Setup

### 1. Install Dependencies

```bash
cd relayer
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
# Sepolia RPC (Infura, Alchemy, etc.)
SEPOLIA_RPC=https://sepolia.infura.io/v3/YOUR_KEY

# Sepolia contract address (deploy PaymentReceiver.sol first)
SEPOLIA_CONTRACT=0x...

# Relayer mnemonic (needs minting permissions on token-usdh-v2)
RELAYER_MNEMONIC="your twelve word mnemonic here..."
```

### 3. Deploy Sepolia Contract

```bash
# Using Hardhat/Foundry/Remix
# Deploy PaymentReceiver.sol to Sepolia
# Save the contract address to .env
```

### 4. Grant Minting Permissions

The relayer address needs to be added as a minter on `token-usdh-v2`:

```bash
# Call on Stacks:
# token-usdh-v2.add-minter(relayer-address)
```

### 5. Start Relayer

```bash
npm start
```

## 🔄 How It Works

### Step-by-Step Flow

```
1. User sends ETH
   └─→ Calls PaymentReceiver.pay(stacksAgent) on Sepolia
   └─→ Contract emits PaymentInitiated event

2. Relayer detects event
   └─→ Listens for PaymentInitiated events
   └─→ Extracts: amount, sender, stacksAgent

3. Relayer gets price
   └─→ Queries Chainlink ETH/USD price feed
   └─→ Calculates: ETH amount × price = USD value

4. Relayer mints USDh
   └─→ Calls token-usdh-v2.mint(usdhAmount, vault)
   └─→ Creates new USDh tokens

5. Relayer settles
   └─→ Calls payment-router-v2.complete-settlement()
   └─→ Credits agent's balance in vault
```

## 📊 Example

```
User sends: 0.001 ETH
Chainlink price: $3,000/ETH
USD value: $3
USDh minted: 3,000,000 (3 USDh with 6 decimals)
Agent receives: 3 USDh in vault
```

## 🔐 Security Notes

- **Minting Permissions**: Relayer must have minting rights
- **Price Oracle**: Uses Chainlink for accurate pricing
- **Trust Model**: Currently centralized (relayer is trusted)
- **Production**: Consider multi-sig or DAO governance

## 🧪 Testing

```bash
# Test relayer functions
npm test

# Or manually test:
node -e "import('./src/payment-relayer.js').then(m => m.getETHPrice().then(console.log))"
```

## 📝 Next Steps

1. Deploy PaymentReceiver.sol to Sepolia
2. Configure .env with contract address
3. Grant minting permissions to relayer
4. Start relayer service
5. Send test ETH payment

## 🐛 Troubleshooting

**"Minting failed"**
- Check relayer has minting permissions
- Verify relayer address is correct

**"Price fetch failed"**
- Check Chainlink contract address
- Verify Sepolia RPC is working

**"Event not detected"**
- Verify contract address in .env
- Check Sepolia RPC connection
- Ensure contract is deployed


