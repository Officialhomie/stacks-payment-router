;; Payment Router Contract
;; Orchestrates cross-chain payment routing and settlement
;; Integrates with Agent Registry and Yield Vault

;; ============================================
;; CONSTANTS
;; ============================================

(define-constant ERR-NOT-AUTHORIZED (err u3000))
(define-constant ERR-INVALID-PAYMENT (err u3001))
(define-constant ERR-PAYMENT-NOT-FOUND (err u3002))
(define-constant ERR-ALREADY-PROCESSED (err u3003))
(define-constant ERR-EXPIRED (err u3004))
(define-constant ERR-INVALID-AMOUNT (err u3005))
(define-constant ERR-AGENT-NOT-FOUND (err u3006))
(define-constant ERR-SETTLEMENT-FAILED (err u3007))

;; Payment statuses
(define-constant STATUS-PENDING "pending")
(define-constant STATUS-DETECTED "detected")
(define-constant STATUS-ROUTING "routing")
(define-constant STATUS-EXECUTING "executing")
(define-constant STATUS-SETTLED "settled")
(define-constant STATUS-FAILED "failed")
(define-constant STATUS-EXPIRED "expired")

;; Default expiry (144 blocks ~= 24 hours on Stacks blockchain)
(define-constant DEFAULT-EXPIRY-BLOCKS u144)

;; Error codes for contract initialization
(define-constant ERR-CONTRACT-NOT-INITIALIZED (err u3008))

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Contract owner (initialized on first call)
(define-data-var contract-owner (optional principal) none)

;; Contract initialization flag
(define-data-var is-initialized bool false)

(define-data-var payment-counter uint u0)
(define-data-var total-settled-volume uint u0)
(define-data-var settlement-fee-bps uint u50) ;; 0.5%
(define-data-var is-paused bool false)

;; Contract references (configurable post-deployment)
(define-data-var agent-registry-contract (optional principal) none)
(define-data-var yield-vault-contract (optional principal) none)

;; ============================================
;; DATA MAPS
;; ============================================

;; Payment intents
(define-map payment-intents
  { intent-id: (string-ascii 64) }
  {
    payment-index: uint,
    agent: principal,
    source-chain: (string-ascii 20),
    source-token: (string-ascii 20),
    source-amount: uint,
    expected-usdh: uint,
    payment-address: (string-utf8 128),
    status: (string-ascii 20),
    created-at: uint,
    expires-at: uint,
    detected-at: (optional uint),
    settled-at: (optional uint),
    source-tx-hash: (optional (string-ascii 66)),
    settlement-tx-hash: (optional (string-ascii 66)),
    fees-paid: uint,
    net-amount: uint
  }
)

;; Payment by index for iteration
(define-map payment-by-index
  { index: uint }
  { intent-id: (string-ascii 64) }
)

;; Authorized relayers/operators
(define-map authorized-operators
  { operator: principal }
  { enabled: bool, role: (string-ascii 20), added-at: uint }
)

;; Reentrancy guard - tracks operations in progress
(define-map reentrancy-guard
  { intent-id: (string-ascii 64) }
  { locked: bool }
)

;; Route execution tracking
(define-map route-executions
  { intent-id: (string-ascii 64) }
  {
    route-type: (string-ascii 20),
    steps-completed: uint,
    total-steps: uint,
    gas-spent-usd: uint,
    started-at: uint,
    completed-at: (optional uint)
  }
)

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

(define-private (is-owner)
  (match (var-get contract-owner)
    owner (is-eq tx-sender owner)
    false
  )
)

(define-private (is-authorized-operator)
  (match (map-get? authorized-operators { operator: tx-sender })
    data (get enabled data)
    false
  )
)

(define-private (is-authorized)
  (or (is-owner) (is-authorized-operator))
)


;; Validate intent-id format (must be non-empty and valid length)
(define-private (is-valid-intent-id (intent-id (string-ascii 64)))
  (and
    (> (len intent-id) u0)
    (<= (len intent-id) u64)
  )
)

