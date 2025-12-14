;; Test as-contract? with FT transfer

(define-constant ERR-SETTLEMENT-FAILED (err u500))

(define-public (test-transfer (amount uint) (recipient principal))
  (unwrap! (as-contract? ((with-ft .token-usdh amount))
    (try! (contract-call? .token-usdh transfer amount tx-sender recipient none))
    true
  ) ERR-SETTLEMENT-FAILED)
)
