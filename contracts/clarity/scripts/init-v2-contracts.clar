;; Initialize all v2 contracts on testnet
;; Run with: clarinet console --testnet
;; Then paste these commands one by one

;; ========================================
;; STEP 1: Initialize all contracts
;; ========================================

;; Initialize token-usdh-v2
(contract-call? .token-usdh-v2 initialize-contract)

;; Initialize agent-registry-v2
(contract-call? .agent-registry-v2 initialize-contract)

;; Initialize yield-vault-v2 (pass vault's own address)
(contract-call? .yield-vault-v2 initialize-contract 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.yield-vault-v2)

;; Initialize payment-router-v2
(contract-call? .payment-router-v2 initialize-contract)

;; ========================================
;; STEP 2: Authorize yield-vault to use contract-transfer
;; ========================================

;; Add yield-vault-v2 as authorized contract for token transfers
(contract-call? .token-usdh-v2 add-authorized-contract 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.yield-vault-v2)

;; ========================================
;; STEP 3: Configure payment-router with dependencies
;; ========================================

;; Set agent-registry contract in payment-router
(contract-call? .payment-router-v2 set-agent-registry-contract 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.agent-registry-v2)

;; Set yield-vault contract in payment-router
(contract-call? .payment-router-v2 set-yield-vault-contract 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.yield-vault-v2)

;; ========================================
;; STEP 4: Add operators
;; ========================================

;; Add payment-router as operator to agent-registry
(contract-call? .agent-registry-v2 add-operator 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.payment-router-v2 "router")

;; Add payment-router as operator to yield-vault
(contract-call? .yield-vault-v2 add-operator 'ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K.payment-router-v2)

;; ========================================
;; STEP 5: Mint test USDh (optional)
;; ========================================

;; Mint 10,000 USDh to deployer for testing
(contract-call? .token-usdh-v2 mint u10000000000 tx-sender)

