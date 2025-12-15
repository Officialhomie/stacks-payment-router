;; USDh Token Contract (SIP-010 Compliant)
;; Mock implementation for testing - in production use Hermetica's USDh

;; Note: For Clarinet testing, we'll implement the trait interface manually
;; In production with real SIP-010 trait deployed, use:
;; (impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
;; For now, we implement all required functions without trait binding

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-INSUFFICIENT-BALANCE (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-CONTRACT-NOT-INITIALIZED (err u103))
(define-constant ERR-ALREADY-PROCESSED (err u104))

;; Token metadata
(define-constant TOKEN-NAME "USDh")
(define-constant TOKEN-SYMBOL "USDh")
(define-constant TOKEN-DECIMALS u6)
(define-constant TOKEN-URI (some u"https://hermetica.fi/usdh"))

;; Define the fungible token (required for as-contract? with-ft)
(define-fungible-token usdh)

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Contract owner (initialized on first call)
(define-data-var contract-owner (optional principal) none)

;; Contract initialization flag
(define-data-var is-initialized bool false)

(define-data-var total-supply uint u0)

;; ============================================
;; DATA MAPS
;; ============================================

(define-map balances
  { account: principal }
  { balance: uint }
)

(define-map allowances
  { owner: principal, spender: principal }
  { amount: uint }
)

;; Authorized minters (for testing)
(define-map authorized-minters
  { minter: principal }
  { enabled: bool }
)

;; ============================================
;; SIP-010 FUNCTIONS
;; ============================================

;; Transfer tokens
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)

    (let (
      (sender-balance (get-balance-uint sender))
    )
      (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)

      ;; Update balances
      (map-set balances { account: sender } { balance: (- sender-balance amount) })
      (map-set balances { account: recipient } { balance: (+ (get-balance-uint recipient) amount) })

      ;; Print event
      (print {
        event: "transfer",
        sender: sender,
        recipient: recipient,
        amount: amount
      })

      ;; Print memo if provided
      (match memo
        memo-buff (begin (print memo-buff) true)
        true
      )

      (ok true)
    )
  )
)

;; Transfer from (using allowance)
(define-public (transfer-from (amount uint) (owner principal) (recipient principal))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)

    (let (
      (owner-balance (get-balance-uint owner))
      (spender-allowance (get-allowance-uint owner tx-sender))
    )
      (asserts! (>= owner-balance amount) ERR-INSUFFICIENT-BALANCE)
      (asserts! (>= spender-allowance amount) ERR-NOT-AUTHORIZED)

      ;; Update balances
      (map-set balances { account: owner } { balance: (- owner-balance amount) })
      (map-set balances { account: recipient } { balance: (+ (get-balance-uint recipient) amount) })

      ;; Update allowance
      (map-set allowances { owner: owner, spender: tx-sender } { amount: (- spender-allowance amount) })

      ;; Print event
      (print {
        event: "transfer-from",
        owner: owner,
        spender: tx-sender,
        recipient: recipient,
        amount: amount
      })

      (ok true)
    )
  )
)

;; ============================================
;; AUTHORIZED CONTRACT TRANSFERS
;; ============================================

;; Map of authorized contracts that can transfer tokens on behalf of accounts
(define-map authorized-contracts
  { contract: principal }
  { enabled: bool }
)

;; Add authorized contract (owner only)
(define-public (add-authorized-contract (contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-contracts { contract: contract } { enabled: true })
    (print { event: "authorized-contract-added", contract: contract })
    (ok true)
  )
)

;; Remove authorized contract (owner only)
(define-public (remove-authorized-contract (contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-delete authorized-contracts { contract: contract })
    (print { event: "authorized-contract-removed", contract: contract })
    (ok true)
  )
)

;; Check if contract is authorized
(define-read-only (is-authorized-contract (contract principal))
  (default-to false (get enabled (map-get? authorized-contracts { contract: contract })))
)

;; Transfer by authorized contract (e.g., yield-vault transferring its own tokens)
;; The contract-caller must be an authorized contract
;; The sender must be the contract-caller itself (contracts can only transfer their own tokens)
(define-public (contract-transfer (amount uint) (recipient principal))
  (let (
    (sender contract-caller)
  )
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (is-authorized-contract sender) ERR-NOT-AUTHORIZED)
    
    (let ((sender-balance (get-balance-uint sender)))
      (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)
      
      ;; Update balances
      (map-set balances { account: sender } { balance: (- sender-balance amount) })
      (map-set balances { account: recipient } { balance: (+ (get-balance-uint recipient) amount) })
      
      ;; Print event
      (print {
        event: "contract-transfer",
        sender: sender,
        recipient: recipient,
        amount: amount
      })
      
      (ok true)
    )
  )
)

