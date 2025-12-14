# Manual Settlement Tools - Guide

## 📋 Overview

These tools allow admins to manually settle payments that have been detected on Ethereum.

### Settlement Flow:
```
1. Customer sends ETH → Detected by PaymentDetector
2. Payment marked as "detected" on Stacks
3. Admin uses these tools to settle
4. USDh deposited to agent's vault (or auto-withdrawn)
5. Payment marked as "settled"
```

---

## 🛠️ Tools Available

### 1. Interactive CLI (`settle-payments.ts`)
Full-featured interactive tool with menu system.

**Use when**: You want to browse, review, and settle payments manually

**Features**:
- View payment details
- Settle regular or auto-withdraw
- Mint test USDh
- Check vault balances
- Wait for confirmations

### 2. Quick Settle (`quick-settle.ts`)
Fast command-line settlement for single payments.

**Use when**: You know the intent ID and want to settle quickly

**Features**:
- Single command settlement
- Automatic confirmation waiting
- Auto-withdraw support

---

## 🚀 Quick Start

### Prerequisites

1. **Environment variables set** (in `.env.local`):
   ```bash
   STACKS_SETTLEMENT_WALLET_PRIVATE_KEY=your_key
   PAYMENT_ROUTER_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.payment-router
   USDH_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-usdh
   YIELD_VAULT_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.yield-vault
   ```

2. **Testnet STX for gas** (you should have from deployment)

3. **TypeScript installed**:
   ```bash
   npm install -g ts-node typescript
   ```

---

## 📖 Usage Examples

### Using Interactive CLI

```bash
cd /Users/mac/stacks-payment-router
ts-node scripts/settlement/settle-payments.ts
```

**Menu**:
```
💰  PAYMENT SETTLEMENT CLI - MVP
Network: testnet
================================================================

📋 Main Menu:
1. View payment intent
2. Settle payment (regular)
3. Settle payment (with auto-withdraw)
4. Mint test USDh
5. Check vault balance
6. Exit

Select option (1-6):
```

**Example Session**:
```
Select option: 1
Enter payment intent ID: test-payment-001

📄 Payment Intent Details
────────────────────────────────────────────────────────────
Intent ID:       test-payment-001
Status:          detected
Agent:           ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
Source Chain:    ethereum
Expected USDh:   2.00 USDh
Net Amount:      1.99 USDh
Fees Paid:       0.01 USDh
Payment Address: 0x742d35...
Source TX:       0xabc123...
────────────────────────────────────────────────────────────

Select option: 2

📄 Payment to Settle
────────────────────────────────────────────────────────────
Intent ID:     test-payment-001
Status:        detected
Agent:         ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
Amount:        2.00 USDh
Net to Agent:  1.99 USDh
Fees:          0.01 USDh
────────────────────────────────────────────────────────────

⚠️  You are about to settle this payment (regular)
Type "SETTLE" to confirm: SETTLE

📝 Completing settlement for test-payment-001...
✅ Settlement transaction broadcast: 0xdef456...

View on explorer: https://explorer.hiro.so/txid/0xdef456...?chain=testnet

Wait for confirmation? (y/n): y

⏳ Waiting for confirmation...
.......
✅ Transaction confirmed!

🎉 Settlement complete!
```

---

### Using Quick Settle

**Settle regular payment**:
```bash
ts-node scripts/settlement/quick-settle.ts test-payment-001
```

**Settle with auto-withdraw**:
```bash
ts-node scripts/settlement/quick-settle.ts test-payment-002 --auto-withdraw
```

**Example Output**:
```
🚀 Quick Settlement Tool

Intent ID: test-payment-001
Mode: Regular

📋 Fetching payment intent...

Payment Details:
  Status:     detected
  Agent:      ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
  Amount:     2.00 USDh
  Net Amount: 1.99 USDh
  Fees:       0.01 USDh

💰 Settling payment...

✅ Settlement transaction broadcast!
   TX ID: 0xabc123...
   Explorer: https://explorer.hiro.so/txid/0xabc123...?chain=testnet

⏳ Waiting for confirmation...
..........
✅ Transaction confirmed!

🎉 Settlement complete!
   1.99 USDh sent to agent
```

---

## 💰 Settlement Types

### Regular Settlement (Default)

Deposits USDh to agent's yield vault.

**When to use**:
- Agent has auto-withdraw disabled
- Agent wants to earn yield on deposits
- Default for most payments

**What happens**:
1. USDh deposited to yield-vault
2. Agent earns yield (configured APY)
3. Agent can withdraw later with time-lock

**Command**:
```bash
# Interactive
Menu option 2

# Quick
ts-node quick-settle.ts <intent-id>
```

---

### Auto-Withdraw Settlement

Deposits then immediately withdraws USDh to agent.

**When to use**:
- Agent has auto-withdraw enabled
- Agent needs instant access to funds
- Higher fees (instant withdrawal fee)

