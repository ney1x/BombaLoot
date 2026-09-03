---
target: admin juegos (/admin/juegos)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T12-42-21Z
slug: src-app-admin-juegos-page-tsx
---
## Design Health Score
Total 19/40 (Poor). Weak: Error prevention(1), Help(1). Strong: Consistency(3).

## Design Specificity Verdict
Backend models placements/ordering/scheduling well; almost none reaches UI. Four identical cards, no per-game identity despite GAME_COLORS/GAME_MARKS existing. detect.mjs clean.

## What's Working
Domain model well thought out with clear code comments; storefront empty state good (sets unmatched bar); paste-URL fallback confirmed live on all 4 forms.

## Priority Issues
[P0] Zero dimension/aspect-ratio validation - mismatched image silently crops live via object-fit:cover on homepage.
[P0] sortOrder has no UI control, defaults to 0 for every insert - tie resolved silently by insertion time, not an edge case.
[P1] Heading structure skips H2 - confirmed live H1 to H3 directly.
[P1] Thumbnail hardcoded 72x30 (hero ratio) misrepresents showcase's portrait 0.75:1 ratio.
[P2] Zero per-game visual differentiation despite GAME_COLORS/GAME_MARKS existing.

## Persona Red Flags
Jordan: hero/showcase jargon unexplained near the controls; explanation scrolled away by game 3.
Riley: confirmed via source - same-slot sort_order=0 ties are default behavior, not edge case.

## Minor Observations
window.confirm inconsistent styling; no dedicated CSS module (all inline style); valid_from/valid_until scheduling exists in DB but unreachable in UI.
