---
target: admin fidelizacion (/admin/fidelizacion)
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T17-56-16Z
slug: src-app-admin-fidelizacion-page-tsx
---
## Design Health Score
Total 16/40 (Poor). Page that changes live checkout pricing has less protection than a routine CRUD form, and has no edit UI at all.

## Design Specificity Verdict
Generic CRUD table with loyalty labels, structurally identical to DiscountsManager. No visual ladder, no customer-count-per-tier, no distinction "editing a row" vs "editing the pricing function." detect.mjs clean.

## What's Working
Subtitle states checkout dependency in plain Spanish; real server-side zod bounds + audit trail; client validation bounds correctly mirror server bounds, confirmed live.

## Priority Issues
[P0] No confirmation on tier deactivation - verified live, single unconfirmed click.
[P0] No cross-tier threshold validation - only caught by raw DB unique constraint with ambiguous error.
[P1] No edit form in UI despite backend fully supporting it (PUT endpoint unused) - only way to change a tier is toggle active/inactive, no delete UI either.
[P1] No visibility into how many customers a tier change affects.
[P2] Display order (sortOrder) fully decoupled from pricing order (minPurchases) - table can visually misrepresent real precedence.

## Persona Red Flags
Riley: deactivation confirmed single-click live; discountPct=0 silently valid; slug pattern validation broken by browser regex bug (found live).
Jordan: "best tier wins not cumulative" logic only in code comment, never surfaced.

## Minor Observations
scope=col absent (repo pattern); all form inputs properly labeled (positive); no page-level mobile overflow; badge contrast passes AA both themes; "Orden" defaults to tiers.length, latent breakage risk.