;; Get token name
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

;; Get token symbol
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

;; Get decimals
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

;; Get balance
(define-read-only (get-balance (account principal))
  (ok (get-balance-uint account))
)

;; Get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Get token URI
(define-read-only (get-token-uri)
  (ok TOKEN-URI)
)

;; Get allowance
(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (get-allowance-uint owner spender))
)

;; Approve spender to spend tokens
(define-public (approve (spender principal) (amount uint))
  (begin
    (map-set allowances { owner: tx-sender, spender: spender } { amount: amount })
    (print { event: "approve", owner: tx-sender, spender: spender, amount: amount })
    (ok true)
  )
)

;; Increase allowance
(define-public (increase-allowance (spender principal) (amount uint))
  (let ((current-allowance (get-allowance-uint tx-sender spender)))
    (map-set allowances { owner: tx-sender, spender: spender } { amount: (+ current-allowance amount) })
    (print { event: "increase-allowance", owner: tx-sender, spender: spender, amount: amount })
    (ok true)
  )
)

;; Decrease allowance
(define-public (decrease-allowance (spender principal) (amount uint))
  (let ((current-allowance (get-allowance-uint tx-sender spender)))
    (asserts! (>= current-allowance amount) ERR-INSUFFICIENT-BALANCE)
    (map-set allowances { owner: tx-sender, spender: spender } { amount: (- current-allowance amount) })
    (print { event: "decrease-allowance", owner: tx-sender, spender: spender, amount: amount })
    (ok true)
  )
)

;; Transfer many (batch transfer for efficiency)
(define-public (transfer-many (transfers (list 200 { to: principal, amount: uint, memo: (optional (buff 34)) })))
  (begin
    (fold transfer-many-iter transfers (ok true))
  )
)

(define-private (transfer-many-iter
  (transfer-data { to: principal, amount: uint, memo: (optional (buff 34)) })
  (previous-response (response bool uint)))
  (match previous-response
    success (transfer (get amount transfer-data) tx-sender (get to transfer-data) (get memo transfer-data))
    error (err error)
  )
)

;; ============================================
;; HELPER FUNCTIONS
;; ============================================

(define-private (get-balance-uint (account principal))
  (default-to u0 (get balance (map-get? balances { account: account })))
)

(define-private (get-allowance-uint (owner principal) (spender principal))
  (default-to u0 (get amount (map-get? allowances { owner: owner, spender: spender })))
)

;; ============================================
;; MINTING FUNCTIONS (For Testing)
;; ============================================

;; Check if caller is contract owner
(define-private (is-owner)
  (match (var-get contract-owner)
    owner (is-eq tx-sender owner)
    false
  )
)

;; Mint tokens (owner only)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (or (is-owner) (is-authorized-minter tx-sender)) ERR-NOT-AUTHORIZED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    
    (map-set balances { account: recipient } { balance: (+ (get-balance-uint recipient) amount) })
    (var-set total-supply (+ (var-get total-supply) amount))
    
    (ok true)
  )
)

;; Burn tokens
(define-public (burn (amount uint))
  (let (
    (sender tx-sender)
    (sender-balance (get-balance-uint sender))
  )
    (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-BALANCE)
    
    (map-set balances { account: sender } { balance: (- sender-balance amount) })
    (var-set total-supply (- (var-get total-supply) amount))
    
    (ok true)
  )
)

;; Check if minter is authorized
(define-private (is-authorized-minter (minter principal))
  (default-to false (get enabled (map-get? authorized-minters { minter: minter })))
)

;; Add authorized minter (owner only)
(define-public (add-minter (minter principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-minters { minter: minter } { enabled: true })
    (print {
      event: "minter-added",
      minter: minter,
      added-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Remove authorized minter (owner only)
(define-public (remove-minter (minter principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-delete authorized-minters { minter: minter })
    (print {
      event: "minter-removed",
      minter: minter,
      removed-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; ============================================
;; INITIALIZATION FUNCTIONS
;; ============================================

;; Initialize contract (sets owner on first call)
(define-public (initialize-contract)
  (begin
    (asserts! (not (var-get is-initialized)) ERR-ALREADY-PROCESSED)
    (var-set contract-owner (some tx-sender))
    (var-set is-initialized true)
    (print {
      event: "contract-initialized",
      owner: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Transfer ownership
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set contract-owner (some new-owner))
    (print {
      event: "ownership-transferred",
      previous-owner: tx-sender,
      new-owner: new-owner,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)


