---
target: navbar (src/components/Header.tsx)
total_score: 18
max_score: 28
na_heuristics: 7,9,10
p0_count: 0
p1_count: 2
timestamp: 2026-08-31T06-13-29Z
slug: src-components-header-tsx
---
# Design Critique: Navbar (`src/components/Header.tsx`)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Cart badge pops on add, fuse ignites on add |
| 2 | Match System / Real World | 3 | Natural Spanish copy, recognizable game names/colors |
| 3 | User Control and Freedom | 1 | Games dropdown has no Escape-to-close, no arrow-key nav |
| 4 | Consistency and Standards | 3 | 44px hit-boxes, consistent tokens and collapse behavior |
| 5 | Error Prevention | 2 | No overflow guards on dynamic content |
| 6 | Recognition Rather Than Recall | 3 | Icons paired with visible copy or aria-labels |
| 7 | Flexibility and Efficiency | n/a | Not meaningful at navbar scope |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, restrained, one deliberate flourish |
| 9 | Error Recovery | n/a | No error states of its own |
| 10 | Help and Documentation | n/a | Not applicable |
| **Total** | | **18/28** | **Acceptable (64%)** |

## Design Specificity Verdict
Mostly generic navbar skeleton (logo-left/search-center/icon-cluster-right) with one genuinely bespoke element: the BombLootMark ignition motion. Detector flags the same elastic easing used deliberately across cart-bump and logo-spark as a generic bounce antipattern — correct mechanically, misses the intentional reuse.

## Priority Issues
- P1: Games dropdown fails keyboard/ARIA semantics (role="listbox" with no keyboard behavior; Escape confirmed not to close it live)
- P1: Zero trust/security signal in navbar for a fraud-sensitive marketplace (unlicensed code reseller); ShieldCheckIcon exists unused in icons.tsx
- P2: Browser tab title still reads "Loadout" post-rebrand to bombaloot
- P2: No overflow guard on dynamic text (long game names, long first names)
- P2: Cart badge has no cap for 3-digit counts

## Persona Red Flags
- Sam (accessibility): games listbox not keyboard-operable, ARIA role/behavior mismatch
- Jordan (first-timer): no trust cue before payment step in a hesitation-prone category
- Casey (mobile): search-mode collapses 4 elements simultaneously, jarring context swap

## Minor Observations
- ThemeToggle (52x30) hit-box matched to 44px but visual rhythm still reads shorter
- Games-dropdown JSX duplicated verbatim between desktop/mobile blocks
- Focus-visible relies on global rule except for search input's own explicit ring