**What happens**:
1. USDh deposited to vault
2. Instantly withdrawn to agent's wallet
3. Agent gets USDh immediately (minus fees)

**Command**:
```bash
# Interactive
Menu option 3

# Quick
ts-node quick-settle.ts <intent-id> --auto-withdraw
```

---

## 🧪 Testing Features

### Mint Test USDh

For testing on testnet, you can mint USDh tokens.

**Interactive CLI**:
```
Select option: 4
Enter amount to mint: 10000
Enter recipient address: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM

Minting 10000.00 USDh to ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
Confirm? (y/n): y

💰 Minting 10000 USDh...
✅ Mint transaction broadcast: 0x...
```

**Use cases**:
- Testing settlement without real USDh
- Topping up admin wallet
- Funding test agents

---

### Check Vault Balance

View agent's vault balance and yield.

**Interactive CLI**:
```
Select option: 5
Enter agent address: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM

🔍 Fetching vault balance...

💰 Vault Balance
────────────────────────────────────────────────────────────
Agent:            ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
Principal:        100.00 USDh
Accrued Yield:    2.50 USDh
Total:            102.50 USDh
Total Earned:     5.00 USDh
────────────────────────────────────────────────────────────
```

---

## 🔧 Advanced Usage

### Batch Settlements

Create a script to settle multiple payments:

```bash
#!/bin/bash
# settle-batch.sh

INTENTS=(
  "payment-001"
  "payment-002"
  "payment-003"
)

for intent in "${INTENTS[@]}"; do
  echo "Settling $intent..."
  ts-node scripts/settlement/quick-settle.ts "$intent"
  sleep 5
done
```

Run:
```bash
chmod +x settle-batch.sh
./settle-batch.sh
```

---

### Monitoring Settlements

Check settlement status:

```bash
# View on Stacks Explorer
open "https://explorer.hiro.so/txid/YOUR_TX_ID?chain=testnet"

# Or query via API
curl "https://api.testnet.hiro.so/extended/v1/tx/YOUR_TX_ID"
```

---

## ⚠️ Important Notes

### For MVP:

1. **Manual Process**: Settlement is manual - admin must run these scripts
2. **Off-Chain USDh**: For MVP, we assume USDh conversion happens off-chain
3. **Testing Only**: Use testnet first, verify everything works
4. **Gas Fees**: Each settlement costs testnet STX (small amount)

### For Production:

1. **Automate**: Build service to settle automatically
2. **Real USDh**: Integrate with real USDh swaps/transfers
3. **Monitoring**: Add alerts for failed settlements
4. **Database**: Track settlements in database
5. **Webhooks**: Notify agents when settled

---

## 📊 Settlement Workflow

### Complete Flow:

```
1. Payment Detected
   └─> Status: "pending" → "detected"

2. Admin Reviews
   └─> Use CLI to view payment details
   └─> Verify amounts, agent, etc.

3. Admin Settles
   └─> Choose regular or auto-withdraw
   └─> Confirm settlement

4. Transaction Broadcast
   └─> Stacks transaction submitted
   └─> Wait for confirmation (~10 min)

5. Settlement Complete
   └─> Status: "detected" → "settled"
   └─> USDh in agent's vault (or wallet)
   └─> Payment flow complete ✅
```

---

## 🐛 Troubleshooting

### Error: "Missing environment variables"

**Solution**: Check `.env.local` has all required variables

### Error: "Payment intent not found"

**Solutions**:
- Verify intent ID is correct
- Check payment was created on Stacks
- Use explorer to verify contract state

### Error: "Transaction failed"

**Possible causes**:
- Insufficient STX for gas
- Payment already settled
- Invalid payment status

**Solutions**:
- Check STX balance
- View payment status first
- Check explorer for error details

### Settlement stays "pending"

**Solutions**:
- Wait 10-15 minutes for confirmation
- Check Stacks network status
- Verify transaction on explorer
- May need to re-broadcast

---

## 📈 Metrics to Track

When settling payments, track:

- Total settlements per day
- Average settlement time
- Failed settlement rate
- Total volume settled
- Fees collected

Example tracking script:

```bash
# Count settlements today
curl "https://api.testnet.hiro.so/extended/v1/address/ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM/transactions" \
  | jq '[.results[] | select(.contract_call.function_name == "complete-settlement")] | length'
```

---

## 🎯 Next Steps

After getting familiar with these tools:

1. **Week 1, Day 5**: Test complete end-to-end flow
2. **Week 2**: Build frontend admin panel
3. **Month 2**: Automate settlement process
4. **Production**: Remove manual settlement entirely

---

## 💡 Pro Tips

1. **Keep logs**: Save terminal output for each settlement
2. **Test small first**: Settle small amounts before large ones
3. **Verify on explorer**: Always check transactions on explorer
4. **Track intent IDs**: Keep spreadsheet of payments
5. **Batch at quiet times**: Settle multiple payments during low traffic

---

*For questions or issues, check WEEK1-DAY1-STATUS.md or MVP-PROGRESS.md*
