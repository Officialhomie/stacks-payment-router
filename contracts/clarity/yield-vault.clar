;; Yield Vault Contract
;; Manages USDh deposits and yield calculations for the payment router
;; Integrates with Hermetica Protocol for yield generation

;; ============================================
;; TRAITS AND IMPORTS
;; ============================================

;; SIP-010 Fungible Token Trait
;; Using standard SIP-010 trait (works on testnet and mainnet)
;; Testnet: ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.sip-010-trait-ft-standard
;; Mainnet: SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard
;; Note: yield-vault doesn't implement the trait, it just calls token contract methods
;; So we don't need use-trait here, we'll call the contract directly

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-INSUFFICIENT-BALANCE (err u2001))
(define-constant ERR-VAULT-FULL (err u2002))
(define-constant ERR-INVALID-AMOUNT (err u2003))
(define-constant ERR-VAULT-PAUSED (err u2004))
(define-constant ERR-WITHDRAWAL-LOCKED (err u2005))
(define-constant ERR-BELOW-MINIMUM (err u2006))
(define-constant ERR-AGENT-NOT-FOUND (err u2007))
(define-constant ERR-ALREADY-PROCESSED (err u2008))

;; Configuration constants
(define-constant USDH-DECIMALS u6)
(define-constant BASIS-POINTS u10000)
(define-constant BLOCKS-PER-YEAR u52560) ;; ~10 min blocks * 6 * 24 * 365

;; Error codes
(define-constant ERR-CONTRACT-NOT-INITIALIZED (err u2008))

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Contract owner (initialized on first call)
(define-data-var contract-owner (optional principal) none)

;; Contract initialization flag
(define-data-var is-initialized bool false)

;; Vault configuration (can be updated by owner)
(define-data-var yield-apy-basis-points uint u2000) ;; 20% APY = 2000 basis points
(define-data-var minimum-deposit uint u1000000) ;; 1 USDh minimum (6 decimals)
(define-data-var maximum-vault-capacity uint u100000000000000) ;; 100M USDh max
(define-data-var vault-paused bool false)
(define-data-var withdrawal-delay-blocks uint u144) ;; ~24 hours in blocks
(define-data-var protocol-fee-basis-points uint u100) ;; 1% protocol fee on yield

;; USDh token contract reference (configurable)
(define-data-var usdh-token-contract (optional principal) none)

;; ============================================
;; DATA MAPS
;; ============================================

;; Agent balances and yield tracking
(define-map agent-balances
  { agent: principal }
  {
    principal-amount: uint,
    deposited-at-block: uint,
    last-yield-claim-block: uint,
    total-yield-earned: uint,
    pending-withdrawal-amount: uint,
    withdrawal-unlock-block: uint,
    deposit-count: uint,
    withdrawal-count: uint
  }
)

;; Vault aggregate stats
(define-map vault-stats
  { id: uint }
  {
    total-deposited: uint,
    total-yield-distributed: uint,
    total-protocol-fees: uint,
    total-agents: uint,
    last-yield-distribution-block: uint
  }
)

;; Authorized operators (payment router, settlement engine)
(define-map authorized-operators
  { operator: principal }
  { enabled: bool, added-at: uint }
)

;; Reentrancy guard - tracks operations in progress
(define-map reentrancy-guard
  { caller: principal }
  { locked: bool }
)

;; ============================================
;; PRIVATE FUNCTIONS
;; ============================================

;; Check if caller is contract owner
(define-private (is-owner)
  (match (var-get contract-owner)
    owner (is-eq tx-sender owner)
    false
  )
)

;; Check if caller is authorized operator
(define-private (is-authorized-operator)
  (match (map-get? authorized-operators { operator: tx-sender })
    operator-data (get enabled operator-data)
    false
  )
)

;; Check if caller is owner or authorized operator
(define-private (is-authorized)
  (or (is-owner) (is-authorized-operator))
)

;; Check if caller has reentrancy lock
(define-private (is-locked (caller principal))
  (default-to false (get locked (map-get? reentrancy-guard { caller: caller })))
)

;; Acquire reentrancy lock
(define-private (acquire-lock (caller principal))
  (begin
    (asserts! (not (is-locked caller)) ERR-NOT-AUTHORIZED)
    (map-set reentrancy-guard { caller: caller } { locked: true })
    (ok true)
  )
)

;; Release reentrancy lock
(define-private (release-lock (caller principal))
  (begin
    (map-set reentrancy-guard { caller: caller } { locked: false })
    (ok true)
  )
)

