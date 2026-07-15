# Plan 003 — Quality upgrade: rule inventory + enforce points (binding for executor)

> Executor: Sonnet implements → Opus audits → final gate reviews/commits (Art V). Each phase
> = 1 PR, stop-and-report. New lint = pure `checkXxx(html|css): Finding[]` + register +
> knowledge-pair + tests + dogfood-fire (Art II/III). No verbatim source text (grep clean).
> Rules distilled from harvests (design-starter-lab `harvest/*`); numbers are public-standard
> facts (WCAG/HIG/Material) or owner-corpus. Precision-first: when unsure, do not flag.

## Ràng buộc chung
Như spec 002 plan §Ràng buộc: `ui` deterministic, module <200 dòng, findings shape
`{checkId, severity, message, line?}`, register vào `CHECKS`/`WARNING_CHECKS` của workspace,
4 gates + `ui knowledge check`, test `cmd-*`/`*-checks*`, git explicit-path + hunk-sweep.

---

## P1 — Two highest-signal lints (proof phase)

**tap-target-undersized** (taste-lint or new mobile module; severity warning).
Principle: interactive controls (`<button> <a> <input> [role=button] [onclick]`) need ≥44×44px
hit area; adjacent tappables ≥8px apart. Static heuristic: flag interactive el with explicit
`h-`/`w-`/`min-h-` < 44px AND no compensating padding; icon-only button lacking
`min-h-[44px]`/`p-`. WHY: finger imprecision → mis-tap (top mobile-reliability failure).

**ai-cliche-gradient** (taste-lint; severity error — highest anti-slop signal).
Principle: a large background `linear/radial-gradient` whose stops sit in the ~270–330° hue
band (indigo/violet/magenta "AI glow") is the loudest machine-default tell. Parse gradient
stops → OKLCH/OKLab hue (reuse existing color math in `src/core/color-*`) → flag when
dominant large-surface gradient is in that band. WHY: signals cheap AI-default taste;
finance/enterprise contexts read it as untrustworthy. Precision: only large surfaces (hero /
full-bleed), not small accents; allow if a soul/persona explicitly declares that hue.

Knowledge pairing: extend `taste-rubric.md` (motion/color axes) + `page-structures.md`
(anti-slop tells). Tests: fixtures firing each; a passing fixture. Dogfood: run on ≥1 real
rebuild in the lab (composio/hashicorp for gradient; several for tap-target).

## P2 — Remaining web craft lints

- **font-scale-sprawl** (warning): count distinct `font-size` values in doc; warn > ~7,
  error > ~10. WHY: arbitrary sizes kill vertical rhythm, read as unauthored.
- **mode-invisible-surface** (error): low-alpha (<~0.15) white border/bg on a light-mode doc
  (and dark inverse) → invisible boundary that passes text-contrast but fails craft.
- **clickable-no-pointer** (warning): click-bearing non-native-button (`[onclick]`/`role=button`
  /clickable card) lacking `cursor:pointer`.
- **font-display-missing** (warning): `@font-face`/font `<link>` without `font-display:
  swap|optional` → FOIT + load CLS.
- **z-index-off-ladder** (warning): extend existing `z-index-inflation` — flag any z-index not
  on a declared scale (10/20/30/50…), not only all-nines.
- **unbounded-measure** (D3-gated, low severity): prose block whose nearest sized ancestor has
  no max-width or > ~80ch. Heuristic — ship low-severity or critique-only per D3.

Each: pure check + register + rubric/knowledge line + tests + dogfood-fire.

## P3 — Mobile machine floor (M1–M6)

New `src/core/layout-checks-mobile.ts` (registered in `layout-lint.ts` WARNING_CHECKS) +
additions to `a11y-checks.ts`:
- **M1 touch-target** (dup of P1 tap-target if shipped there — keep one home).
- **M2 tap-spacing** ≥8px between controls in an interactive flex/grid (`gap-0/1`).
- **M3 viewport-meta-present**: mobile-intended doc must have
  `<meta name=viewport content="width=device-width…">`; today `a11y-checks.ts` only flags
  bad meta (`user-scalable=no`), not missing.
