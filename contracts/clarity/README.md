# Clarity Smart Contracts

## Contracts

### agent-registry.clar
Manages agent registration, payment addresses, and settings.

**Functions**:
- `register-agent` - Register a new agent
- `get-agent` - Get agent details
- `set-payment-address` - Set payment address for a chain
- `get-payment-address` - Get payment address for a chain
- `update-agent-settings` - Update agent settings
- `record-payment` - Record a payment (contract-only)

### yield-vault.clar
Manages USDh deposits, yield calculations, and withdrawals.

**Functions**:
- `deposit-to-vault` - Deposit USDh to vault
- `get-balance` - Get agent balance with accrued yield
- `withdraw-from-vault` - Withdraw USDh from vault
- `get-vault-total` - Get total vault statistics

## Testing

### Prerequisites
```bash
# Install Clarinet
curl -L https://github.com/hirosystems/clarinet/releases/latest/download/clarinet-x86_64-linux.tar.gz | tar -xz
sudo mv clarinet /usr/local/bin/
```

### Run Tests
```bash
cd contracts/clarity
clarinet test
```

### Test Coverage
- ✅ Agent registration
- ✅ Duplicate registration prevention
- ✅ Get agent details
- ✅ Set/get payment addresses
- ✅ Update agent settings
- ✅ Balance queries
- ✅ Withdrawal validation

## Deployment

### Testnet
```bash
./scripts/deploy/deploy-contracts.sh testnet
```

### Mainnet
```bash
./scripts/deploy/deploy-contracts.sh mainnet
```

## Dependencies

- `hermetica-usdh` - USDh token contract (must be deployed first)

## Security Notes

- Contracts use standard Clarity security patterns
- All public functions validate caller permissions
- Yield calculations use block-height for time-based calculations
- Recommended: Get security audit before mainnet deployment
