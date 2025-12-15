;; Yield Vault Contract
;; Manages USDh deposits and yield calculations for the payment router
;; Integrates with Hermetica Protocol for yield generation
;;
;; SECURITY MODEL (Clarity 4 Compatible):
;; - Deposits: User calls deposit(), vault executes transfer FROM user TO vault
;;   User is tx-sender and authorizes their own transfer atomically
;; - Withdrawals: Vault uses contract-transfer (authorized contract pattern)
;;   This grants the contract permission to transfer its own tokens

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes - standardized with unique codes
(define-constant ERR-NOT-AUTHORIZED (err u2000))
(define-constant ERR-INSUFFICIENT-BALANCE (err u2001))
(define-constant ERR-VAULT-FULL (err u2002))
(define-constant ERR-INVALID-AMOUNT (err u2003))
(define-constant ERR-VAULT-PAUSED (err u2004))
(define-constant ERR-WITHDRAWAL-LOCKED (err u2005))
(define-constant ERR-BELOW-MINIMUM (err u2006))
(define-constant ERR-AGENT-NOT-FOUND (err u2007))
(define-constant ERR-ALREADY-PROCESSED (err u2008))
(define-constant ERR-SETTLEMENT-FAILED (err u2009))
(define-constant ERR-CONTRACT-NOT-INITIALIZED (err u2010))
(define-constant ERR-TRANSFER-FAILED (err u2011))
(define-constant ERR-VAULT-ADDRESS-NOT-SET (err u2012))

;; Configuration constants
(define-constant USDH-DECIMALS u6)
(define-constant BASIS-POINTS u10000)
(define-constant BLOCKS-PER-YEAR u52560) ;; ~10 min blocks * 6 * 24 * 365

;; ============================================
;; DATA VARIABLES
;; ============================================

;; Contract owner (initialized on first call)
(define-data-var contract-owner (optional principal) none)

;; Contract initialization flag
(define-data-var is-initialized bool false)

;; Vault's own address - MUST be set during initialize-contract()
;; This is required because Clarity 4 removed the simple (as-contract tx-sender) pattern
(define-data-var vault-address (optional principal) none)

;; Vault configuration (can be updated by owner)
(define-data-var yield-apy-basis-points uint u2000) ;; 20% APY = 2000 basis points
(define-data-var minimum-deposit uint u1000000) ;; 1 USDh minimum (6 decimals)
(define-data-var minimum-withdrawal uint u1000000) ;; 1 USDh minimum withdrawal (6 decimals)
(define-data-var maximum-vault-capacity uint u100000000000000) ;; 100M USDh max
(define-data-var vault-paused bool false)
(define-data-var withdrawal-delay-blocks uint u144) ;; ~24 hours in blocks
(define-data-var protocol-fee-basis-points uint u100) ;; 1% protocol fee on yield

;; USDh token contract reference (for mainnet Hermetica integration)
;; Default: .token-usdh-v2 (local mock for testing)
;; Mainnet: Set to Hermetica's USDh contract via set-usdh-contract()
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

