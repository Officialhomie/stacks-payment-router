;; Agent Registry Contract
;; Manages agent registration, payment addresses, and statistics
;; Core component of the Stacks Payment Router

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-AGENT-EXISTS (err u1001))
(define-constant ERR-AGENT-NOT-FOUND (err u1002))
(define-constant ERR-UNAUTHORIZED (err u1003))
(define-constant ERR-INVALID-CHAIN (err u1004))
(define-constant ERR-AGENT-SUSPENDED (err u1005))
(define-constant ERR-INVALID-ADDRESS (err u1006))
(define-constant ERR-INVALID-AMOUNT (err u1007))
(define-constant ERR-RATE-LIMITED (err u1008))

;; Supported chains
(define-constant CHAIN-ETHEREUM "ethereum")
(define-constant CHAIN-ARBITRUM "arbitrum")
(define-constant CHAIN-BASE "base")
(define-constant CHAIN-POLYGON "polygon")
(define-constant CHAIN-OPTIMISM "optimism")
(define-constant CHAIN-STACKS "stacks")
(define-constant CHAIN-SOLANA "solana")
(define-constant CHAIN-BITCOIN "bitcoin")

;; Agent status types
(define-constant STATUS-ACTIVE "active")
(define-constant STATUS-INACTIVE "inactive")
(define-constant STATUS-SUSPENDED "suspended")

;; Error codes
(define-constant ERR-CONTRACT-NOT-INITIALIZED (err u1009))
(define-constant ERR-ALREADY-PROCESSED (err u1010))

;; Valid chains list for validation
(define-constant VALID-CHAINS (list 
  "ethereum" "arbitrum" "base" "polygon" 
  "optimism" "stacks" "solana" "bitcoin"
))

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Contract owner (initialized on first call)
(define-data-var contract-owner (optional principal) none)

;; Contract initialization flag
(define-data-var is-initialized bool false)

(define-data-var minimum-payment-amount uint u1000000) ;; 1 USD in 6 decimals
(define-data-var maximum-payment-amount uint u1000000000000) ;; 1M USD
(define-data-var protocol-fee-basis-points uint u50) ;; 0.5% fee
(define-data-var agent-counter uint u0)
(define-data-var total-volume-processed uint u0)
(define-data-var total-payments-processed uint u0)
(define-data-var is-paused bool false)

;; ============================================
;; DATA MAPS
;; ============================================

;; Main agent registry
(define-map agents
  { stacks-address: principal }
  {
    agent-id: (string-ascii 64),
    agent-index: uint,
    created-at: uint,
    enabled-chains: (list 10 (string-ascii 20)),
    total-volume: uint,
    total-payments: uint,
    status: (string-ascii 20),
    min-payment-amount: uint,
    max-payment-amount: uint,
    auto-withdraw: bool,
    settlement-preference: (string-ascii 20),
    webhook-url: (optional (string-utf8 256)),
    last-payment-at: uint,
    suspended-at: (optional uint),
    suspension-reason: (optional (string-utf8 256))
  }
)

;; Agent lookup by agent-id string
(define-map agent-by-id
  { agent-id: (string-ascii 64) }
  { stacks-address: principal }
)

;; Payment addresses per agent per chain
(define-map agent-payment-addresses
  { agent: principal, chain: (string-ascii 20) }
  { 
    address: (string-utf8 128),
    is-verified: bool,
    added-at: uint,
    last-used-at: uint
  }
)

;; Authorized operators (payment router, settlement engine)
(define-map authorized-operators
  { operator: principal }
  { 
    enabled: bool, 
    role: (string-ascii 20),
    added-at: uint 
  }
)

;; Rate limiting per agent
(define-map agent-rate-limits
  { agent: principal }
  {
    payments-last-hour: uint,
    last-hour-reset: uint,
    payments-last-day: uint,
    last-day-reset: uint
  }
)

