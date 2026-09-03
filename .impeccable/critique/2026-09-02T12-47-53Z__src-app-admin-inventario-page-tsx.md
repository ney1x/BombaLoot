---
target: admin inventario (/admin/inventario)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-02T12-47-53Z
slug: src-app-admin-inventario-page-tsx
---
## Design Health Score
Total 20/40 (Acceptable). Weak: Control(1), Flexibility(1), Help(1). Strong: Error prevention/Recovery/Recognition(3).

## Design Specificity Verdict
Severity sort is correct and verified live (out,out,low,available x4 - matches source exactly) but under-reinforced visually. No in-UI distinction from sibling productos page - sidebar lists both flat with no grouping.

## What's Working
Severity sort genuinely correct, verified live; fuller status breakdown than productos; honestly read-only.

## Priority Issues
[P1] Two pages (productos/inventario), one dataset, no in-UI distinction anywhere - sidebar flat nav, only doc is a code comment.
[P1] No filter/search - shared.filterForm exists in CSS, unused here.
[P2] scope="col" missing on all 9 headers, confirmed live - same unfixed gap as productos, suggests shared-component fix.
[P2] Severity sort not visually reinforced beyond reading last column of every row.

## Persona Red Flags
Alex: severity sort alone doesn't scale past a handful of SKUs, no filter/search.
Sam: same scope=col gap as productos; no ARIA signal announcing pre-sorted-by-urgency order.

## Minor Observations
colSpan correctly matches headers; price column duplicated with unclear purpose here; no sticky header; contrast identical to productos (7.41/7.20/5.76, shared tokens confirmed).
