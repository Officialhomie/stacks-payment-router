;; Interactive Test Script for Clarinet Console
;; Run these commands in the clarinet console to verify functionality

;; Test 1: Initialize all contracts
(contract-call? .agent-registry initialize-contract)
(contract-call? .payment-router initialize-contract)
(contract-call? .yield-vault initialize-contract)
(contract-call? .token-usdh initialize-contract)

;; Test 2: Register an agent
(contract-call? .agent-registry register-agent
  "agent-001"
  (list "ethereum" "arbitrum")
  u1000000
  u5000000000
  false
  "usdh"
  none)

;; Test 3: Check agent was registered
(contract-call? .agent-registry get-agent tx-sender)

;; Test 4: Check protocol stats
(contract-call? .agent-registry get-protocol-stats)

;; Test 5: Authorize payment-router as operator
(contract-call? .agent-registry add-operator .payment-router "router")
(contract-call? .yield-vault add-operator .payment-router)

;; Test 6: Mint USDh to payment-router for settlements
(contract-call? .token-usdh mint u10000000 .payment-router)

;; Test 7: Create a payment intent
(contract-call? .payment-router create-payment-intent
  "intent-001"
  tx-sender
  "ethereum"
  "eth"
  u2000000
  u2000000
  u"0xabc123"
  none)

;; Test 8: Check payment intent
(contract-call? .payment-router get-payment-intent "intent-001")

;; Test 9: Check rate limit configuration
(contract-call? .agent-registry get-agent-rate-limit-config tx-sender)

;; Test 10: Check rate limit status
(contract-call? .agent-registry get-rate-limit-status tx-sender)

;; Test 11: Check vault stats
(contract-call? .yield-vault get-vault-stats)

;; Test 12: Check vault balance for agent
(contract-call? .yield-vault get-balance tx-sender)

;; Test 13: Check if vault is open
(contract-call? .yield-vault is-vault-open)

;; Test 14: Check current APY
(contract-call? .yield-vault get-current-apy)

;; Test 15: Set custom rate limits for agent (as owner)
(contract-call? .agent-registry set-agent-rate-limits
  tx-sender
  u50
  u500
  u100000000000)

;; Test 16: Verify rate limits were updated
(contract-call? .agent-registry get-agent-rate-limit-config tx-sender)
