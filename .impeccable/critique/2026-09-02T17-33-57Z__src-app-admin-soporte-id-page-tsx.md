---
target: admin ticket detail (/admin/soporte/[id])
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-09-02T17-33-57Z
slug: src-app-admin-soporte-id-page-tsx
---
## Design Health Score
Total 18/40 (Poor). Best chat-thread implementation in the admin, sitting on a real state-machine hole.

## Design Specificity Verdict
Generic comment thread with status dropdown attached. List page color-codes status, detail page (where it's actually changed) uses bare select. Messages render as "Soporte" not the actual agent. detect.mjs clean.

## What's Working
Sender distinction genuinely works (right/left bubbles + visible Cliente/Soporte text label, confirmed live for screen readers too); "Responder como email" composer label; double-submit correctly guarded, confirmed live.

## Priority Issues
[P0] Replying to CLOSED ticket silently allowed, doesn't reopen it - verified live end to end.
[P0] Agent message bubble fails WCAG AA contrast - measured live, white on accent = 2.81:1, first hard contrast fail this run.
[P1] Status has no color cue on detail page despite list page color-coding the same field.
[P2] No confirmation/feedback for status/assignment changes - misclick risk, controls sit close together.
[P3] Composer fixed rows=4, no auto-grow, no char count - confirmed on 882-char reply.

## Persona Red Flags
Jordan: no explanation of Asignarme, no claim-before-reply gating, silent auto status flip.
Riley: long message confirmed no growth; double-submit confirmed safe; CLOSED-reply confirmed real defect.

## Minor Observations
CLOSED tone undefined; no max-height on message list; polling swallows failures silently; reply/status controls ARE properly labeled (positive, contrast to sibling pages' placeholder-only inputs).
