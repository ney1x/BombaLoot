---
target: admin dashboard (/admin)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-02T11-58-51Z
slug: src-app-admin-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Health rows show timestamp+latency; metrics grid has no staleness/refresh indicator despite an unused refresh API already existing |
| 2 | Match System / Real World | 4 | Solid — correct COP formatting, domain-accurate Spanish |
| 3 | User Control and Freedom | 1 | Alert-toned metric cards are plain non-interactive divs — dead ends |
| 4 | Consistency and Standards | 2 | Severity communicated two different ways: text badge (Health) vs. color-only (Metrics) |
| 5 | Error Prevention | 3 | Read-only page, low error surface |
| 6 | Recognition Rather Than Recall | 2 | No active-nav indicator — aria-current is null on every sidebar link including the current page |
| 7 | Flexibility and Efficiency | 1 | No filters, no date range, no drill-down, no keyboard path |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and restrained; loses a point for an undifferentiated flat grid |
| 9 | Error Recovery | 0 | Zero try/catch around the dashboard's own SQL; no error.tsx anywhere under /admin |
| 10 | Help and Documentation | 1 | Warning thresholds exist only in code comments, never surfaced in UI |
| **Total** | | **20/40** | **Acceptable** |

## Design Specificity Verdict

LLM assessment: logic is domain-authored (real Wompi/PayPal checks, real thresholds, COP-correct copy) but the visual design is a template with labels swapped in — undifferentiated 9-card grid + flat status table, aggregated game-agnostic despite the business being organized per-game.

Deterministic scan: detect.mjs clean, zero findings across page.tsx/dashboard.module.css/admin.module.css/layout.tsx. Detector catches surface AI-slop, not structural genericness.

Visual overlays: injection blocked by this project's own CSP (script-src/connect-src 'self') — fallback to direct DOM/contrast inspection succeeded.

## Overall Impression

Bones are unusually honest (real telemetry, consistent tokens) but the page stops at "report," never "act" — every worrying number is a dead end, and the one failure mode that matters (the dashboard's own data fetch) has no safety net.

## What's Working

1. Health checks are real, not theater — genuine timed queries, runbook-hint messages, 7.41:1 contrast confirmed live.
2. Shared semantic color tokens across metric cards and health badges, 12+:1 contrast confirmed live on sampled tone cards.
3. Deliberate instrument-panel typography (num-display + Roboto Mono) gives this page a distinct register vs. the storefront.

## Priority Issues

[P0] No error boundary on the dashboard's own data fetch — src/server/services/admin-dashboard.ts. getDashboardMetrics has no try/catch; no error.tsx under /admin or root. Fix: mirror admin-health.ts's try/catch pattern, add src/app/admin/error.tsx.

[P1] Alert-toned cards are dead ends — src/app/admin/page.tsx (MetricCard). Stock bajo/Agotados/etc render as plain divs with no href/onClick. Fix: make tone-flagged cards Links to the pre-filtered relevant view.

[P1] Stray loading indicator remains live in the DOM after content loads — a role="status" aria-live="polite" element sits before the h1, collapsed to 1px but still exposed to assistive tech. Fix: find why app/admin/loading.tsx's fallback isn't unmounting cleanly.

[P1] Flat 9-card grid violates chunking with no compensating hierarchy — dashboard.module.css .metricsGrid. 5 of 8 cognitive-load checklist items fail. Fix: split into labeled subgroups reusing the existing sectionTitle style.

[P2] No active-page indicator in the sidebar — admin.module.css .navLink. aria-current is null on every nav link including the current page. Fix: compare pathname to item.href, apply aria-current="page" + active style.

## Persona Red Flags

Alex (Power User): alert cards have no href/onClick; no refresh control despite an unused refresh API already existing; no active-nav highlight.

Sam (Accessibility-dependent): metricLabel/metricValue are unrelated sibling divs with no aria-labelledby pairing; data-tone carries zero ARIA/text equivalent (color-only urgency signal); stray live-region spinner produces a phantom "Cargando" announcement.

## Minor Observations

- "Pedidos pendientes" never gets a tone despite being arguably as actionable as delivery problems.
- NOT_CONFIGURED renders in the same neutral gray as a non-issue.
- .healthMeta hides below a 600px width breakpoint rather than a zoom-aware one.
- Seed-data-empty dashboard is visually indistinguishable from "genuinely zero problems."
- Mobile (390px) responsive behavior is solid — no page-level overflow, verified live.

## Questions to Consider

1. What would this look like if every red number were a door, not a thermometer?
2. The health section proves specific, threshold-aware copy is possible — why does that rigor stop at the metrics grid?
3. Would a support agent's real question be "1 agotado," or "which game, and do I need to chase a supplier"?
