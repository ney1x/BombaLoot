---
target: admin reembolsos (/admin/reembolsos)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T17-37-38Z
slug: src-app-admin-reembolsos-page-tsx
---
## Design Health Score
Total 27/40 (Acceptable, but weighted read matters - the 2 weakest heuristics are the 2 that matter most for a money-moving page).

## Design Specificity Verdict
Highest-stakes page in the admin uses identical visual grammar to routine SKU lists. Best safety copy in the app sits in a container with zero visual escalation. detect.mjs clean.

## What's Working
Excellent risk-communication copy; real server-side race defense (re-validates status at UPDATE, orderId cross-check); full audit trail.

## Priority Issues
[P0] No re-entry friction/second approver for irreversible money attestation - single admin, checkbox + 2 loose text fields, immediately flips payment_status and emails customer.
[P0] errorMessage (why manual review needed) styled identically to routine metadata - the one field answering "why" is skimmable.
[P1] No visual differentiation between needs-action and already-resolved rows.
[P1] Null amountCop produces malformed confirmation sentence "? COP" inline in the attestation checkbox itself.
[P2] Sidebar gives zero visibility into pending manual reviews despite data being trivially available.

## Persona Red Flags
Riley: canExecute=false renders as plain disabled-looking text, undersells urgency; null-amount case is real reproducible broken-sentence scenario.
Jordan: copy answers "what" not "why manual review needed" - that field is exactly the one styled to disappear.

## Minor Observations
attemptCount fetched, never rendered; filter select placeholder-only labeled; page uses cards throughout, N/A for scope=col gap; trigger button leads with "Confirmar" before safeguard copy is seen.
