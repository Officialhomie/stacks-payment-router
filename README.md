# Stacks Payment Router 💳

> **Accept payments from any blockchain. Settle in USDh. Built for AI agents and applications.**

The Stacks Payment Router enables you to accept cryptocurrency payments from Ethereum, Arbitrum, Base, Polygon, and other chains, automatically converting them to USDh (yield-bearing stablecoin) on Stacks. Perfect for AI agents, SaaS applications, and any service that needs cross-chain payment acceptance.

---

## 🌟 What Is This?

**Stacks Payment Router** is a cross-chain payment system that:

- ✅ **Accepts payments** from multiple blockchains (Ethereum, Arbitrum, Base, Polygon, Optimism, Stacks, Solana, Bitcoin)
- ✅ **Automatically converts** all payments to USDh stablecoin on Stacks
- ✅ **Earns yield** on your deposits (20% APY)
- ✅ **Generates unique addresses** for each payment (one Stacks address → addresses on all chains)
- ✅ **Detects payments** automatically and settles them within minutes
- ✅ **Provides APIs** for easy integration into your application

---

## 🚀 Quick Start Guide

### For End Users (Accepting Payments)

#### Step 1: Register Your Agent

First, you need a Stacks wallet address. If you don't have one:

1. **Install Hiro Wallet**: https://www.hiro.so/wallet/install
2. **Create a new wallet** or import an existing one
3. **Copy your Stacks address** (starts with `ST1...` or `ST2...`)

#### Step 2: Register with Payment Router

**Option A: Using the Web Dashboard**

1. Visit: `https://payment-router.com/dashboard`
2. Click "Connect Wallet" and connect your Hiro Wallet
3. Your agent is automatically registered!

**Option B: Using the API**

```bash
curl -X POST https://api.payment-router.com/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "stacksAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "agentId": "my-agent-001",
    "enabledChains": ["ethereum", "arbitrum", "base"],
    "autoWithdraw": false
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "agent-001",
    "stacksAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "enabledChains": ["ethereum", "arbitrum", "base"],
    "paymentAddresses": {
      "ethereum": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "arbitrum": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "base": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    },
    "registeredAt": "2024-12-13T10:00:00Z"
  }
}
```

#### Step 3: Create a Payment Intent

When you want to accept a payment, create a payment intent:

```bash
curl -X POST https://api.payment-router.com/api/v1/payments/intent \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "amount": "100.00",
    "chain": "ethereum"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "intent-abc123",
    "agentAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "amount": "100.00",
    "expectedAmount": "0.05",
    "chain": "ethereum",
    "paymentAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "status": "pending",
    "expiresAt": "2024-12-14T10:00:00Z",
    "paymentUrl": "https://payment-router.com/pay/intent-abc123"
  }
}
```

#### Step 4: Share Payment Link

Share the `paymentUrl` with your customer. They can:
- Scan QR code with their wallet
- Copy the payment address
- Send the exact amount in the specified token

#### Step 5: Payment is Automatically Detected & Settled

- ✅ Payment is detected within ~15 seconds
- ✅ Automatically converted to USDh
- ✅ Deposited to your yield vault
- ✅ You earn 20% APY automatically

---

## 📱 Using the Web Dashboard

### Dashboard Features

**1. Payment Management**
- View all payment intents
- See payment status in real-time
- Track settlement history

**2. Vault Management**
- View your USDh balance
- See accrued yield
- Withdraw funds (with optional delay for security)

**3. Agent Settings**
- Configure supported chains
- Set payment limits
- Enable auto-withdraw (instant settlement with fee)
- Manage webhooks

**4. Analytics**
- Payment volume charts
- Success rates
- Revenue tracking

### Accessing the Dashboard

1. **Visit**: `https://payment-router.com/dashboard`
2. **Connect Wallet**: Click "Connect Wallet" → Select Hiro Wallet
3. **Authorize**: Approve the connection
4. **Start Accepting Payments**: Create your first payment intent!

---

## 🔌 API Integration Guide

### Base URL

```
Production: https://api.payment-router.com/api/v1
Testnet:    https://api-testnet.payment-router.com/api/v1
```

### Authentication

Most endpoints don't require authentication. For admin operations, use API keys:

```bash
X-API-Key: your-api-key-here
```

### Core API Endpoints

#### 1. Register Agent

Register your Stacks address to start accepting payments.

