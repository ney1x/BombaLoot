---
target: admin productos list (/admin/productos)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-02T12-17-59Z
slug: src-app-admin-productos-page-tsx
---
## Design Health Score
Total 20/40 (Acceptable). Weak: Consistency(1), Flexibility(1), Control(1). Strong: Match real world(3), Aesthetic(3).

## Design Specificity Verdict
Data model (available/reserved/paid+delivered) is genuinely domain-specific. Page itself is generic CRUD and inconsistent with sibling inventario/page.tsx which already has severity-sort + threshold column against the same data. detect.mjs clean.

## What's Working
Real codes-inventory model; badges never color-only (7.41/7.20/5.76:1 confirmed live); mobile table scroll correctly contained, zero page overflow confirmed live.

## Priority Issues
[P0] No scope="col" on any of 9 th headers - confirmed live (scope:null).
[P1] Missing severity sort + threshold column that sibling inventario/page.tsx already has against same data.
[P1] Dead nav link /admin/configuracion 404s - shell-level, affects all 16 admin pages (NAV_ITEMS in admin/layout.tsx references a page that doesn't exist on disk).
[P2] "Editar"/"Ver" link text not disambiguated per row for screen readers.
[P3] Stock severity badge doesn't survive click-through to detail page.

## Persona Red Flags
Alex: no filter/sort/bulk action, walled off from the actual triage workflow.
Sam: real semantic table (good foundation) but no scope=col, no caption, ambiguous repeated link text.

## Minor Observations
isActive=false has no data-tone (falls to neutral gray); STOCK_LABEL/STOCK_TONE duplicated verbatim between productos and inventario causing drift; default sort is alphabetical not severity.
