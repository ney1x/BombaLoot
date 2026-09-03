---
target: admin pedidos list (/admin/pedidos)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-09-02T18-09-53Z
slug: src-app-admin-pedidos-page-tsx
---
## Design Health Score
Total 18/40 (Poor).

## Design Specificity Verdict
7-status to Spanish-label to tone mapping is half well-reasoned (deriveOrderStatus is derived not stale, explicit documented anti-alarm rule for REFUNDED), half unfinished visually (REFUNDED has no tone key, falls to flat gray). Three operationally distinct bad states render as visually identical red. detect.mjs clean.

## What's Working
Status model well-designed at data layer, single source of truth; GET-param filtering genuinely shareable/bookmarkable, Limpiar does true full reset; orderNumber/email search case-insensitive substring match, right default for support tool.

## Priority Issues
[P0] Status filter applied after LIMIT in SQL, silently hides real matches on stores with >50 recent orders - exact "paid but got nothing" support scenario can become invisible.
[P0] Status vocabulary and color don't survive click into detail page - list translates/color-codes, detail shows raw enum in flat accent badge for every status.
[P1] REFUNDED has no visual tone, falls to same style as unstyled placeholder despite unused accent tone existing.
[P2] AND-vs-OR filter logic invisible - combining fields silently narrows with no UI cue.
[P3] Backend-supported filters (paymentMethod/dateFrom/dateTo) fully implemented, not exposed in form.

## Persona Red Flags
Jordan: placeholder-only inputs, can't tell fields apart once populated; detail page's raw-enum badge un-teaches what list page just taught.
Riley: partial/case-insensitive search genuinely works; combining order-number+email gets silent AND-narrowing; status filter on >50 orders can return false "no results."

## Minor Observations
Badge font inconsistency between list (mono) and detail (body font); full-row hover implies whole row clickable but only order-number cell links; scope=col absent (repo-wide pattern, zero instances across every admin table); contrast good/warn/bad/default all pass AA (4.60/4.53/4.51/5.03).