```http
POST /api/v1/agents/register
Content-Type: application/json

{
  "stacksAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
  "agentId": "my-unique-agent-id",
  "enabledChains": ["ethereum", "arbitrum", "base"],
  "autoWithdraw": false,
  "settlementPreference": "usdh"
}
```

**Parameters:**
- `stacksAddress` (required): Your Stacks wallet address
- `agentId` (required): Unique identifier for your agent (max 64 chars)
- `enabledChains` (required): Array of chains you want to accept payments on
- `autoWithdraw` (optional): If `true`, funds are instantly withdrawn (with fee). Default: `false`
- `settlementPreference` (optional): `"usdh"` or `"stx"`. Default: `"usdh"`

**Supported Chains:**
- `ethereum` - Ethereum Mainnet
- `arbitrum` - Arbitrum One
- `base` - Base
- `polygon` - Polygon
- `optimism` - Optimism
- `stacks` - Stacks
- `solana` - Solana
- `bitcoin` - Bitcoin

#### 2. Create Payment Intent

Create a payment request and get a unique payment address.

```http
POST /api/v1/payments/intent
Content-Type: application/json

{
  "agentAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
  "amount": "100.00",
  "chain": "ethereum",
  "metadata": {
    "orderId": "order-123",
    "customerEmail": "customer@example.com"
  }
}
```

**Parameters:**
- `agentAddress` (required): Your registered Stacks address
- `amount` (required): Payment amount in USD
- `chain` (required): Blockchain to accept payment on
- `metadata` (optional): Custom data attached to payment

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "intent-abc123",
    "agentAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "amount": "100.00",
    "expectedAmount": "0.05",
    "expectedToken": "ETH",
    "chain": "ethereum",
    "paymentAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "status": "pending",
    "createdAt": "2024-12-13T10:00:00Z",
    "expiresAt": "2024-12-14T10:00:00Z",
    "paymentUrl": "https://payment-router.com/pay/intent-abc123"
  }
}
```

#### 3. Get Payment Status

Check the status of a payment intent.

```http
GET /api/v1/payments/intent/{intentId}/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "settled",
    "detectedAt": "2024-12-13T10:05:00Z",
    "settledAt": "2024-12-13T10:06:00Z",
    "txHash": "0x123...",
    "settlementTxHash": "0x456...",
    "netAmount": "99.50",
    "feesPaid": "0.50"
  }
}
```

**Payment Statuses:**
- `pending` - Waiting for payment
- `detected` - Payment detected, routing in progress
- `settled` - Payment converted to USDh and deposited
- `expired` - Payment expired (default: 24 hours)
- `failed` - Payment failed (insufficient amount, etc.)

#### 4. Get Agent Balance

Check your USDh balance in the yield vault.

```http
GET /api/v1/agents/{agentAddress}/balance
```

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": "1250.50",
    "principal": "1000.00",
    "accruedYield": "250.50",
    "totalYieldEarned": "500.00",
    "lastYieldClaim": "2024-12-13T09:00:00Z"
  }
}
```

#### 5. Get Agent Details

Get your agent registration information.

```http
GET /api/v1/agents/{agentAddress}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "address": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "agentId": "my-agent-001",
    "enabledChains": ["ethereum", "arbitrum", "base"],
    "paymentAddresses": {
      "ethereum": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "arbitrum": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
      "base": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    },
    "autoWithdraw": false,
    "settlementPreference": "usdh",
    "totalVolume": "50000.00",
    "totalPayments": 150,
    "registeredAt": "2024-12-01T00:00:00Z"
  }
}
```

---

## 🔗 Integrating with Stacks

### Understanding Stacks Integration

The Payment Router is built on **Stacks blockchain** and uses **Clarity smart contracts**:

1. **Agent Registry Contract**: Manages agent registration and payment tracking
2. **Payment Router Contract**: Orchestrates payment intents and settlement
3. **Yield Vault Contract**: Manages USDh deposits and yield accrual

### Your Stacks Address

Your Stacks address is your identity in the system:
- Format: `ST1...` or `ST2...` (mainnet) or `ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K` (testnet)
- Used to: Register as an agent, receive settlements, manage vault

### Contract Addresses (Testnet)

```
Agent Registry:  ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.agent-registry
Payment Router:  ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.payment-router
Yield Vault:     ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.yield-vault
Token USDh:      ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.token-usdh
```

### Viewing Contracts on Explorer

- **Testnet Explorer**: https://explorer.hiro.so/?chain=testnet
- **Mainnet Explorer**: https://explorer.hiro.so/

Search for your contract address to see:
- Contract source code
- Function calls
- Transaction history
- Contract state

