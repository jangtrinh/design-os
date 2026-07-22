# Tasks 008 — Cover & OG image (`/ui:cover`)

Dependency-ordered. Each becomes a GitHub issue (`stage:*` labels) per Article VII.
Prototypes in `reference/` are proven; productionize, don't re-derive.

- [ ] **T0 — Confirm script ship-home (blocking).** Decide committed path for the `.py` scripts
  (`scripts/cover/` recommended; NOT `.claude/`, gitignored). Output: a one-line decision in this file.
- [ ] **T1 — Port `compose_cover.py`.** Copy `reference/compose_cover.py` → `scripts/cover/compose_cover.py`
  verbatim (logic proven). Add `--help` smoke coverage. Depends: T0.
- [ ] **T2 — Port + refine `cover_lint.py`.** Copy `reference/cover_lint.py` → `scripts/cover/cover_lint.py`,
  then land the salient-content refinement (edge-density/local-variance so ambient key-light in a corner
  no longer errors; hard-edged text/subject still does). Keep the `{findings,errorCount,warningCount}` +
  exit-1 contract. Depends: T0.
- [ ] **T3 — Tests (Article III).** For T1: OG round-trip on a real 3:2 art (semicircle caps assert). For
  T2: passes the session's real DESIGN:OS cover (`specs/008.../reference` note the sample), errors on a
  synthetic corner-title. Depends: T1, T2.
- [ ] **T4 — Wire the `/ui:cover` verb.** Add `cover` to `VERB_SKILL_REFS` (`src/adapters/skill-refs.ts`)
  + update `tests/adapters-skill-refs.test.ts`. Create `templates/workflows/cover.md`: brief → resolve
  brand from DS (`ui ds` tokens; neutral fallback) → Codex gen with the anti-slop prompt template →
  compose → cover-lint → regenerate-once-on-error → deliver 2 files. Depends: T1, T2.
- [ ] **T5 — DS-brand resolution (D4 core).** In `cover.md`, specify reading the target project's
  compiled tokens for frame-color/ink/type/CTA; explicit "never impose DESIGN:OS/Higgsfield brand"; neutral
  fallback path when no DS. Depends: T4.
- [ ] **T6 — Real-data acceptance run.** `/ui:cover` on a real DS-bearing project; verify the cover's
  brand is THAT project's, and lint passes. Record the run in an execution report. Depends: T4, T5.
- [ ] **T7 — Four gates + audit.** `typecheck`/`lint`/`build`/`test` green; Opus audits diff-vs-spec and
  re-runs cover-lint on the real cover; final gate commits + pushes. Depends: T3, T6.

## Notes
- Article II: T1+T2 (emitter+linter) land together.
- Article IV: the salient-content detector is a shared helper — if a future `/ui:image` needs safe-zone
  checks, it reuses `cover_lint.py`, not a copy.
