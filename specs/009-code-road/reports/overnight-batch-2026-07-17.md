# Overnight batch — 2026-07-17 (owner asleep, "làm hết đi, làm xong thì test")

Four PRs built, gated, CI-green, merged to `main`, and verified end-to-end on real data.
`main` @ `50ee618` · 138 test files · 2098 tests · four gates + `ui knowledge check` green.

## What landed

| PR | what | measured before → after |
|---|---|---|
| **#81** | scan: ancestor-based component detection · honest `truncated` · `imported-ds` STOP-gate linter | component discovery **25% → 58%** of the corpus; `truncated` false-alarms 4/10 → 2/10 |
| **#82** | kit responsive dimension: counted `rem` breakpoint scale · Table reflow · a linter that fails a component with no responsive story | kit `@media` breakpoints **0 → present**; a floor that can *see* the absence (26/27 fail on purpose, list pinned for P2) |
| **#83** | a11y: recognize `-text`/`-bg` pairing synonyms (F11) | dana a11y **1540 cartesian / 1011 false failures → 13 paired / 1 REAL failure** (`badge-info-text` 4.1:1, surfaced not suppressed) |
| **#84** | the ENFORCEMENT linter `ui ds-usage-lint` — the missing gate | a page with undeclared tokens + hardcoded colour passed all 4 floors; now caught |

## End-to-end verification (rebuilt from main, real data)

```
ENFORCEMENT gate on out-A.html (real generated page):  2 hardcoded, 61 off-system, 0 undeclared
F11 on dana:                                           13 pairs, 1 real failure (was 1011)
scan on dana:                                          componentDirs 10, cssFiles 3 (was 0/0)
kit responsive-lint:                                   shipped, kit compiles
suite:                                                 2098 passed
```

## The big steer — your mindset message reframed the architecture

> *"Whatever DS the user's codebase or figma are using, we should respect them. Our job is
> helping them continue develop their DS and their design works."*

This **answers the biggest open question** (the token-mapping "join" I flagged for your morning
review). The answer: **do not impose our vocabulary; recognize theirs, help theirs grow.** I
captured it in memory (`respect-their-ds-mindset.md`). It reframes three things already built:

- **The 13-system role dictionary** (researched today) is for **recognition, not conversion** —
  understand that dana's `surface-content` plays the `background` role *without renaming it*.
- **The ENFORCEMENT linter's `off-system-token` warning** is the mindset in code: *"--surface-card
  is not in your DS — add via `ui ds change-token`."* It surfaces gaps in **their** DS for **them**
  to fill. The 14 tokens the generation experiment measured are 14 gaps to help fill, not remap.
- **F11 (#83) is the pattern already applied**: taught the tool dana's `-text`/`-bg` convention
  instead of forcing shadcn's `-foreground`. Make the tool bilingual; respect their names.

## Deliberately NOT done (waiting on you)

- **The token-mapping engine** — now scoped by the mindset (recognition + help-grow, lossless via
  DTCG `$extensions`, never a "convert to shadcn" step). This is the big strategic build. It still
  needs: appetite, and whether to start with name-recognition (built: the dictionary) before the
  usage-inference mechanism (the unbuilt hard part — for the 22–100% of colours that are stock
  primitives with no role in the name).
- **Kit P2/P3** (spec 010) — P2: make the other 26 kit components reflow (the pinned list); P3: the
  25 measured-missing components. P3 needs your taste calls per component.

## Small tunables flagged (not blocking, your call)

1. `ds-usage-lint` off-system count is per-occurrence (61); the actionable number is per-name (14).
   A `--distinct` summary line makes it a clean "add these N to your DS" list.
2. `ds-usage-lint` `hardcoded-color` is ERROR (right for generated output — use the DS you were
   given). If it ever lints a user's existing hand-written code, warning may fit; flag when that
   surfaces.
3. `dana` still has **1 real a11y bug**: `badge-info-text` on `badge-info-bg` is 4.1:1 (needs 4.5).
   Their token to fix, surfaced by the now-quiet a11y audit.
4. `project-scan.ts` is 278 lines (over Art IX's ~200, was already over before #81) — a
   `project-scan-walk.ts` split is a clean follow-up.
5. `docs/` into `SKIP_DIRS` — measured earlier (3/11 projects hold UI files under `docs/`, every
   other decoy name 0); a one-line follow-up to `project-scan.ts` that deletes the hvs stale-demo
   confusion the P4 gate found.

Nothing is half-finished. Every landing is measured, gated, and verified on real projects.
