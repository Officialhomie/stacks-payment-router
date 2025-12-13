;; Initialize all contracts on testnet
;; Run with: clarinet console --testnet

;; Initialize token-usdh
(contract-call? .token-usdh initialize-contract)

;; Initialize agent-registry
(contract-call? .agent-registry initialize-contract)

;; Initialize yield-vault
(contract-call? .yield-vault initialize-contract)

;; Initialize payment-router
(contract-call? .payment-router initialize-contract)

;; Add payment-router as operator to agent-registry
(contract-call? .agent-registry add-operator .payment-router "router")

;; Add payment-router as operator to yield-vault
(contract-call? .yield-vault add-operator .payment-router)

;; Mint test USDh (10,000 USDh to deployer for testing)
(contract-call? .token-usdh mint u10000000000 tx-sender)