;; Initialize vault stats if not exists
(define-private (ensure-vault-stats)
  (match (map-get? vault-stats { id: u0 })
    stats true
    (begin
      (map-set vault-stats
        { id: u0 }
        {
          total-deposited: u0,
          total-yield-distributed: u0,
          total-protocol-fees: u0,
          total-agents: u0,
          last-yield-distribution-block: block-height
        }
      )
      true
    )
  )
)

;; Calculate yield for an agent based on blocks elapsed
(define-private (calculate-yield-internal (agent principal))
  (match (map-get? agent-balances { agent: agent })
    balance-data
      (let (
        (principal-amount (get principal-amount balance-data))
        (last-claim-block (get last-yield-claim-block balance-data))
        (blocks-elapsed (- block-height last-claim-block))
        (apy (var-get yield-apy-basis-points))
      )
        (if (is-eq principal-amount u0)
          u0
          ;; yield = principal * (apy / 10000) * (blocks / blocks_per_year)
          (/ (* (* principal-amount apy) blocks-elapsed) (* BASIS-POINTS BLOCKS-PER-YEAR))
        )
      )
    u0
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get agent balance with accrued yield
(define-read-only (get-balance (agent principal))
  (match (map-get? agent-balances { agent: agent })
    balance-data
      (let (
        (accrued-yield (calculate-yield-internal agent))
        (principal-amount (get principal-amount balance-data))
      )
        (ok {
          principal: principal-amount,
          accrued-yield: accrued-yield,
          total: (+ principal-amount accrued-yield),
          deposited-at-block: (get deposited-at-block balance-data),
          last-yield-claim-block: (get last-yield-claim-block balance-data),
          total-yield-earned: (+ (get total-yield-earned balance-data) accrued-yield),
          pending-withdrawal: (get pending-withdrawal-amount balance-data),
          withdrawal-unlock-block: (get withdrawal-unlock-block balance-data)
        })
      )
    (ok {
      principal: u0,
      accrued-yield: u0,
      total: u0,
      deposited-at-block: u0,
      last-yield-claim-block: u0,
      total-yield-earned: u0,
      pending-withdrawal: u0,
      withdrawal-unlock-block: u0
    })
  )
)

;; Get vault statistics
(define-read-only (get-vault-stats)
  (default-to
    {
      total-deposited: u0,
      total-yield-distributed: u0,
      total-protocol-fees: u0,
      total-agents: u0,
      last-yield-distribution-block: u0
    }
    (map-get? vault-stats { id: u0 })
  )
)

;; Get current APY
(define-read-only (get-current-apy)
  (var-get yield-apy-basis-points)
)

;; Check if vault is accepting deposits
(define-read-only (is-vault-open)
  (and
    (not (var-get vault-paused))
    (< (get total-deposited (get-vault-stats)) (var-get maximum-vault-capacity))
  )
)

;; Calculate yield for agent (public read)
(define-read-only (calculate-yield (agent principal))
  (ok (calculate-yield-internal agent))
)

;; Check if operator is authorized
(define-read-only (is-operator-authorized (operator principal))
  (match (map-get? authorized-operators { operator: operator })
    data (get enabled data)
    false
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - DEPOSITS
;; ============================================

;; Deposit USDh to vault
(define-public (deposit (amount uint))
  (let ((caller tx-sender))
    ;; Reentrancy protection
    (try! (acquire-lock caller))

    ;; Validation
    (asserts! (not (var-get vault-paused)) ERR-VAULT-PAUSED)
    (asserts! (>= amount (var-get minimum-deposit)) ERR-BELOW-MINIMUM)
    (asserts! (<= (+ (get total-deposited (get-vault-stats)) amount) (var-get maximum-vault-capacity)) ERR-VAULT-FULL)

    ;; Ensure vault stats exist
    (ensure-vault-stats)

    ;; Transfer USDh from caller to vault
    ;; Note: Caller must have approved this contract to spend their USDh
    ;; Use contract name directly since it's a dependency
    (try! (contract-call? .token-usdh transfer amount caller (as-contract tx-sender) none))
    
    ;; Update agent balance
    (match (map-get? agent-balances { agent: caller })
      existing-balance
        (let (
          (current-yield (calculate-yield-internal caller))
        )
          (map-set agent-balances
            { agent: caller }
            {
              principal-amount: (+ (get principal-amount existing-balance) amount),
              deposited-at-block: (get deposited-at-block existing-balance),
              last-yield-claim-block: block-height,
              total-yield-earned: (+ (get total-yield-earned existing-balance) current-yield),
              pending-withdrawal-amount: (get pending-withdrawal-amount existing-balance),
              withdrawal-unlock-block: (get withdrawal-unlock-block existing-balance),
              deposit-count: (+ (get deposit-count existing-balance) u1),
              withdrawal-count: (get withdrawal-count existing-balance)
            }
          )
        )
      ;; New agent
      (begin
        (map-set agent-balances
          { agent: caller }
          {
            principal-amount: amount,
            deposited-at-block: block-height,
            last-yield-claim-block: block-height,
            total-yield-earned: u0,
            pending-withdrawal-amount: u0,
            withdrawal-unlock-block: u0,
            deposit-count: u1,
            withdrawal-count: u0
          }
        )
        ;; Update agent count
        (let ((stats (get-vault-stats)))
          (map-set vault-stats
            { id: u0 }
            (merge stats { total-agents: (+ (get total-agents stats) u1) })
          )
        )
      )
    )

    ;; Update vault totals
    (let ((stats (get-vault-stats)))
      (map-set vault-stats
        { id: u0 }
        (merge stats { total-deposited: (+ (get total-deposited stats) amount) })
      )
    )

    ;; Emit event
    (print {
      event: "vault-deposit",
      agent: caller,
      amount: amount,
      block-height: block-height
    })

    ;; Release reentrancy lock and return success
    (release-lock caller)
  )
)

;; Deposit on behalf of agent (for settlement engine)
(define-public (deposit-for-agent (agent principal) (amount uint))
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)

    ;; Reentrancy protection
    (try! (acquire-lock agent))

    (asserts! (not (var-get vault-paused)) ERR-VAULT-PAUSED)
    (asserts! (>= amount (var-get minimum-deposit)) ERR-BELOW-MINIMUM)

    ;; Transfer USDh from caller to vault
    (try! (contract-call? .token-usdh transfer amount tx-sender (as-contract tx-sender) none))
    
    ;; Update agent balance (similar logic to deposit)
    (match (map-get? agent-balances { agent: agent })
      existing-balance
        (let ((current-yield (calculate-yield-internal agent)))
          (map-set agent-balances
            { agent: agent }
            {
              principal-amount: (+ (get principal-amount existing-balance) amount),
              deposited-at-block: (get deposited-at-block existing-balance),
              last-yield-claim-block: block-height,
              total-yield-earned: (+ (get total-yield-earned existing-balance) current-yield),
              pending-withdrawal-amount: (get pending-withdrawal-amount existing-balance),
              withdrawal-unlock-block: (get withdrawal-unlock-block existing-balance),
              deposit-count: (+ (get deposit-count existing-balance) u1),
              withdrawal-count: (get withdrawal-count existing-balance)
            }
          )
        )
      (begin
        (map-set agent-balances
          { agent: agent }
          {
            principal-amount: amount,
            deposited-at-block: block-height,
            last-yield-claim-block: block-height,
            total-yield-earned: u0,
            pending-withdrawal-amount: u0,
            withdrawal-unlock-block: u0,
            deposit-count: u1,
            withdrawal-count: u0
          }
        )
        (let ((stats (get-vault-stats)))
          (map-set vault-stats
            { id: u0 }
            (merge stats { total-agents: (+ (get total-agents stats) u1) })
          )
        )
      )
    )
    
    (let ((stats (get-vault-stats)))
      (map-set vault-stats
        { id: u0 }
        (merge stats { total-deposited: (+ (get total-deposited stats) amount) })
      )
    )

    ;; Emit event
    (print {
      event: "vault-deposit-for-agent",
      agent: agent,
      amount: amount,
      depositor: tx-sender,
      block-height: block-height
    })

    ;; Release reentrancy lock and return
    (release-lock agent)
  )
)

;; ============================================
;; PUBLIC FUNCTIONS - WITHDRAWALS
;; ============================================

;; Request withdrawal (initiates time-lock)
(define-public (request-withdrawal (amount uint))
  (let (
    (caller tx-sender)
  )
    (match (map-get? agent-balances { agent: caller })
      balance-data
        (let (
          (current-yield (calculate-yield-internal caller))
          (total-available (+ (get principal-amount balance-data) current-yield))
        )
          (asserts! (>= total-available amount) ERR-INSUFFICIENT-BALANCE)
          (asserts! (is-eq (get pending-withdrawal-amount balance-data) u0) ERR-WITHDRAWAL-LOCKED)
          
          (map-set agent-balances
            { agent: caller }
            (merge balance-data {
              pending-withdrawal-amount: amount,
              withdrawal-unlock-block: (+ block-height (var-get withdrawal-delay-blocks)),
              last-yield-claim-block: block-height,
              total-yield-earned: (+ (get total-yield-earned balance-data) current-yield)
            })
          )
          (ok true)
        )
      ERR-AGENT-NOT-FOUND
    )
  )
)

;; Execute withdrawal after time-lock expires
(define-public (execute-withdrawal)
  (let (
    (caller tx-sender)
  )
    ;; Reentrancy protection
    (try! (acquire-lock caller))

    (match (map-get? agent-balances { agent: caller })
      balance-data
        (let (
          (pending-amount (get pending-withdrawal-amount balance-data))
          (unlock-block (get withdrawal-unlock-block balance-data))
          (current-yield (calculate-yield-internal caller))
          (principal-amount (get principal-amount balance-data))
        )
          (asserts! (> pending-amount u0) ERR-INVALID-AMOUNT)
          (asserts! (>= block-height unlock-block) ERR-WITHDRAWAL-LOCKED)
          
          ;; Calculate how much to take from principal vs yield
          (let (
            (total-available (+ principal-amount current-yield))
            (yield-to-withdraw (if (>= current-yield pending-amount) pending-amount u0))
            (principal-to-withdraw (if (>= current-yield pending-amount) u0 (- pending-amount current-yield)))
          )
            ;; Transfer USDh to caller
            (try! (as-contract (contract-call? .token-usdh transfer pending-amount tx-sender caller none)))
            
            ;; Update balance
            (map-set agent-balances
              { agent: caller }
              {
                principal-amount: (- principal-amount principal-to-withdraw),
                deposited-at-block: (get deposited-at-block balance-data),
                last-yield-claim-block: block-height,
                total-yield-earned: (+ (get total-yield-earned balance-data) yield-to-withdraw),
                pending-withdrawal-amount: u0,
                withdrawal-unlock-block: u0,
                deposit-count: (get deposit-count balance-data),
                withdrawal-count: (+ (get withdrawal-count balance-data) u1)
              }
            )
            
            ;; Update vault stats
            (let ((stats (get-vault-stats)))
              (map-set vault-stats
                { id: u0 }
                (merge stats {
                  total-deposited: (- (get total-deposited stats) principal-to-withdraw),
                  total-yield-distributed: (+ (get total-yield-distributed stats) yield-to-withdraw)
                })
              )
            )

            ;; Emit event
            (print {
              event: "vault-withdrawal-executed",
              agent: caller,
              amount: pending-amount,
              principal-withdrawn: principal-to-withdraw,
              yield-withdrawn: yield-to-withdraw,
              block-height: block-height
            })

            ;; Release reentrancy lock
            (unwrap! (release-lock caller) ERR-NOT-AUTHORIZED)

            (ok pending-amount)
          )
        )
      ERR-AGENT-NOT-FOUND
    )
  )
)

;; Cancel pending withdrawal
(define-public (cancel-withdrawal)
  (let ((caller tx-sender))
    (match (map-get? agent-balances { agent: caller })
      balance-data
        (begin
          (asserts! (> (get pending-withdrawal-amount balance-data) u0) ERR-INVALID-AMOUNT)
          (map-set agent-balances
            { agent: caller }
            (merge balance-data {
              pending-withdrawal-amount: u0,
              withdrawal-unlock-block: u0
            })
          )
          (ok true)
        )
      ERR-AGENT-NOT-FOUND
    )
  )
)

;; Instant withdrawal (for authorized operators only - higher fee)
(define-public (instant-withdraw (agent principal) (amount uint))
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)

    ;; Reentrancy protection
    (try! (acquire-lock agent))

    (match (map-get? agent-balances { agent: agent })
      balance-data
        (let (
          (current-yield (calculate-yield-internal agent))
          (total-available (+ (get principal-amount balance-data) current-yield))
          (fee (/ (* amount (var-get protocol-fee-basis-points)) BASIS-POINTS))
          (net-amount (- amount fee))
        )
          (asserts! (>= total-available amount) ERR-INSUFFICIENT-BALANCE)
          
          ;; Transfer net amount to agent
          (try! (as-contract (contract-call? .token-usdh transfer net-amount tx-sender agent none)))
          
          ;; Update balance
          (let (
            (principal-to-deduct (if (>= current-yield amount) u0 (- amount current-yield)))
          )
            (map-set agent-balances
              { agent: agent }
              {
                principal-amount: (- (get principal-amount balance-data) principal-to-deduct),
                deposited-at-block: (get deposited-at-block balance-data),
                last-yield-claim-block: block-height,
                total-yield-earned: (+ (get total-yield-earned balance-data) (if (>= current-yield amount) amount current-yield)),
                pending-withdrawal-amount: u0,
                withdrawal-unlock-block: u0,
                deposit-count: (get deposit-count balance-data),
                withdrawal-count: (+ (get withdrawal-count balance-data) u1)
              }
            )
            
            ;; Update vault stats
            (let ((stats (get-vault-stats)))
              (map-set vault-stats
                { id: u0 }
                (merge stats {
                  total-deposited: (- (get total-deposited stats) principal-to-deduct),
                  total-protocol-fees: (+ (get total-protocol-fees stats) fee)
                })
              )
            )

            ;; Release reentrancy lock
            (unwrap! (release-lock agent) ERR-NOT-AUTHORIZED)

            (ok net-amount)
          )
        )
      ERR-AGENT-NOT-FOUND
    )
  )
)

