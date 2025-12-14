;; Test exact syntax from documentation
(define-constant recipient tx-sender)

(define-public (foo)
  (as-contract? ()
    (try! (stx-transfer? u1000000 tx-sender recipient))
  )
)

(define-public (bar)
  (as-contract? ((with-stx u1000000))
    (try! (stx-transfer? u1000000 tx-sender recipient))
  )
)
