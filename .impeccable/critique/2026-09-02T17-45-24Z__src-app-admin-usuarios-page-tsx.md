---
target: admin usuarios (/admin/usuarios)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-09-02T17-45-24Z
slug: src-app-admin-usuarios-page-tsx
---
## Design Health Score
Total 20/40 (Acceptable). Role-change action has less friction than deactivating a product's stock badge.

## Design Specificity Verdict
Generic CRUD table wearing "user management" label. Rich AdminUserDetail endpoint (spend, orders, loyalty tier, sessions) exists server-side, completely unused in UI. detect.mjs clean.

## What's Working
Server-side authorization genuinely solid, independently verified (self-suspend/self-role-change/suspend-admin all blocked server-side regardless of client UI); search correctly parameterized; role/status never color-only.

## Priority Issues
[P0] Role change fires instantly on click, zero confirmation - verified live via real mutation test (200 OK, no dialog).
[P0] Server's specific validation messages discarded (data.fields dropped) - verified live, generic "Datos invalidos" shown instead of helpful server message.
[P1] Action controls (suspend/role buttons) scroll off-screen first at common laptop widths (1024x768 verified).
[P2] No page-level acknowledgment that suspension revokes all active sessions.
[P3] Rich decision-support data (spend, loyalty tier, sessions) exists server-side, never shown.

## Persona Red Flags
Riley: self-protection confirmed live and in source (independent server checks); real gap is role-change has zero friction for a misclick.
Sam: role/status never color-only; suspend reason only reachable via hover-only tooltip, invisible to keyboard/touch.

## Minor Observations
scope=col absent (consistent with repo pattern); no page-level mobile overflow, table scrolls internally; contrast confirmed live across all 5 badge tones, all pass AA; Reactivar fires instantly (deliberate asymmetry, restorative direction).
