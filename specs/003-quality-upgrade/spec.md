# Spec 003 — Quality upgrade: make design:os produce the best result from ANY design.md/DS

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (two sources of truth), Art II (emitter+linter), Art III (real data),
Art V (three-tier pipeline), Art VIII (honesty floors)

## What

Fold the best machine-enforceable design rules from two external design brains
(ui-ux-pro-max-skill, MIT; EaseUI, owner-owned) plus the full-catalog dogfood learnings into
design:os, so any design.md/DS produces flawless output — **web AND mobile** — with
**original delivery assets** (never screenshot-crops). Detailed rule inventory + exact
enforce points: `plan.md`. Source harvest (distilled, no verbatim): the design-starter-lab
`harvest/` reports.

## Why

Owner goal (2026-07-15): "whoever feeds design:os a design.md or a DS must always get the
best possible output; mobile also flawless; delivery files carry the original assets, not
screenshots like a noob." Evidence: a 44-site dogfood surfaced ~28 rule-candidates and 8
knowledge gaps; the two harvested brains encode ~18 machine-checkable rules design:os does
not yet have, confirm ~12 it already has (right direction), and expose two strategic gaps
(no mobile coverage, no original-asset discipline).

## The upgrade, in five moves (detail in plan.md)

1. **Anti-slop + craft lints** (web, static, high-confidence): `tap-target-undersized`,
   `ai-cliche-gradient`, `font-scale-sprawl`, `mode-invisible-surface`, `clickable-no-pointer`,
   `font-display-missing`, `unbounded-measure`, `z-index-off-ladder`. Each = pure check +
   knowledge pairing (Art II). The two highest-signal — tap-target and ai-cliche-gradient —
   go first as proof.
2. **Mobile machine floor** (M1–M6): touch-target, tap-spacing, viewport-meta-present,
   input-font-16 (iOS zoom), safe-area-inset, dvh-over-100vh → `layout-checks-mobile.ts` +
   `a11y-checks.ts`. `env(safe-area-*)` is currently 0 occurrences in `src/`.
3. **Delivery-assets discipline** (the "not a noob" fix): `knowledge/delivery-assets.md` +
   resolver (`resolve-assets`) + `avoidable-screenshot-crop` lint. Originals first
   (inline-SVG logos, harvested rasters), crop last resort, `ASSET-MAP.json` provenance.
4. **Persona depth**: `knowledge/signature-devices.md` (echo-type, grain, light-leak,
   blend-difference, vw-type, marquee, sticker-tilt…) — the 23 personas encode DNA but not
   the distinctive *move*; + 3 net-new persona directions (newsprint, neo-brutalist
   hard-shadow, serif-italic×mono).
5. **Generation contract** (host-model side, for `/ui:from-design-md`): the RODES 7-layer
   skeleton (Role→Context→Task→Constraints→Art-direction→Anti-patterns→Output),
   classify-then-dress, persona-replaces-generic, two-layer anti-slop, freedom/constraint
   split, context-pinning → `knowledge/prompt-modes.md` / from-design-md adapter.

## Non-goals

- Native (iOS/Android SDK) linting from HTML — impossible statically; native is a separate
  knowledge workspace (`knowledge/mobile-native.md`) IF owner opts in (decision D1).
- Reproducing any source text — all rules re-implemented; attribution is courtesy (MIT +
  owner-owned confirmed).
- Heuristic checks shipping as hard errors before calibration (see D3).

## Owner decisions — RESOLVED (owner, 2026-07-16)

- **D1 — Native scope: RESPONSIVE-WEB ONLY.** Ship mobile M1–M6 as static lints in the web
  pipeline. No native (iOS/Android) knowledge workspace this round.
- **D2 — Persona: SIGNATURE-DEVICES LIBRARY + 3 net-new personas.** Mine the 36 ref styles
  into `signature-devices.md` for the existing 23 to compose from; add exactly 3 directions
  (newsprint, neo-brutalist hard-shadow, serif-italic×mono). Roster stays lean.
- **D3 — Heuristic checks: LOW-SEVERITY LINT.** Ship `unbounded-measure` (and similar) as
  warnings; accept some false positives; dogfood-calibrate before raising severity.
- **D4 — Cross-axis priority: RATIFY INTO CONSTITUTION.** Add the conflict-resolution order
  (a11y → tap → perf → layout → type/color → motion → decoration) as a constitution clause;
  a11y never loses to aesthetics. Amendment is its own commit (governance).

## Acceptance criteria (per phase, 3-tier pipeline)

1. Each new lint: pure `checkXxx` + registered + knowledge-paired + tests + dogfood run on a
   real rebuild that the check fires on. 4 gates + `ui knowledge check` green.
2. Delivery-assets: resolver runs on a probed site producing `ASSET-MAP.json`; lint fires on
   an avoidable crop; knowledge passes its own lint.
3. Every phase = 1 PR, human merge; no verbatim source text (grep clean for source strings).

## References

- Rule inventory + enforce points + tests: `plan.md`.
- Distilled harvests (provenance, licenses): design-starter-lab `harvest/web-rules.md`,
  `harvest/mobile-rules.md`, `harvest/delivery-assets-rule-DRAFT.md` (gitignored lab).
- Dogfood evidence: design-starter-lab `FINDINGS.md`, `CURATOR-REPORT.md`.
