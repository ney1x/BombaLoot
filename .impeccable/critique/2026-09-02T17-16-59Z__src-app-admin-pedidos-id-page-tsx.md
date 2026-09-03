---
target: admin pedido detail (/admin/pedidos/[id])
total_score: 12
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-02T17-16-59Z
slug: src-app-admin-pedidos-id-page-tsx
---
## Design Health Score
Total 12/40 (Poor, lowest this run). Weak: nearly everything, 1s across the board except partial 2s.

## Design Specificity Verdict
Generic table-dump, not a dispute tool. Status vocabulary degrades progressively worse per section (header has tone at least, codes/payments/refunds get worse each). Diagnostic fields (lastPaymentError, deliveredAt, buyerName) fetched but never rendered - strongest evidence of scaffolding not real tool. detect.mjs clean.

## What's Working
CancelFraudAction well-built in isolation; codes show fingerprint only never plaintext with explanation; payments/refunds fetched newest-first.

## Priority Issues
[P0] lastPaymentError/paidAt/deliveredAt/buyerName fetched, never shown - the exact fields that answer "why is this stuck."
[P1] Status vocabulary degrades further per table - codes untoned badge, payments plain text not even badge, refunds toneless badge-as-link.
[P1] "Cancelar por fraude" generically labeled for a state (PAYMENT_EXPIRED) that's routine timeout as often as real fraud.
[P2] Reembolsos section positioned by document order not relevance - buried 4th of 5 when it's usually the reason agent is here.
[P2] Silent 100-row audit cap, no UI signal.

## Persona Red Flags
Jordan: no fast path to "did customer get code" - must reconcile 3 separate raw signals manually.
Riley: zero-payments/zero-refunds case is this exact seeded order; multi-attempt payments have no "current" marker; audit silently truncates.

## Minor Observations
buyerName fetched unused; inline style instead of CSS class on fraud card; zero scope=col on all 4 tables (repo-wide pattern confirmed again); mobile page-level fine but all 4 tables individually overflow their wrap (contained, by design).
