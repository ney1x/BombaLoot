---
target: admin soporte list (/admin/soporte)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T17-21-47Z
slug: src-app-admin-soporte-page-tsx
---
## Design Health Score
Total 19/40 (Poor). Best heuristic score of run so far: Match Real World 4/4. Worst: Recognition/Recovery/Help/Consistency 1.

## Design Specificity Verdict
Card layout is right macro call for narrative ticket data, but 5 fields flattened into one unlabeled dot-joined sentence instead of structured layout. detect.mjs clean.

## What's Working
Honest search-scope copy; filter state survives round-trips; card format correct choice vs table.

## Priority Issues
[P0] OPEN and IN_PROGRESS share same warn tone - confirmed live, only tone rendered, most-needed triage distinction invisible.
[P0] No "waiting on us" signal - sorts by any activity including own replies, not oldest-unanswered.
[P1] Card accessible name runs everything together with no separator - confirmed live via screen reader name inspection.
[P1] Subtitle line unstructured prose, confirmed wraps unpredictably at mobile width, 54-char category labels exist.
[P2] Clickable cards have zero hover feedback unlike table rows on sibling pages.

## Persona Red Flags
Alex: cannot distinguish OPEN/IN_PROGRESS, cannot tell awaiting-reply from replied, no assigned-to-me filter.
Riley: long subtitle confirmed; special-char search safely parameterized (tested %, ', ", <script> live); LIMIT 200 no pagination.

## Minor Observations
CLOSED has undefined tone (looks like no-tone); "ticket(s)" english pluralization in Spanish copy; filter inputs placeholder-only labeled, confirmed live.