;; Validate payment address format (must be non-empty)
(define-private (is-valid-payment-address (address (string-utf8 128)))
  (and
    (> (len address) u0)
    (<= (len address) u128)
  )
)

;; Check if intent has reentrancy lock
(define-private (is-locked (intent-id (string-ascii 64)))
  (default-to false (get locked (map-get? reentrancy-guard { intent-id: intent-id })))
)

;; Acquire reentrancy lock
(define-private (acquire-lock (intent-id (string-ascii 64)))
  (begin
    (asserts! (not (is-locked intent-id)) ERR-ALREADY-PROCESSED)
    (map-set reentrancy-guard { intent-id: intent-id } { locked: true })
    (ok true)
  )
)

;; Release reentrancy lock
(define-private (release-lock (intent-id (string-ascii 64)))
  (begin
    (map-delete reentrancy-guard { intent-id: intent-id })
    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

(define-read-only (get-payment-intent (intent-id (string-ascii 64)))
  (map-get? payment-intents { intent-id: intent-id })
)

(define-read-only (get-payment-by-index (index uint))
  (match (map-get? payment-by-index { index: index })
    lookup (map-get? payment-intents { intent-id: (get intent-id lookup) })
    none
  )
)

(define-read-only (get-route-execution (intent-id (string-ascii 64)))
  (map-get? route-executions { intent-id: intent-id })
)

(define-read-only (get-protocol-stats)
  {
    total-payments: (var-get payment-counter),
    total-settled-volume: (var-get total-settled-volume),
    settlement-fee-bps: (var-get settlement-fee-bps),
    is-paused: (var-get is-paused)
  }
)

(define-read-only (is-payment-expired (intent-id (string-ascii 64)))
  (match (map-get? payment-intents { intent-id: intent-id })
    payment (> stacks-block-height (get expires-at payment))
    true
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - PAYMENT LIFECYCLE
;; ============================================

;; Create a new payment intent
(define-public (create-payment-intent
  (intent-id (string-ascii 64))
  (agent principal)
  (source-chain (string-ascii 20))
  (source-token (string-ascii 20))
  (source-amount uint)
  (expected-usdh uint)
  (payment-address (string-utf8 128))
  (expiry-blocks (optional uint)))
  
  (let (
    (new-index (+ (var-get payment-counter) u1))
    (expires-at (+ stacks-block-height (default-to DEFAULT-EXPIRY-BLOCKS expiry-blocks)))
  )
    ;; Validations
    (asserts! (not (var-get is-paused)) ERR-NOT-AUTHORIZED)
    (asserts! (is-valid-intent-id intent-id) ERR-INVALID-PAYMENT)
    (asserts! (is-valid-payment-address payment-address) ERR-INVALID-PAYMENT)
    (asserts! (is-none (map-get? payment-intents { intent-id: intent-id })) ERR-ALREADY-PROCESSED)
    (asserts! (> source-amount u0) ERR-INVALID-AMOUNT)
    (asserts! (> expected-usdh u0) ERR-INVALID-AMOUNT)
    (asserts! (> (len source-chain) u0) ERR-INVALID-PAYMENT)
    (asserts! (> (len source-token) u0) ERR-INVALID-PAYMENT)
    
    ;; Verify agent exists and is active
    (let (
      (optional-agent (contract-call? .agent-registry-v2 get-agent agent))
      (agent-data (unwrap! optional-agent ERR-AGENT-NOT-FOUND))
    )
        (asserts! (is-eq (get status agent-data) "active") ERR-AGENT-NOT-FOUND)
    )
    
    ;; Create payment intent
    (map-set payment-intents
      { intent-id: intent-id }
      {
        payment-index: new-index,
        agent: agent,
        source-chain: source-chain,
        source-token: source-token,
        source-amount: source-amount,
        expected-usdh: expected-usdh,
        payment-address: payment-address,
        status: STATUS-PENDING,
        created-at: stacks-block-height,
        expires-at: expires-at,
        detected-at: none,
        settled-at: none,
        source-tx-hash: none,
        settlement-tx-hash: none,
        fees-paid: u0,
        net-amount: u0
      }
    )
    
    ;; Index mapping
    (map-set payment-by-index
      { index: new-index }
      { intent-id: intent-id }
    )
    
    ;; Increment counter
    (var-set payment-counter new-index)

    ;; Emit event
    (print {
      event: "payment-intent-created",
      intent-id: intent-id,
      payment-index: new-index,
      agent: agent,
      source-chain: source-chain,
      source-amount: source-amount,
      expected-usdh: expected-usdh,
      expires-at: expires-at
    })
    
    (ok {
      intent-id: intent-id,
      payment-index: new-index,
      expires-at: expires-at
    })
  )
)

;; Mark payment as detected (called by relayer when funds arrive)
(define-public (mark-payment-detected
  (intent-id (string-ascii 64))
  (source-tx-hash (string-ascii 66)))
  
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    
    (match (map-get? payment-intents { intent-id: intent-id })
      payment
        (begin
          (asserts! (is-eq (get status payment) STATUS-PENDING) ERR-ALREADY-PROCESSED)
          (asserts! (<= stacks-block-height (get expires-at payment)) ERR-EXPIRED)

          (map-set payment-intents
            { intent-id: intent-id }
            (merge payment {
              status: STATUS-DETECTED,
              detected-at: (some stacks-block-height),
              source-tx-hash: (some source-tx-hash)
            })
          )

          ;; Emit event
          (print {
            event: "payment-detected",
            intent-id: intent-id,
            source-tx-hash: source-tx-hash,
            detected-at: stacks-block-height
          })

          (ok true)
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; Start route execution
(define-public (start-route-execution
  (intent-id (string-ascii 64))
  (route-type (string-ascii 20))
  (total-steps uint))
  
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    
    (match (map-get? payment-intents { intent-id: intent-id })
      payment
        (begin
          (asserts! (is-eq (get status payment) STATUS-DETECTED) ERR-ALREADY-PROCESSED)
          
          ;; Update payment status
          (map-set payment-intents
            { intent-id: intent-id }
            (merge payment { status: STATUS-ROUTING })
          )
          
          ;; Create route execution record
          (map-set route-executions
            { intent-id: intent-id }
            {
              route-type: route-type,
              steps-completed: u0,
              total-steps: total-steps,
              gas-spent-usd: u0,
              started-at: stacks-block-height,
              completed-at: none
            }
          )
          
          (ok true)
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; Update route execution progress
(define-public (update-route-progress
  (intent-id (string-ascii 64))
  (steps-completed uint)
  (gas-spent uint))
  
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    
    (match (map-get? route-executions { intent-id: intent-id })
      execution
        (begin
          (map-set route-executions
            { intent-id: intent-id }
            (merge execution {
              steps-completed: steps-completed,
              gas-spent-usd: (+ (get gas-spent-usd execution) gas-spent)
            })
          )
          
          ;; Update payment status if executing
          (match (map-get? payment-intents { intent-id: intent-id })
            payment
              (if (is-eq (get status payment) STATUS-ROUTING)
                (map-set payment-intents
                  { intent-id: intent-id }
                  (merge payment { status: STATUS-EXECUTING })
                )
                true
              )
            true
          )
          
          (ok true)
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; Complete settlement (deposits to vault - for agents who will claim yield)
;; Use complete-settlement-with-withdraw for agents with auto-withdraw enabled
(define-public (complete-settlement
  (intent-id (string-ascii 64))
  (usdh-amount uint)
  (settlement-tx-hash (string-ascii 66)))
  
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)

    ;; Reentrancy protection
    (try! (acquire-lock intent-id))
    
    (match (map-get? payment-intents { intent-id: intent-id })
      payment
        (let (
          (fee-bps (var-get settlement-fee-bps))
          (fees (/ (* usdh-amount fee-bps) u10000))
          (net-amount (- usdh-amount fees))
          (agent (get agent payment))
        )
          ;; Validate status
          (asserts! (or 
            (is-eq (get status payment) STATUS-ROUTING)
            (is-eq (get status payment) STATUS-EXECUTING)
          ) ERR-ALREADY-PROCESSED)
          
          ;; Record payment in agent registry
          (unwrap! (contract-call? .agent-registry-v2 record-payment 
            agent 
            net-amount 
            (get source-chain payment)) ERR-SETTLEMENT-FAILED)
          
          ;; Deposit to yield vault (simplified - always deposit, TODO: add auto-withdraw support)
          (asserts! (is-some (contract-call? .agent-registry-v2 get-agent agent)) ERR-AGENT-NOT-FOUND)
                (unwrap! (contract-call? .yield-vault-v2 deposit-for-agent agent net-amount) ERR-SETTLEMENT-FAILED)
          
          ;; Update payment intent
          (map-set payment-intents
            { intent-id: intent-id }
            (merge payment {
              status: STATUS-SETTLED,
              settled-at: (some stacks-block-height),
              settlement-tx-hash: (some settlement-tx-hash),
              fees-paid: fees,
              net-amount: net-amount
            })
          )

          ;; Update route execution
          (match (map-get? route-executions { intent-id: intent-id })
            execution
              (map-set route-executions
                { intent-id: intent-id }
                (merge execution { completed-at: (some stacks-block-height) })
              )
            true
          )
          
          ;; Update protocol stats
          (var-set total-settled-volume (+ (var-get total-settled-volume) net-amount))

          ;; Emit event
          (print {
            event: "payment-settled",
            intent-id: intent-id,
            agent: agent,
            usdh-amount: usdh-amount,
            net-amount: net-amount,
            fees-paid: fees,
            settlement-tx-hash: settlement-tx-hash,
            settled-at: stacks-block-height
          })

          ;; Release reentrancy lock
          ;; release lock (should not fail, but avoid panic)
          (unwrap! (release-lock intent-id) ERR-SETTLEMENT-FAILED)
          
          (ok {
            intent-id: intent-id,
            net-amount: net-amount,
            fees-paid: fees
          })
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; Mark payment as failed
(define-public (mark-payment-failed
  (intent-id (string-ascii 64))
  (reason (string-utf8 256)))
  
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    
    (match (map-get? payment-intents { intent-id: intent-id })
      payment
        (begin
          (map-set payment-intents
            { intent-id: intent-id }
            (merge payment { status: STATUS-FAILED })
          )
          (ok true)
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; Expire payment intents (can be called by anyone)
(define-public (expire-payment (intent-id (string-ascii 64)))
  (match (map-get? payment-intents { intent-id: intent-id })
    payment
      (begin
        (asserts! (> stacks-block-height (get expires-at payment)) ERR-NOT-AUTHORIZED)
        (asserts! (is-eq (get status payment) STATUS-PENDING) ERR-ALREADY-PROCESSED)
        
        (map-set payment-intents
          { intent-id: intent-id }
          (merge payment { status: STATUS-EXPIRED })
        )
        (ok true)
      )
    ERR-PAYMENT-NOT-FOUND
  )
)

;; Complete settlement with instant withdrawal (for auto-withdraw agents)
(define-public (complete-settlement-with-withdraw
  (intent-id (string-ascii 64))
  (usdh-amount uint)
  (settlement-tx-hash (string-ascii 66)))

  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)

    ;; Reentrancy protection
    (try! (acquire-lock intent-id))

    (match (map-get? payment-intents { intent-id: intent-id })
      payment
        (let (
          (fee-bps (var-get settlement-fee-bps))
          (fees (/ (* usdh-amount fee-bps) u10000))
          (net-amount (- usdh-amount fees))
          (agent (get agent payment))
        )
          ;; Validate status
          (asserts! (or
            (is-eq (get status payment) STATUS-ROUTING)
            (is-eq (get status payment) STATUS-EXECUTING)
          ) ERR-ALREADY-PROCESSED)

          ;; Record payment in agent registry
          (unwrap! (contract-call? .agent-registry-v2 record-payment
            agent
            net-amount
            (get source-chain payment)) ERR-SETTLEMENT-FAILED)

          ;; Verify agent exists and has auto-withdraw enabled
          (let (
            (optional-agent (contract-call? .agent-registry-v2 get-agent agent))
            (agent-data (unwrap! optional-agent ERR-AGENT-NOT-FOUND))
          )
              (asserts! (get auto-withdraw agent-data) ERR-NOT-AUTHORIZED)
          )

          ;; Deposit to vault first
          (unwrap! (contract-call? .yield-vault-v2 deposit-for-agent agent net-amount) ERR-SETTLEMENT-FAILED)

          ;; Then immediately withdraw (instant withdrawal with fee)
          (unwrap! (contract-call? .yield-vault-v2 instant-withdraw agent net-amount) ERR-SETTLEMENT-FAILED)

          ;; Update payment intent
          (map-set payment-intents
            { intent-id: intent-id }
            (merge payment {
              status: STATUS-SETTLED,
              settled-at: (some stacks-block-height),
              settlement-tx-hash: (some settlement-tx-hash),
              fees-paid: fees,
              net-amount: net-amount
            })
          )

          ;; Update route execution
          (match (map-get? route-executions { intent-id: intent-id })
            execution
              (map-set route-executions
                { intent-id: intent-id }
                (merge execution { completed-at: (some stacks-block-height) })
              )
            true
          )

          ;; Update protocol stats
          (var-set total-settled-volume (+ (var-get total-settled-volume) net-amount))

          ;; Emit event
          (print {
            event: "payment-settled-with-withdraw",
            intent-id: intent-id,
            agent: agent,
            usdh-amount: usdh-amount,
            net-amount: net-amount,
            fees-paid: fees,
            settlement-tx-hash: settlement-tx-hash,
            settled-at: stacks-block-height,
            withdrawn: true
          })

          ;; Release reentrancy lock
          (unwrap! (release-lock intent-id) ERR-SETTLEMENT-FAILED)

          (ok {
            intent-id: intent-id,
            net-amount: net-amount,
            fees-paid: fees
          })
        )
      ERR-PAYMENT-NOT-FOUND
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

(define-public (add-operator (operator principal) (role (string-ascii 20)))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-operators
      { operator: operator }
      { enabled: true, role: role, added-at: stacks-block-height }
    )
    (print {
      event: "operator-added",
      operator: operator,
      role: role,
      added-by: tx-sender,
      block-height: stacks-block-height
    })
    (ok true)
  )
)

(define-public (remove-operator (operator principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-delete authorized-operators { operator: operator })
    (print {
      event: "operator-removed",
      operator: operator,
      removed-by: tx-sender,
      block-height: stacks-block-height
    })
    (ok true)
  )
)

(define-public (set-settlement-fee (new-fee-bps uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-fee-bps u500) ERR-INVALID-AMOUNT) ;; Max 5% (500 bps)
    (var-set settlement-fee-bps new-fee-bps)
    (print { event: "settlement-fee-updated", new-fee-bps: new-fee-bps, updated-at: stacks-block-height })
    (ok true)
  )
)

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set is-paused paused)
    (print {
      event: "contract-paused-updated",
      paused: paused,
      updated-by: tx-sender,
      block-height: stacks-block-height
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
      block-height: stacks-block-height
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
      block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Set agent registry contract address
(define-public (set-agent-registry-contract (contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set agent-registry-contract (some contract))
    (print {
      event: "agent-registry-contract-updated",
      new-contract: contract,
      updated-by: tx-sender,
      block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Set yield vault contract address
(define-public (set-yield-vault-contract (contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set yield-vault-contract (some contract))
    (print {
      event: "yield-vault-contract-updated",
      new-contract: contract,
      updated-by: tx-sender,
      block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Get contract addresses (read-only)
(define-read-only (get-agent-registry-contract)
  (var-get agent-registry-contract)
)

(define-read-only (get-yield-vault-contract)
  (var-get yield-vault-contract)
)