### Interacting with Contracts

**Using Hiro Wallet:**

1. Open Hiro Wallet extension
2. Go to "Contract Call" tab
3. Enter contract address (e.g., `ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.payment-router`)
4. Select function (e.g., `get-payment-intent`)
5. Enter parameters
6. Submit transaction

**Using Stacks.js:**

```javascript
import { callReadOnlyFunction } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

const network = new StacksTestnet();

// Read payment intent
const result = await callReadOnlyFunction({
  network,
  contractAddress: 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K',
  contractName: 'payment-router',
  functionName: 'get-payment-intent',
  functionArgs: [stringAsciiCV('intent-abc123')],
  senderAddress: 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K',
});
```

---

## 💰 Understanding Payments & Settlement

### Payment Flow

```
1. You create payment intent → Get unique payment address
2. Customer sends crypto to address → Payment detected (~15 seconds)
3. System routes payment → Swaps/bridges to USDh
4. Settlement executed → USDh deposited to your vault
5. You earn yield → 20% APY automatically
```

### Settlement Fees

- **Standard Settlement**: 0.5% fee (paid from payment amount)
- **Auto-Withdraw**: 0.5% settlement fee + 1% instant withdrawal fee

**Example:**
- Payment: $100 USD
- Settlement fee: $0.50
- Net deposited: $99.50 USDh
- After 1 year at 20% APY: ~$119.40 USDh

### Yield Vault

All payments are automatically deposited into the **Yield Vault**:

- **APY**: 20% (configurable by protocol)
- **Compounding**: Yield accrues continuously
- **Withdrawal**: Standard withdrawal (144 blocks delay) or instant (with fee)
- **Minimum Deposit**: 1 USDh
- **No Lockup**: Withdraw anytime

### Withdrawing Funds

**Standard Withdrawal (Recommended):**
1. Request withdrawal from dashboard or API
2. Wait 144 blocks (~24 hours) for security
3. Execute withdrawal (no fee)
4. Funds sent to your Stacks address

**Instant Withdrawal:**
1. Request instant withdrawal
2. Pay 1% fee
3. Funds sent immediately

---

## 📊 Complete Integration Example

### JavaScript/TypeScript Integration

```javascript
// Install: npm install @payment-router/api-client

import { ApiClient } from '@payment-router/api-client';

const api = new ApiClient({
  baseUrl: 'https://api.payment-router.com/api/v1'
});

// 1. Register agent (one-time)
const agent = await api.registerAgent({
  address: 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K',
  name: 'My AI Agent',
  enabledChains: ['ethereum', 'arbitrum'],
  autoWithdraw: false
});

// 2. Create payment intent
const payment = await api.createPaymentIntent({
  agentAddress: 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K',
  amount: '100.00',
  chain: 'ethereum',
  metadata: { orderId: 'order-123' }
});

// Share payment.paymentUrl with customer

// 3. Poll for payment status
const checkStatus = setInterval(async () => {
  const status = await api.getPaymentStatus(payment.id);
  
  if (status.data.status === 'settled') {
    console.log('Payment settled!', status.data);
    clearInterval(checkStatus);
  }
}, 5000); // Check every 5 seconds

// 4. Check balance
const balance = await api.getAgentBalance('ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K');
console.log('Your balance:', balance.data.balance, 'USDh');
```

### Python Integration

```python
import requests
import time

API_BASE = "https://api.payment-router.com/api/v1"

# 1. Register agent
response = requests.post(f"{API_BASE}/agents/register", json={
    "stacksAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "agentId": "my-python-agent",
    "enabledChains": ["ethereum", "arbitrum"]
})
agent = response.json()["data"]

# 2. Create payment intent
response = requests.post(f"{API_BASE}/payments/intent", json={
    "agentAddress": "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K",
    "amount": "100.00",
    "chain": "ethereum"
})
payment = response.json()["data"]

print(f"Payment URL: {payment['paymentUrl']}")

# 3. Poll for status
while True:
    response = requests.get(f"{API_BASE}/payments/intent/{payment['id']}/status")
    status = response.json()["data"]
    
    if status["status"] == "settled":
        print("Payment settled!")
        break
    
    time.sleep(5)
```

### Webhook Integration

Receive real-time notifications when payments are detected and settled:

