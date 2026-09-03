---
target: admin descuentos (/admin/descuentos)
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T18-04-15Z
slug: src-app-admin-descuentos-page-tsx
---
## Design Health Score
Total 16/40 (Poor). Densest schema (10 fields) of any admin form, least structural scaffolding.

## Design Specificity Verdict
All 4 Fidelizacion sibling patterns confirmed independently: no confirm on deactivate, no cross-record validation beyond DB constraint, no edit UI despite full backend support, no affected-orders visibility. NEW finding: startsAt/endsAt fully modeled in schema/validation/redemption but zero UI anywhere, confirmed by both assessments independently. detect.mjs clean.

## What's Working
scopeRef UI-constrained not free text; economically dangerous math well-guarded server-side (PERCENT cap, race-safe usage counting); code field placeholder is rare good inline help.

## Priority Issues
[P0] No UI path to time-limited promos at all - startsAt/endsAt exist end-to-end server-side, zero UI, confirmed independently by both assessments.
[P0] Validation failures collapse to generic message - verified live (PERCENT=150 test), same recurring pattern as Usuarios/Seguridad/Nuevo Producto.
[P1] No edit UI despite complete race-safe backend (PUT endpoint unused).
[P1] No friction on unlimited-exposure coupons - maxUses/stackable combo has zero warning.
[P2] Table loses friendly scope label the create form just showed - reverts to raw GAME/id.

## Persona Red Flags
Riley: scopeRef injection blocked by UI (positive); CAN trivially create unlimited stackable 100%-off coupon with zero warning; cannot test endsAt<startsAt via UI (field doesn't exist).
Jordan: scope/scopeRef well-explained at input time (bright spot); "Apilable" checkbox actively misdescribes function - actually governs loyalty-discount combination not multi-coupon stacking.

## Minor Observations
scope=col absent (repo pattern); all 8 controls properly labeled (positive); no page-level mobile overflow; value input has min but no max despite kind being known client-side; minSubtotalCop invisible after creation; contrast 7.4:1 confirmed live.