;; ============================================
;; ADMIN FUNCTIONS
;; ============================================

;; Add authorized operator
(define-public (add-operator (operator principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-operators
      { operator: operator }
      { enabled: true, added-at: block-height }
    )
    (ok true)
  )
)

;; Remove authorized operator
(define-public (remove-operator (operator principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-operators
      { operator: operator }
      { enabled: false, added-at: block-height }
    )
    (ok true)
  )
)

;; Update APY (owner only) - with validation
(define-public (set-apy (new-apy uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-apy u0) ERR-INVALID-AMOUNT) ;; Must be > 0
    (asserts! (<= new-apy u5000) ERR-INVALID-AMOUNT) ;; Max 50% APY (5000 bps)
    (var-set yield-apy-basis-points new-apy)
    (print { event: "apy-updated", new-apy: new-apy, updated-at: block-height })
    (ok true)
  )
)

;; Update minimum deposit - with validation
(define-public (set-minimum-deposit (new-minimum uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-minimum u0) ERR-INVALID-AMOUNT)
    (asserts! (<= new-minimum u1000000000) ERR-INVALID-AMOUNT) ;; Max 1000 USDh minimum
    (var-set minimum-deposit new-minimum)
    (print { event: "minimum-deposit-updated", new-minimum: new-minimum, updated-at: block-height })
    (ok true)
  )
)