```javascript
// Set webhook URL in agent settings
await api.updateAgent(agentAddress, {
  webhookUrl: 'https://your-app.com/webhooks/payment'
});

// Your webhook endpoint
app.post('/webhooks/payment', (req, res) => {
  const { type, data } = req.body;
  
  if (type === 'payment.detected') {
    console.log('Payment detected:', data.intentId);
  }
  
  if (type === 'payment.settled') {
    console.log('Payment settled:', data.intentId, data.netAmount);
  }
  
  res.json({ received: true });
});
```

---

## 🎯 Use Cases

### 1. AI Agent Payments

Accept payments for AI services (ChatGPT plugins, AI tools, etc.):

```javascript
// User requests AI service
const payment = await createPaymentIntent({
  agentAddress: YOUR_STACKS_ADDRESS,
  amount: '10.00',
  chain: 'ethereum'
});

// Show payment link to user
// After payment settles, provide AI service
```

### 2. SaaS Subscriptions

Accept monthly subscriptions from any chain:

```javascript
// Create monthly subscription payment
const subscription = await createPaymentIntent({
  agentAddress: YOUR_STACKS_ADDRESS,
  amount: '29.99',
  chain: 'arbitrum', // User's preferred chain
  metadata: { 
    subscriptionId: 'sub-123',
    plan: 'pro',
    period: 'monthly'
  }
});
```

### 3. E-commerce

Accept crypto payments for products:

```javascript
// Customer checkout
const order = await createPaymentIntent({
  agentAddress: YOUR_STACKS_ADDRESS,
  amount: orderTotal.toString(),
  chain: customerPreferredChain,
  metadata: {
    orderId: order.id,
    items: order.items
  }
});

// Redirect to payment page
window.location.href = order.paymentUrl;
```

### 4. Freelance/Service Payments

Accept payments for services:

```javascript
// Create invoice payment
const invoice = await createPaymentIntent({
  agentAddress: YOUR_STACKS_ADDRESS,
  amount: invoiceAmount.toString(),
  chain: 'ethereum',
  metadata: {
    invoiceId: invoice.id,
    clientId: client.id
  }
});
```

---

## 🔐 Security & Best Practices

### Security

- ✅ **Never share your Stacks private key** - Only your public address is needed
- ✅ **Use webhooks** - Don't poll excessively, use webhooks for real-time updates
- ✅ **Verify payments** - Always verify payment status before providing service
- ✅ **Set payment limits** - Configure min/max amounts in agent settings
- ✅ **Monitor transactions** - Check Stacks explorer regularly

### Best Practices

1. **Store Intent IDs**: Save payment intent IDs in your database
2. **Handle Expiry**: Payment intents expire after 24 hours (configurable)
3. **Error Handling**: Always handle API errors gracefully
4. **Rate Limiting**: API has rate limits (100 requests/minute)
5. **Webhooks**: Use webhooks instead of polling when possible

---

## 📈 Monitoring & Analytics

### Dashboard Analytics

Access your dashboard at `https://payment-router.com/dashboard` to see:

- **Total Volume**: All-time payment volume
- **Success Rate**: Percentage of successful payments
- **Average Amount**: Average payment size
- **Recent Payments**: Last 24 hours, 7 days, 30 days
- **Vault Stats**: Balance, yield earned, deposits, withdrawals

### API Analytics

```javascript
// Get payment statistics
const stats = await api.getPaymentStats(agentAddress);

console.log('Total payments:', stats.data.totalPayments);
console.log('Total volume:', stats.data.totalVolume);
console.log('Success rate:', stats.data.successRate + '%');
```

---

## 🆘 Support & Resources

### Documentation

- **API Reference**: https://docs.payment-router.com/api
- **Stacks Documentation**: https://docs.stacks.co
- **Clarity Language**: https://docs.stacks.co/learn/clarity

### Community