- **M4 input-font-below-16** (taste-checks variant): `<input>` with `text-sm`/font<16 → iOS
  zoom-on-focus.
- **M5 safe-area**: `fixed`/`sticky` at a viewport edge (tab-bar, CTA-bar) without
  `env(safe-area-inset-*)`. Currently 0 occurrences of `env(safe-area` in `src/`.
- **M6 dvh-over-100vh**: extend `layout-checks-viewport.ts` — flag `100vh`/`h-screen` on
  containers (URL-chrome jump).
M7 (responsive-coverage) / M8 (gesture-only) = advisory, defer.

## P4 — Delivery-assets discipline (the "not a noob" fix)

- `knowledge/delivery-assets.md` (draft ready: lab `harvest/delivery-assets-rule-DRAFT.md`):
  resolution ladder (inline-SVG logo → harvested raster → sprite slice → crop last resort),
  failure modes (crop-includes-text, screenshot-as-hero, missing-DPR, provenance-loss).
- `resolve-assets` capability (lab prototype `_scratch/resolve-assets.mjs` proves it): rename
  harvested rasters by dimension, extract labelled inline SVGs, emit `ASSET-MAP.json`. Decide:
  ship as a `ui`/`design-os` command or as workflow guidance (executor picks, records why).
- lint **avoidable-screenshot-crop** (warning): `<img src="…/crops/…">` when a same-role real
  asset exists in `…/real/…`.
- Route in `knowledge/README.md` + workflow-experience "Preview/rebuild" section.

## P5 — Persona depth + generation contract (knowledge-only, no code)

- `knowledge/signature-devices.md`: composable device library (echo/ghost type, grain
  texture, light-leak bg, simulated chrome, blend-difference nav, viewport-scaled display
  type, marquee ticker, sticker-tilt, hand-drawn SVG annotation). Personas compose from it.
- 3 net-new persona directions (D2-gated): newsprint/print-journalism, neo-brutalist
  hard-shadow, serif-italic × mono-label. + fold "sentence-case prose" + "6:1 headline:body"
  into graphic/editorial personas.
- Generation contract in `knowledge/prompt-modes.md` (host-model side): RODES 7-layer
  skeleton (Role→Context→Task→Constraints→Art-direction→Anti-patterns→Output),
  classify-then-dress, persona-replaces-generic (named axes), two-layer anti-slop
  (global + persona avoid-list), freedom/constraint split (what-required, how-free),
  context-pinning (current year, no dated/placeholder framing).

## Phasing

| Phase | Scope | Depends | Note |
|-------|-------|---------|------|
| P1 | tap-target + ai-cliche-gradient | — | proof; 2 highest-value lints |
| P2 | 5–6 web craft lints | — | independent of P1 |
| P3 | mobile floor M1–M6 | D1 (web-only path OK without) | new layout-checks-mobile.ts |
| P4 | delivery-assets (knowledge + resolver + lint) | — | the "not a noob" fix; draft ready |
| P5 | signature-devices + persona + RODES contract | D2 | knowledge-only |

Owner decisions D1–D4 (spec.md) gate P3 scope, P5 persona count, D3 heuristic severity, and
the constitution amendment. P1/P2/P4 need no decision — safe to build first.

## Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Heuristic lints false-positive (unbounded-measure, ai-cliche edge) | precision-first, low severity, dogfood-calibrate before raising, D3 gate |
| ai-cliche-gradient flags a legit brand indigo | exempt when soul/persona declares the hue; only large surfaces |
| Native scope creep | D1 gate; native = knowledge workspace, never HTML lint |
| Source-text leakage | grep spec/knowledge for source strings before commit; all re-implemented |
| Persona roster bloat | D2 — signature-device library over literal personas |