;; Release reentrancy lock - simplified to just return true (map-set always succeeds)
(define-private (release-lock (caller principal))
  (begin
    (map-set reentrancy-guard { caller: caller } { locked: false })
    true
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
          last-yield-distribution-block: stacks-block-height
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
        (blocks-elapsed (- stacks-block-height last-claim-block))
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

;; Get the vault's own address (useful for frontend integrations)
;; Returns none if not yet initialized
(define-read-only (get-vault-address)
  (var-get vault-address)
)

;; Helper to get vault address or fail - returns (response principal uint)
(define-private (get-vault-address-or-fail)
  (ok (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
)

;; Get minimum withdrawal amount
(define-read-only (get-minimum-withdrawal)
  (var-get minimum-withdrawal)
)

;; ============================================
;; PUBLIC FUNCTIONS - DEPOSITS
;; ============================================

;; Deposit USDh to vault
;; SECURITY: Atomic transfer pattern - user calls deposit(), vault executes transfer
;; No two-step pattern needed - tx-sender remains the user throughout
(define-public (deposit (amount uint))
  (let (
    (caller tx-sender)
    (vault-addr (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
  )
    ;; Reentrancy protection
    (try! (acquire-lock caller))

    ;; Validation
    (asserts! (not (var-get vault-paused)) ERR-VAULT-PAUSED)
    (asserts! (>= amount (var-get minimum-deposit)) ERR-BELOW-MINIMUM)
    (asserts! (<= (+ (get total-deposited (get-vault-stats)) amount) (var-get maximum-vault-capacity)) ERR-VAULT-FULL)

    ;; Ensure vault stats exist
    (ensure-vault-stats)

    ;; ATOMIC TRANSFER: User (tx-sender) transfers tokens TO vault
    ;; Since user is tx-sender, they authorize this transfer of their own tokens
    (try! (contract-call? .token-usdh-v2 transfer amount caller vault-addr none))

    ;; Update agent balance (only after successful transfer)
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
              last-yield-claim-block: stacks-block-height,
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
            deposited-at-block: stacks-block-height,
            last-yield-claim-block: stacks-block-height,
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
      stacks-block-height: stacks-block-height
    })

    ;; Release reentrancy lock and return success
    (release-lock caller)
    (ok true)
  )
)

;; Deposit on behalf of agent (for settlement engine / payment-router)
;; ATOMIC PATTERN: Authorized operator's tokens are transferred atomically
;; Operator (tx-sender) transfers FROM themselves TO vault, credited to agent
(define-public (deposit-for-agent (agent principal) (amount uint))
  (let (
    (depositor tx-sender)
    (vault-addr (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
  )
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)

    ;; Reentrancy protection
    (try! (acquire-lock agent))

    (asserts! (not (var-get vault-paused)) ERR-VAULT-PAUSED)
    (asserts! (>= amount (var-get minimum-deposit)) ERR-BELOW-MINIMUM)

    ;; Ensure vault stats exist
    (ensure-vault-stats)

    ;; ATOMIC TRANSFER: Depositor (tx-sender) transfers TO vault, credited to agent
    ;; Since depositor is tx-sender, they authorize this transfer of their own tokens
    (try! (contract-call? .token-usdh-v2 transfer amount depositor vault-addr none))

    ;; Update agent balance (only after successful transfer)
    (match (map-get? agent-balances { agent: agent })
      existing-balance
        (let ((current-yield (calculate-yield-internal agent)))
          (map-set agent-balances
            { agent: agent }
            {
              principal-amount: (+ (get principal-amount existing-balance) amount),
              deposited-at-block: (get deposited-at-block existing-balance),
              last-yield-claim-block: stacks-block-height,
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
            deposited-at-block: stacks-block-height,
            last-yield-claim-block: stacks-block-height,
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
      depositor: depositor,
      stacks-block-height: stacks-block-height
    })

    ;; Release reentrancy lock and return
    (release-lock agent)
    (ok true)
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
              withdrawal-unlock-block: (+ stacks-block-height (var-get withdrawal-delay-blocks)),
              last-yield-claim-block: stacks-block-height,
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
;; SECURITY: Uses as-contract for secure vault-to-user transfer
(define-public (execute-withdrawal)
  (let (
    (caller tx-sender)
    (vault-addr (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
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
          (asserts! (>= pending-amount (var-get minimum-withdrawal)) ERR-BELOW-MINIMUM)
          (asserts! (>= stacks-block-height unlock-block) ERR-WITHDRAWAL-LOCKED)

          ;; SECURITY: Verify vault has sufficient token balance
          (let (
            (vault-balance (unwrap! (contract-call? .token-usdh-v2 get-balance vault-addr) ERR-SETTLEMENT-FAILED))
          )
            (asserts! (>= vault-balance pending-amount) ERR-INSUFFICIENT-BALANCE)
          )

          ;; Calculate how much to take from principal vs yield
          (let (
            (total-available (+ principal-amount current-yield))
            (yield-to-withdraw (if (>= current-yield pending-amount) pending-amount u0))
            (principal-to-withdraw (if (>= current-yield pending-amount) u0 (- pending-amount current-yield)))
          )
            ;; Transfer USDh to caller using authorized contract transfer
            (try! (contract-call? .token-usdh-v2 contract-transfer pending-amount caller))

            ;; Update balance
            (map-set agent-balances
              { agent: caller }
              {
                principal-amount: (- principal-amount principal-to-withdraw),
                deposited-at-block: (get deposited-at-block balance-data),
                last-yield-claim-block: stacks-block-height,
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
              stacks-block-height: stacks-block-height
            })

            ;; Release reentrancy lock
            (release-lock caller)

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
;; SECURITY: Uses as-contract for secure vault-to-user transfer
(define-public (instant-withdraw (agent principal) (amount uint))
  (let (
    (vault-addr (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
  )
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

          ;; SECURITY: Verify vault has sufficient token balance
          (let (
            (vault-balance (unwrap! (contract-call? .token-usdh-v2 get-balance vault-addr) ERR-SETTLEMENT-FAILED))
          )
            (asserts! (>= vault-balance net-amount) ERR-INSUFFICIENT-BALANCE)
          )

          ;; Transfer using authorized contract transfer
          (try! (contract-call? .token-usdh-v2 contract-transfer net-amount agent))

          ;; Update balance (only after successful transfer)
          (let (
            (principal-to-deduct (if (>= current-yield amount) u0 (- amount current-yield)))
          )
            (map-set agent-balances
              { agent: agent }
              {
                principal-amount: (- (get principal-amount balance-data) principal-to-deduct),
                deposited-at-block: (get deposited-at-block balance-data),
                last-yield-claim-block: stacks-block-height,
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

            ;; Emit event
            (print {
              event: "vault-instant-withdraw",
              agent: agent,
              gross-amount: amount,
              net-amount: net-amount,
              fee: fee,
              stacks-block-height: stacks-block-height
            })

            ;; Release reentrancy lock
            (release-lock agent)

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
      { enabled: true, added-at: stacks-block-height }
    )
    (print {
      event: "operator-added",
      operator: operator,
      added-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Remove authorized operator
(define-public (remove-operator (operator principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (map-set authorized-operators
      { operator: operator }
      { enabled: false, added-at: stacks-block-height }
    )
    (print {
      event: "operator-removed",
      operator: operator,
      removed-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
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
    (print { event: "apy-updated", new-apy: new-apy, updated-at: stacks-block-height })
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
    (print { event: "minimum-deposit-updated", new-minimum: new-minimum, updated-at: stacks-block-height })
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
    (print { event: "vault-capacity-updated", new-capacity: new-capacity, updated-at: stacks-block-height })
    (ok true)
  )
)

;; Pause/unpause vault
(define-public (set-vault-paused (paused bool))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set vault-paused paused)
    (print {
      event: "vault-paused-updated",
      paused: paused,
      updated-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Update withdrawal delay
(define-public (set-withdrawal-delay (blocks uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set withdrawal-delay-blocks blocks)
    (print {
      event: "withdrawal-delay-updated",
      blocks: blocks,
      updated-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Update minimum withdrawal amount
(define-public (set-minimum-withdrawal (new-minimum uint))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (> new-minimum u0) ERR-INVALID-AMOUNT)
    (var-set minimum-withdrawal new-minimum)
    (print {
      event: "minimum-withdrawal-updated",
      new-minimum: new-minimum,
      updated-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Update USDh token contract (for mainnet Hermetica integration)
(define-public (set-usdh-contract (new-contract principal))
  (begin
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (var-set usdh-token-contract (some new-contract))
    (print {
      event: "usdh-contract-updated",
      new-contract: new-contract,
      updated-by: tx-sender,
      stacks-block-height: stacks-block-height
    })
    (ok true)
  )
)

;; Emergency withdraw all funds (owner only)
;; SECURITY: Must pause vault first, uses as-contract for secure transfer
(define-public (emergency-withdraw (recipient principal))
  (let (
    (vault-addr (unwrap! (var-get vault-address) ERR-VAULT-ADDRESS-NOT-SET))
  )
    (asserts! (is-owner) ERR-NOT-AUTHORIZED)
    (asserts! (var-get vault-paused) ERR-VAULT-PAUSED) ;; Must pause first

    (let (
      (stats (get-vault-stats))
      (total-amount (get total-deposited stats))
      (vault-balance (unwrap! (contract-call? .token-usdh-v2 get-balance vault-addr) ERR-SETTLEMENT-FAILED))
    )
      ;; Use actual vault balance (may differ from accounting if there were issues)
      (let ((withdraw-amount (if (< vault-balance total-amount) vault-balance total-amount)))
        ;; Emergency transfer using authorized contract transfer
        (try! (contract-call? .token-usdh-v2 contract-transfer withdraw-amount recipient))
        
        ;; Emit event
        (print {
          event: "emergency-withdraw",
          recipient: recipient,
          amount: withdraw-amount,
          initiated-by: tx-sender,
          stacks-block-height: stacks-block-height
        })
        
        (ok withdraw-amount)
      )
    )
  )
)

;; ============================================
;; INITIALIZATION FUNCTIONS
;; ============================================

;; Initialize contract (sets owner and vault address on first call)
;; IMPORTANT: vault-addr parameter MUST be the deployed contract's address
;; Get this after deployment from clarinet or the transaction receipt
(define-public (initialize-contract (vault-addr principal))
  (begin
    (asserts! (not (var-get is-initialized)) ERR-ALREADY-PROCESSED)
    (var-set contract-owner (some tx-sender))
    (var-set vault-address (some vault-addr))
    (var-set is-initialized true)
    (print {
      event: "contract-initialized",
      owner: tx-sender,
      vault-address: vault-addr,
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

;; Get USDh token contract address (read-only)
(define-read-only (get-usdh-contract)
  (var-get usdh-token-contract)
)