- **Discord**: [Join our Discord](https://discord.gg/stacks-payment-router)
- **GitHub**: https://github.com/Officialhomie/stacks-payment-router
- **Twitter**: @StacksPaymentRouter

### Support

- **Email**: support@payment-router.com
- **Status Page**: https://status.payment-router.com

---

## 🎓 Tutorial: Your First Payment

### Step-by-Step Tutorial

**1. Get a Stacks Wallet**
```
- Install Hiro Wallet: https://www.hiro.so/wallet/install
- Create new wallet
- Copy your Stacks address (ST1... or ST2...)
```

**2. Register Your Agent**
```bash
curl -X POST https://api.payment-router.com/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "stacksAddress": "YOUR_STACKS_ADDRESS",
    "agentId": "my-first-agent",
    "enabledChains": ["ethereum"]
  }'
```

**3. Create a Test Payment**
```bash
curl -X POST https://api.payment-router.com/api/v1/payments/intent \
  -H "Content-Type: application/json" \
  -d '{
    "agentAddress": "YOUR_STACKS_ADDRESS",
    "amount": "10.00",
    "chain": "ethereum"
  }'
```

**4. Share Payment Link**
```
Copy the "paymentUrl" from the response
Share it with a test customer
```

**5. Monitor Payment**
```bash
# Check status
curl https://api.payment-router.com/api/v1/payments/intent/{INTENT_ID}/status

# When status = "settled", payment is complete!
```

**6. Check Your Balance**
```bash
curl https://api.payment-router.com/api/v1/agents/YOUR_STACKS_ADDRESS/balance
```

---

## 🌐 Networks

### Testnet (For Testing)

- **API**: `https://api-testnet.payment-router.com`
- **Dashboard**: `https://testnet.payment-router.com`
- **Stacks Explorer**: https://explorer.hiro.so/?chain=testnet
- **Get Testnet STX**: https://explorer.hiro.so/sandbox/faucet?chain=testnet

### Mainnet (Production)

- **API**: `https://api.payment-router.com`
- **Dashboard**: `https://payment-router.com`
- **Stacks Explorer**: https://explorer.hiro.so

---

## 💡 Tips & Tricks

### Tip 1: Use Auto-Withdraw for Instant Access

Enable `autoWithdraw: true` when registering to get instant access to funds (with 1% fee):

```javascript
await api.registerAgent({
  address: YOUR_ADDRESS,
  autoWithdraw: true // Instant settlement
});
```

### Tip 2: Set Payment Limits

Configure min/max amounts to prevent errors:

```javascript
await api.updateAgent(YOUR_ADDRESS, {
  minPaymentAmount: '1.00',  // Minimum $1
  maxPaymentAmount: '10000.00' // Maximum $10,000
});
```

### Tip 3: Use Metadata for Tracking

Attach custom data to payments for your internal tracking:

```javascript
await api.createPaymentIntent({
  agentAddress: YOUR_ADDRESS,
  amount: '100.00',
  chain: 'ethereum',
  metadata: {
    orderId: 'order-123',
    customerId: 'cust-456',
    productId: 'prod-789'
  }
});
```

### Tip 4: Monitor Webhooks

Set up webhooks to get real-time notifications:

```javascript
// In your agent settings
webhookUrl: 'https://your-app.com/webhooks/payment'
```

---

## 📋 FAQ

**Q: What is USDh?**
A: USDh is a yield-bearing stablecoin on Stacks. All payments are converted to USDh and earn 20% APY automatically.

**Q: How long does settlement take?**
A: Payment detection: ~15 seconds. Settlement: 2-5 minutes depending on chain congestion.

**Q: What chains are supported?**
A: Ethereum, Arbitrum, Base, Polygon, Optimism, Stacks, Solana, Bitcoin.

**Q: What tokens can I accept?**
A: ETH, USDC, USDT, WETH, WBTC, SOL, STX, and more. All are automatically converted to USDh.

**Q: Is there a minimum payment amount?**
A: Yes, minimum is $1 USD equivalent. Maximum is configurable.

**Q: How do I withdraw my funds?**
A: Use the dashboard or API to request withdrawal. Standard withdrawal takes ~24 hours. Instant withdrawal (with fee) is immediate.

**Q: What are the fees?**
A: Settlement fee: 0.5%. Instant withdrawal fee: 1%. No fees for standard withdrawals.

**Q: Do I need to know blockchain programming?**
A: No! The API handles everything. Just use the REST API or web dashboard.

**Q: Is this secure?**
A: Yes! Built on Stacks blockchain with audited Clarity smart contracts. Your funds are secured by blockchain cryptography.

**Q: Can I use this for production?**
A: Yes! The system is production-ready. Start with testnet to familiarize yourself.

---

## 🚀 Ready to Start?

1. **Get a Stacks Wallet**: https://www.hiro.so/wallet/install
2. **Visit Dashboard**: https://payment-router.com/dashboard
3. **Connect Wallet**: Click "Connect Wallet"
4. **Create Payment**: Click "Create Payment Intent"
5. **Share Link**: Send payment URL to customer
6. **Get Paid**: Payment settles automatically!

---

## 📄 License

MIT License - Use freely for your projects!

---

**Built with ❤️ on Stacks blockchain**

*Last Updated: December 13, 2025*
