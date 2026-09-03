---
target: admin producto detail (/admin/productos/[id])
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-09-02T12-30-09Z
slug: src-app-admin-productos-id-page-tsx
---
## Design Health Score
Total 22/40 (Acceptable). Weak: Help(1), Recovery/Error prevention/Control/Consistency(2). Strong: Recognition/Aesthetic(3).

## Design Specificity Verdict
One real domain idea: ownership-gated code reveal. Everything else generic CRUD+file-manager. Raw English enums leak into Spanish UI. detect.mjs clean.

## What's Working
Ownership-gated reveal is real; one visual vocabulary across 3 zones; canEdit=false handled uniformly across all 3 components.

## Priority Issues
[P0] Deactivating a product has zero confirmation while deleting an image does - severity mismatch, ProductEditForm.tsx toggleActive.
[P1] Deleting primary image is irreversible with no reassignment, admin-images.ts deleteProductImage.
[P2] Status enums (AVAILABLE/VOID/etc) render untranslated inside Spanish UI/copy.
[P3] No pagination/bulk-select on a table whose schema allows 500 codes.
[P3] Code-edit input silently starts blank unless admin revealed first, can overwrite real code with blank.

## Persona Red Flags
Alex: no multi-select after bulk-add, no paste-preview before submit.
Riley: no maxLength on description despite 2000-char server cap; no format validation on bulk codes; inconsistent empty-state treatment between codes/images zones.

## Minor Observations
Two sources of truth for product counts; window.confirm breaks theming in dark mode; contrast confirmed live on all 4 code-status tones (7.40/7.20/5.76/4.90:1, all pass AA); solid label/heading/button-name accessibility floor.
