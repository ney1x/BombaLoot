---
target: admin nuevo producto (/admin/productos/nuevo)
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T12-36-58Z
slug: src-app-admin-productos-nuevo-page-tsx
---
## Design Health Score
Total 17/40 (Poor). First page with a verified live backend bug, not just design gaps.

## Design Specificity Verdict
Server-side domain model well-designed (slug regex, unique constraint, price bounds) but none of it reaches the UI. Placeholders hardcoded to Valorant regardless of selected game. detect.mjs clean.

## What's Working
Sensible defaults mirrored server/client; tokenized visual language; substance exists server-side, integration gap not design gap.

## Priority Issues
[P0] Duplicate-id submission returns generic 500 instead of proper 409 - verified live, root cause: admin-products.ts:189 checks error.code instead of error.cause.code (Drizzle wraps pg errors), same bug class already fixed once in checkout-service.ts's isIdempotencyKeyConflict.
[P0] New products publish instantly live with isActive=true default, no draft option, verified live (0-code 0-image product appeared on public catalog immediately).
[P1] No success confirmation after creation - lands on near-identical form silently.
[P1] Game-agnostic placeholders hardcoded to Valorant "565"/"VP" regardless of selected game.
[P2] Client validation bounds (price/maxPerOrder/lowStockAt) don't mirror server max caps; field-level errors discarded on rejection.

## Persona Red Flags
Jordan: game select defaults silently to first game with no empty option; no post-submit confirmation product is live.
Riley: empty submit only native validation; duplicate id hits P0 bug; description has no maxlength despite 2000-char server cap.

## Minor Observations
No currency-formatted price preview; Descripcion field not marked optional; operational settings same visual weight as identity fields.
