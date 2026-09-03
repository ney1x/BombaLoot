---
target: admin auditoria (/admin/auditoria)
total_score: 8
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T18-09-26Z
slug: src-app-admin-auditoria-page-tsx
---
## Design Health Score
Total 8/40 (Critical, lowest score of the 16-page run).

## Design Specificity Verdict
Raw table dump of audit_logs, not a forensics tool. Confirmed live at real volume (100-row cap reached from this session's own testing): security-relevant sequences sit with identical visual weight to checkout noise. detect.mjs clean.

## What's Working
Solid data model (append-only, no secret leakage by design); real zod validation bounds server-side; empty/loading states handled explicitly.

## Priority Issues
[P0] No entityId filter at all - the single most common investigative query, schema doesn't even define it.
[P0] Case-sensitive exact-match filters fail silently - verified live with exact row counts (case-mismatch and substring both return 0 rows, identical to "never happened").
[P1] No date range/pagination beyond silent 100-row cutoff - confirmed live, dataset exceeds 100, zero UI indication.
[P1] Raw unformatted unlinked JSON metadata - Detalle column measured 475.5px at 375px viewport live, no pretty-print, no entity links.
[P2] Zero severity/actor visual coding despite .badge system existing and used everywhere else in this admin.

## Persona Red Flags
Alex: cannot filter by entityId at all; no actor filter in UI despite schema support; no cross-links to actual records.
Riley: wrong-case/partial action filters confirmed live to return "Sin eventos" identically to true-empty - "exacta" is a trap not a safeguard.

## Minor Observations
scope=col absent (repo pattern); filter inputs placeholder-only labeled; no page-level mobile overflow (JSON/sidebar contained); metadata code text contrast excellent (14.4:1); placeholder samples only 3 of 9+ real entity types seen live; no export affordance for a compliance tool.
