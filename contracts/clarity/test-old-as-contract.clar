;; Test if old as-contract (without ?) works in Clarity 4

(define-constant ERR-TRANSFER-FAILED (err u500))

(define-public (test-old-as-contract (amount uint) (recipient principal))
  (as-contract (try! (contract-call? .token-usdh transfer amount tx-sender recipient none)))
)