;; Update vault capacity - with validation
(define-public (set-vault-capacity (new-capacity uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-capacity u0) ERR-INVALID-AMOUNT)
    (asserts! (>= new-capacity (get total-deposited (get-vault-stats))) ERR-VAULT-FULL) ;; Can't reduce below current deposits
    (var-set maximum-vault-capacity new-capacity)
    (print { event: "vault-capacity-updated", new-capacity: new-capacity, updated-at: block-height })
    (ok true)
  )
)

;; Pause/unpause vault
(define-public (set-vault-paused (paused bool))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set vault-paused paused)
    (ok true)
  )
)

;; Update withdrawal delay
(define-public (set-withdrawal-delay (blocks uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set withdrawal-delay-blocks blocks)
    (ok true)
  )
)

;; Update USDh token contract
;; Note: This is kept for compatibility but contract uses .token-usdh directly
(define-public (set-usdh-contract (new-contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set usdh-token-contract (some new-contract))
    (ok true)
  )
)

;; Emergency withdraw all funds (owner only)
(define-public (emergency-withdraw (recipient principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (var-get vault-paused) ERR-VAULT-PAUSED) ;; Must pause first
    
    (let ((stats (get-vault-stats)))
      (try! (as-contract (contract-call? .token-usdh transfer 
        (get total-deposited stats) 
        tx-sender 
        recipient 
        none)))
      (ok (get total-deposited stats))
    )
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
    (ok true)
  )
)

;; Transfer ownership
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set contract-owner (some new-owner))
    (ok true)
  )
)

;; Get USDh token contract address (read-only)
(define-read-only (get-usdh-contract)
  (var-get usdh-token-contract)
)