;; Daily payment limits per agent
(define-map agent-daily-limits
  { agent: principal }
  {
    max-payments-per-hour: uint,
    max-payments-per-day: uint,
    max-volume-per-day: uint
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

;; Validate chain is supported
(define-private (is-valid-chain (chain (string-ascii 20)))
  (or
    (is-eq chain "ethereum")
    (or (is-eq chain "arbitrum")
    (or (is-eq chain "base")
    (or (is-eq chain "polygon")
    (or (is-eq chain "optimism")
    (or (is-eq chain "stacks")
    (or (is-eq chain "solana")
    (is-eq chain "bitcoin"))))))))
)

;; Check if all chains in list are valid
(define-private (validate-chains (chains (list 10 (string-ascii 20))))
  (fold check-chain-valid chains true)
)

(define-private (check-chain-valid (chain (string-ascii 20)) (valid bool))
  (and valid (is-valid-chain chain))
)

;; Helper to check if chain already exists in list
(define-private (chain-exists-in-list (chain (string-ascii 20)) (chain-list (list 10 (string-ascii 20))))
  (is-some (index-of chain-list chain))
)

;; Helper to add chain only if not already in list (deduplication)
(define-private (add-unique-chain
  (chain (string-ascii 20))
  (acc { chains: (list 10 (string-ascii 20)), count: uint }))
  (if (chain-exists-in-list chain (get chains acc))
    acc ;; Already exists, don't add
    {
      chains: (unwrap! (as-max-len? (append (get chains acc) chain) u10) acc),
      count: (+ (get count acc) u1)
    }
  )
)

;; Deduplicate chain lists by merging unique chains only
(define-private (merge-unique-chains
  (existing (list 10 (string-ascii 20)))
  (new-chains (list 10 (string-ascii 20))))
  (let (
    (result (fold add-unique-chain new-chains { chains: existing, count: u0 }))
  )
    (get chains result)
  )
)

;; Validate agent-id format (must be non-empty and alphanumeric)
(define-private (is-valid-agent-id (agent-id (string-ascii 64)))
  (and
    (> (len agent-id) u0)
    (<= (len agent-id) u64)
  )
)

;; Validate payment address format (must be non-empty)
(define-private (is-valid-address (address (string-utf8 128)))
  (and
    (> (len address) u0)
    (<= (len address) u128)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get agent by Stacks address
(define-read-only (get-agent (address principal))
  (map-get? agents { stacks-address: address })
)

;; Get agent by agent-id
(define-read-only (get-agent-by-id (agent-id (string-ascii 64)))
  (match (map-get? agent-by-id { agent-id: agent-id })
    lookup (map-get? agents { stacks-address: (get stacks-address lookup) })
    none
  )
)

;; Check if agent is within rate limits
(define-read-only (check-rate-limits (agent principal))
  (match (map-get? agent-rate-limits { agent: agent })
    rate-data
      (match (map-get? agent-daily-limits { agent: agent })
        limits
          (let (
            (hourly-reset-due (>= (- stacks-block-height (get last-hour-reset rate-data)) u6))
            (daily-reset-due (>= (- stacks-block-height (get last-day-reset rate-data)) u144))
            (current-hourly (if hourly-reset-due u0 (get payments-last-hour rate-data)))
            (current-daily (if daily-reset-due u0 (get payments-last-day rate-data)))
          )
            (and
              (< current-hourly (get max-payments-per-hour limits))
              (< current-daily (get max-payments-per-day limits))
            )
          )
        true ;; No limits configured, allow
      )
    true ;; No rate limit tracking yet, allow
  )
)

;; Get payment address for chain
(define-read-only (get-payment-address (agent principal) (chain (string-ascii 20)))
  (match (map-get? agent-payment-addresses { agent: agent, chain: chain })
    record (ok {
      address: (get address record),
      is-verified: (get is-verified record),
      added-at: (get added-at record)
    })
    (err ERR-AGENT-NOT-FOUND)
  )
)

;; Get all enabled chains for agent
(define-read-only (get-enabled-chains (agent principal))
  (match (map-get? agents { stacks-address: agent })
    agent-data (ok (get enabled-chains agent-data))
    (err ERR-AGENT-NOT-FOUND)
  )
)

;; Check if agent is active
(define-read-only (is-agent-active (agent principal))
  (match (map-get? agents { stacks-address: agent })
    agent-data (is-eq (get status agent-data) STATUS-ACTIVE)
    false
  )
)

;; Get protocol stats
(define-read-only (get-protocol-stats)
  {
    total-agents: (var-get agent-counter),
    total-volume: (var-get total-volume-processed),
    total-payments: (var-get total-payments-processed),
    protocol-fee-bps: (var-get protocol-fee-basis-points),
    min-payment: (var-get minimum-payment-amount),
    max-payment: (var-get maximum-payment-amount),
    is-paused: (var-get is-paused)
  }
)

;; Check if operator is authorized
(define-read-only (is-operator-authorized (operator principal))
  (match (map-get? authorized-operators { operator: operator })
    data (get enabled data)
    false
  )
)

;; Get agent rate limit status
(define-read-only (get-rate-limit-status (agent principal))
  (match (map-get? agent-rate-limits { agent: agent })
    limits (ok limits)
    (ok {
      payments-last-hour: u0,
      last-hour-reset: u0,
      payments-last-day: u0,
      last-day-reset: u0
    })
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - REGISTRATION
;; ============================================

;; Register new agent
(define-public (register-agent
  (agent-id (string-ascii 64))
  (chains (list 10 (string-ascii 20)))
  (min-amount uint)
  (max-amount uint)
  (auto-withdraw bool)
  (settlement-pref (string-ascii 20))
  (webhook (optional (string-utf8 256))))

  (let (
    (caller tx-sender)
    (new-index (+ (var-get agent-counter) u1))
  )
    ;; Validations
    (asserts! (not (var-get is-paused)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-valid-agent-id agent-id) (err ERR-AGENT-EXISTS))
    (asserts! (is-none (map-get? agents { stacks-address: caller })) (err ERR-AGENT-EXISTS))
    (asserts! (is-none (map-get? agent-by-id { agent-id: agent-id })) (err ERR-AGENT-EXISTS))
    (asserts! (validate-chains chains) (err ERR-INVALID-CHAIN))
    (asserts! (>= min-amount (var-get minimum-payment-amount)) (err ERR-INVALID-AMOUNT))
    (asserts! (<= max-amount (var-get maximum-payment-amount)) (err ERR-INVALID-AMOUNT))
    (asserts! (> min-amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> max-amount min-amount) (err ERR-INVALID-AMOUNT))
    (asserts! (> (len chains) u0) (err ERR-INVALID-CHAIN))
    (asserts! (<= (len chains) u10) (err ERR-INVALID-CHAIN))
    
    ;; Create agent record
    (map-set agents
      { stacks-address: caller }
      {
        agent-id: agent-id,
        agent-index: new-index,
        created-at: stacks-block-height,
        enabled-chains: chains,
        total-volume: u0,
        total-payments: u0,
        status: STATUS-ACTIVE,
        min-payment-amount: min-amount,
        max-payment-amount: max-amount,
        auto-withdraw: auto-withdraw,
        settlement-preference: settlement-pref,
        webhook-url: webhook,
        last-payment-at: u0,
        suspended-at: none,
        suspension-reason: none
      }
    )
    
    ;; Create reverse lookup
    (map-set agent-by-id
      { agent-id: agent-id }
      { stacks-address: caller }
    )
    
    ;; Initialize rate limits
    (map-set agent-rate-limits
      { agent: caller }
      {
        payments-last-hour: u0,
        last-hour-reset: stacks-block-height,
        payments-last-day: u0,
        last-day-reset: stacks-block-height
      }
    )
    
    ;; Set default daily limits
    (map-set agent-daily-limits
      { agent: caller }
      {
        max-payments-per-hour: u100,
        max-payments-per-day: u1000,
        max-volume-per-day: u10000000000000 ;; 10M USD
      }
    )
    
    ;; Increment counter
    (var-set agent-counter new-index)

    ;; Emit event
    (print {
      event: "agent-registered",
      agent-id: agent-id,
      agent-index: new-index,
      stacks-address: caller,
      enabled-chains: chains,
      created-at: stacks-block-height
    })

    (ok {
      agent-id: agent-id,
      agent-index: new-index,
      stacks-address: caller
    })
  )
)

;; Set payment address for a chain
(define-public (set-payment-address
  (chain (string-ascii 20))
  (address (string-utf8 128)))
  
  (let ((caller tx-sender))
    ;; Validations
    (asserts! (is-some (map-get? agents { stacks-address: caller })) (err ERR-AGENT-NOT-FOUND))
    (asserts! (is-valid-chain chain) (err ERR-INVALID-CHAIN))
    (asserts! (is-valid-address address) (err ERR-INVALID-ADDRESS))
    
    ;; Check agent has this chain enabled
    (match (map-get? agents { stacks-address: caller })
      agent-data 
        (asserts! (is-some (index-of (get enabled-chains agent-data) chain)) (err ERR-INVALID-CHAIN))
      (asserts! false (err ERR-AGENT-NOT-FOUND))
    )
    
    ;; Set or update payment address
    (map-set agent-payment-addresses
      { agent: caller, chain: chain }
      {
        address: address,
        is-verified: false,
        added-at: stacks-block-height,
        last-used-at: u0
      }
    )
    
    (ok true)
  )
)

;; Bulk set payment addresses
(define-public (set-payment-addresses-bulk
  (addresses (list 10 { chain: (string-ascii 20), address: (string-utf8 128) })))
  (begin
    (map set-single-address addresses)
    (ok true)
  )
)

(define-private (set-single-address (entry { chain: (string-ascii 20), address: (string-utf8 128) }))
  (let ((caller tx-sender))
    (map-set agent-payment-addresses
      { agent: caller, chain: (get chain entry) }
      {
        address: (get address entry),
        is-verified: false,
        added-at: stacks-block-height,
        last-used-at: u0
      }
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - SETTINGS UPDATE
;; ============================================

;; Update agent settings
(define-public (update-agent-settings
  (min-amount uint)
  (max-amount uint)
  (auto-withdraw bool)
  (settlement-pref (string-ascii 20))
  (webhook (optional (string-utf8 256))))
  
  (let ((caller tx-sender))
    (match (map-get? agents { stacks-address: caller })
      agent-data
        (begin
          (asserts! (not (is-eq (get status agent-data) STATUS-SUSPENDED)) (err ERR-AGENT-SUSPENDED))
          (asserts! (>= min-amount (var-get minimum-payment-amount)) (err ERR-INVALID-AMOUNT))
          (asserts! (<= max-amount (var-get maximum-payment-amount)) (err ERR-INVALID-AMOUNT))
          (asserts! (> min-amount u0) (err ERR-INVALID-AMOUNT))
          (asserts! (> max-amount min-amount) (err ERR-INVALID-AMOUNT))
          
          (map-set agents
            { stacks-address: caller }
            (merge agent-data {
              min-payment-amount: min-amount,
              max-payment-amount: max-amount,
              auto-withdraw: auto-withdraw,
              settlement-preference: settlement-pref,
              webhook-url: webhook
            })
          )
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Add chains to enabled list (with deduplication)
(define-public (add-enabled-chains (new-chains (list 10 (string-ascii 20))))
  (let ((caller tx-sender))
    (match (map-get? agents { stacks-address: caller })
      agent-data
        (begin
          (asserts! (not (is-eq (get status agent-data) STATUS-SUSPENDED)) (err ERR-AGENT-SUSPENDED))
          (asserts! (validate-chains new-chains) (err ERR-INVALID-CHAIN))
          (asserts! (> (len new-chains) u0) (err ERR-INVALID-CHAIN))

          ;; Merge chains with deduplication
          (let (
            (existing-chains (get enabled-chains agent-data))
            (merged-list (merge-unique-chains existing-chains new-chains))
          )
            ;; Validate merged list doesn't exceed max length
            (asserts! (<= (len merged-list) u10) (err ERR-INVALID-CHAIN))
            (map-set agents
              { stacks-address: caller }
              (merge agent-data { enabled-chains: merged-list })
            )
            (ok true)
          )
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Deactivate agent (self-service)
(define-public (deactivate-agent)
  (let ((caller tx-sender))
    (match (map-get? agents { stacks-address: caller })
      agent-data
        (begin
          (map-set agents
            { stacks-address: caller }
            (merge agent-data { status: STATUS-INACTIVE })
          )
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Reactivate agent (self-service, if not suspended)
(define-public (reactivate-agent)
  (let ((caller tx-sender))
    (match (map-get? agents { stacks-address: caller })
      agent-data
        (begin
          (asserts! (not (is-eq (get status agent-data) STATUS-SUSPENDED)) (err ERR-AGENT-SUSPENDED))
          (map-set agents
            { stacks-address: caller }
            (merge agent-data { status: STATUS-ACTIVE })
          )
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - PAYMENT RECORDING
;; ============================================

;; Record a payment (called by authorized payment router)
;; SECURITY FIX: Atomic check-and-increment for rate limiting to prevent TOCTOU
(define-public (record-payment (agent principal) (amount uint) (chain (string-ascii 20)))
  (begin
    (asserts! (is-authorized) (err ERR-UNAUTHORIZED))
    (asserts! (not (var-get is-paused)) (err ERR-NOT-AUTHORIZED))

    (match (map-get? agents { stacks-address: agent })
      agent-data
        (begin
          (asserts! (is-eq (get status agent-data) STATUS-ACTIVE) (err ERR-AGENT-SUSPENDED))
          (asserts! (>= amount (get min-payment-amount agent-data)) (err ERR-INVALID-AMOUNT))
          (asserts! (<= amount (get max-payment-amount agent-data)) (err ERR-INVALID-AMOUNT))

          ;; SECURITY FIX: Atomic check-and-increment for rate limiting
          ;; INCREMENT FIRST, then check limits - prevents TOCTOU race condition
          (let (
            (rate-limit-data (default-to 
              { payments-last-hour: u0, last-hour-reset: stacks-block-height, payments-last-day: u0, last-day-reset: stacks-block-height }
              (map-get? agent-rate-limits { agent: agent })))
            (limits (default-to
              { max-payments-per-hour: u100, max-payments-per-day: u1000, max-volume-per-day: u10000000000000 }
              (map-get? agent-daily-limits { agent: agent })))
            (hourly-reset-due (>= (- stacks-block-height (get last-hour-reset rate-limit-data)) u6))
            (daily-reset-due (>= (- stacks-block-height (get last-day-reset rate-limit-data)) u144))
            (current-hourly (if hourly-reset-due u0 (get payments-last-hour rate-limit-data)))
            (current-daily (if daily-reset-due u0 (get payments-last-day rate-limit-data)))
            (new-hourly (+ current-hourly u1))
            (new-daily (+ current-daily u1))
          )
            ;; FIRST: Update counters atomically
            (map-set agent-rate-limits
              { agent: agent }
              {
                payments-last-hour: new-hourly,
                last-hour-reset: (if hourly-reset-due stacks-block-height (get last-hour-reset rate-limit-data)),
                payments-last-day: new-daily,
                last-day-reset: (if daily-reset-due stacks-block-height (get last-day-reset rate-limit-data))
              }
            )
            
            ;; THEN: Check limits (after increment to prevent race condition)
            (asserts! (<= new-hourly (get max-payments-per-hour limits)) (err ERR-RATE-LIMITED))
            (asserts! (<= new-daily (get max-payments-per-day limits)) (err ERR-RATE-LIMITED))
          )
          
          ;; Update agent stats
          (map-set agents
            { stacks-address: agent }
            (merge agent-data {
              total-volume: (+ (get total-volume agent-data) amount),
              total-payments: (+ (get total-payments agent-data) u1),
              last-payment-at: stacks-block-height
            })
          )
          
          ;; Update payment address last-used
          (match (map-get? agent-payment-addresses { agent: agent, chain: chain })
            addr-data
              (map-set agent-payment-addresses
                { agent: agent, chain: chain }
                (merge addr-data { last-used-at: stacks-block-height })
              )
            true
          )
          
          ;; Update protocol totals
          (var-set total-volume-processed (+ (var-get total-volume-processed) amount))
          (var-set total-payments-processed (+ (var-get total-payments-processed) u1))

          ;; Emit event
          (print {
            event: "payment-recorded",
            agent: agent,
            amount: amount,
            chain: chain,
            new-total-volume: (+ (get total-volume agent-data) amount),
            new-total-payments: (+ (get total-payments agent-data) u1),
            recorded-at: stacks-block-height
          })

          (ok {
            agent-id: (get agent-id agent-data),
            new-total-volume: (+ (get total-volume agent-data) amount),
            new-total-payments: (+ (get total-payments agent-data) u1)
          })
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Verify payment address (called by authorized operator after verification)
(define-public (verify-payment-address (agent principal) (chain (string-ascii 20)))
  (begin
    (asserts! (is-authorized) (err ERR-UNAUTHORIZED))
    
    (match (map-get? agent-payment-addresses { agent: agent, chain: chain })
      addr-data
        (begin
          (map-set agent-payment-addresses
            { agent: agent, chain: chain }
            (merge addr-data { is-verified: true })
          )
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Add authorized operator
(define-public (add-operator (operator principal) (role (string-ascii 20)))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
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

;; Remove authorized operator
(define-public (remove-operator (operator principal))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
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

;; Suspend agent (admin/owner only - not regular operators)
(define-public (suspend-agent (agent principal) (reason (string-utf8 256)))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    
    (match (map-get? agents { stacks-address: agent })
      agent-data
        (begin
          (map-set agents
            { stacks-address: agent }
            (merge agent-data {
              status: STATUS-SUSPENDED,
              suspended-at: (some stacks-block-height),
              suspension-reason: (some reason)
            })
          )
          (print {
            event: "agent-suspended",
            agent: agent,
            reason: reason,
            suspended-by: tx-sender,
            block-height: stacks-block-height
          })
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Unsuspend agent (admin/owner only - not regular operators)
(define-public (unsuspend-agent (agent principal))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    
    (match (map-get? agents { stacks-address: agent })
      agent-data
        (begin
          (map-set agents
            { stacks-address: agent }
            (merge agent-data {
              status: STATUS-ACTIVE,
              suspended-at: none,
              suspension-reason: none
            })
          )
          (print {
            event: "agent-unsuspended",
            agent: agent,
            unsuspended-by: tx-sender,
            block-height: stacks-block-height
          })
          (ok true)
        )
      (err ERR-AGENT-NOT-FOUND)
    )
  )
)

;; Update protocol fee - with validation
(define-public (set-protocol-fee (new-fee-bps uint))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (<= new-fee-bps u1000) (err ERR-INVALID-AMOUNT)) ;; Max 10% (1000 bps)
    (var-set protocol-fee-basis-points new-fee-bps)
    (print { event: "protocol-fee-updated", new-fee-bps: new-fee-bps, updated-at: stacks-block-height })
    (ok true)
  )
)

;; Update minimum payment amount - with validation
(define-public (set-minimum-payment (new-minimum uint))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-minimum u0) (err ERR-INVALID-AMOUNT))
    (asserts! (< new-minimum (var-get maximum-payment-amount)) (err ERR-INVALID-AMOUNT))
    (var-set minimum-payment-amount new-minimum)
    (print { event: "minimum-payment-updated", new-minimum: new-minimum, updated-at: stacks-block-height })
    (ok true)
  )
)

;; Update maximum payment amount - with validation
(define-public (set-maximum-payment (new-maximum uint))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-maximum (var-get minimum-payment-amount)) (err ERR-INVALID-AMOUNT))
    (var-set maximum-payment-amount new-maximum)
    (print { event: "maximum-payment-updated", new-maximum: new-maximum, updated-at: stacks-block-height })
    (ok true)
  )
)

;; Pause/unpause contract
(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
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

;; Configure rate limits for specific agent (admin only)
(define-public (set-agent-rate-limits
  (agent principal)
  (max-per-hour uint)
  (max-per-day uint)
  (max-volume-per-day uint))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (> max-per-hour u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> max-per-day u0) (err ERR-INVALID-AMOUNT))
    (asserts! (>= max-per-day max-per-hour) (err ERR-INVALID-AMOUNT)) ;; Daily >= hourly
    (asserts! (> max-volume-per-day u0) (err ERR-INVALID-AMOUNT))

    ;; Verify agent exists
    (asserts! (is-some (map-get? agents { stacks-address: agent })) (err ERR-AGENT-NOT-FOUND))

    ;; Update limits
    (map-set agent-daily-limits
      { agent: agent }
      {
        max-payments-per-hour: max-per-hour,
        max-payments-per-day: max-per-day,
        max-volume-per-day: max-volume-per-day
      }
    )

    (print {
      event: "agent-rate-limits-updated",
      agent: agent,
      max-per-hour: max-per-hour,
      max-per-day: max-per-day,
      max-volume-per-day: max-volume-per-day,
      updated-at: stacks-block-height
    })

    (ok true)
  )
)

;; Reset rate limit counters for an agent (emergency admin function)
(define-public (reset-agent-rate-counters (agent principal))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? agents { stacks-address: agent })) (err ERR-AGENT-NOT-FOUND))

    (map-set agent-rate-limits
      { agent: agent }
      {
        payments-last-hour: u0,
        last-hour-reset: stacks-block-height,
        payments-last-day: u0,
        last-day-reset: stacks-block-height
      }
    )

    (print {
      event: "agent-rate-counters-reset",
      agent: agent,
      reset-at: stacks-block-height
    })

    (ok true)
  )
)

;; Get agent rate limit configuration (read-only)
(define-read-only (get-agent-rate-limit-config (agent principal))
  (match (map-get? agent-daily-limits { agent: agent })
    limits (ok limits)
    (ok {
      max-payments-per-hour: u100,
      max-payments-per-day: u1000,
      max-volume-per-day: u10000000000000
    })
  )
)

;; ============================================
;; INITIALIZATION FUNCTIONS
;; ============================================

;; Initialize contract (sets owner on first call)
(define-public (initialize-contract)
  (begin
    (asserts! (not (var-get is-initialized)) (err ERR-ALREADY-PROCESSED))
    (var-set contract-owner (some tx-sender))
    (var-set is-initialized true)
    (ok true)
  )
)

;; Transfer ownership
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-owner) (err ERR-NOT-AUTHORIZED))
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
