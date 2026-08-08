# Implementation evidence — 2026-07-25 (spec 028, Amendment 2, corrections C1–C5)

This file is the tracked record of the G-now (G1–G6) clean-clone proof required by spec 028
§9.7 / tasks.md G6b (C4). It is a **create**: no other file in `docs/research/canvas-ui/` was
modified to produce it. Every number below traces to a command run in this session, verbatim,
with its exit code — nothing here is asserted from memory or from a prior session's report
(scar: a same-machine green, or a report not re-run at its own source, is not evidence — see
`guard-skip-is-a-silent-noop` and the "a report is not evidence" lesson in this repo's
`CLAUDE.md`).

Scope of this run: **Amendment 2's five corrections (C1–C5)**, applied on top of the
already-landed R1–R6 corrections (present in the working tree at session start, per
`tasks.md` READ FIRST 0c). This session did not redo R1–R6; it amended in place.

## 1. Temp-tree isolation

- **Temp tree:** created via `mktemp -d`, then `git clone --quiet "$(pwd)" "$TMP/ease-design"`
  — a local, read-only clone of the source tree on this branch
  (`spec/021-scrollworld-gflow-video-track`). Exit code: `0`.
- **No `design-os-hq` sibling:** `ls "$TMP" | grep -i hq` → no output (none found).
- **`references` and `taste` do not resolve there** (run from inside the clone):
  - `ls references` → `ls: references: No such file or directory`, exit `1`
  - `ls taste` → `ls: taste: No such file or directory`, exit `1`

This is the **one** carve-out to Group 0's no-copy rule (a local, read-only `git clone`); it is
**not** a carve-out to no-commit/no-push — nothing was committed or pushed to produce it, and
the temp tree was deleted at the end of this session.

## 2. Commands, verbatim, in run order, with exit codes

1. `git clone --quiet "$(pwd)" "$TMP/ease-design"` → exit `0`.
2. **Copy-in** (the clone carries only committed content, and this session commits nothing —
   copying the Group 0.5 allowlist's working-tree files into the temp tree is the only method
   available; per G2, this is not a workaround for a commit). Paths copied:
   - `knowledge/canvas-ui/README.md`, `knowledge/canvas-ui/catalog.json`,
     `knowledge/canvas-effect-direction.md`, `knowledge/README.md`,
     `knowledge/authoring-standard.md`
   - `templates/skills/canvas-effect.md`, `templates/workflows/generate.md`,
     `templates/workflows/refine.md`, `templates/workflows/redesign.md`
   - `src/adapters/templates.ts`, `src/adapters/skill-refs.ts`, `src/adapters/claude.ts`,
     `src/adapters/antigravity.ts`
   - `src/core/knowledge-effect-catalog-check.ts`, `src/core/knowledge-effect-catalog-parse.ts`
     (the new Art IX split module, C1), `src/core/knowledge-effect-matrix-emit.ts`,
     `src/core/knowledge-lint.ts`, `src/core/knowledge-link-check.ts`,
     `src/core/command-signatures.ts`
   - `src/commands/knowledge.ts`, `src/commands/knowledge-effect-matrix.ts`,
     `src/commands/init.ts`
   - `tests/knowledge-effect-catalog.test.ts`, `tests/knowledge-effect-matrix-emit.test.ts`,
     `tests/adapters-canvas-effect-routing.test.ts`, `tests/knowledge-lint.test.ts`,
     `tests/adapters-antigravity.test.ts`, `tests/adapters-claude.test.ts`,
     `tests/cmd-init-built-binary.test.ts`, `tests/cmd-init.test.ts`

   All 30 copies succeeded (no error output).
3. **`ls knowledge/canvas-ui/` — read BEFORE any exit code** (scar
   `guard-skip-is-a-silent-noop`): output —
   ```
   README.md
   catalog.json
   ```
   Both files present.
4. `npm ci` → `added 267 packages, and audited 271 packages in 4s` (8 pre-existing vulnerability
   advisories, unrelated to this change, not remediated by this task). Exit code: `0`.
5. `npm run typecheck` (`tsc --noEmit`) → no output, exit code `0`.
6. `npm run lint` (`eslint src tests`) → no output, exit code `0`.
7. `npm run build` (`tsup`) → `ESM dist/cli.js 958.55 KB` / `⚡️ Build success in 44ms`. Exit
   code: `0`.
8. `npm test` (`vitest run`) → `Test Files  157 passed (157)` / `Tests  2361 passed | 6 skipped
   (2367)`. Exit code: `0`.
9. `node dist/cli.js knowledge check` → `knowledge check: <temp>/knowledge — 0 findings.` Exit
   code: `0`.

**All nine commands green.** Full output was reviewed, not sampled.

## 3. Grep proofs (G5), real output, working tree not the git index

Run inside the temp tree, over the copied-in files (the same content as the working tree's
allowlisted paths — the only files this task added or amended):

- `grep -rn 'references/canvas-ui' knowledge templates src tests` → **0 hits.** (Spec §8.4
  records 31 hits at the pre-reopen draft's location; this session did not re-measure that
  historical count itself — it is cited from the spec, not re-verified here — but the
  post-migration state it predicts, zero, is what this grep confirms directly.)
- `grep -rn 'ease:source ref="references/' knowledge` → **0 hits.**
- `grep -rn 'ease:source ref="taste/' knowledge` → **0 hits.**

## 4. Trackability proxy (G6), per new path — run in the actual working tree (not the disposable clone)

| Path | `git check-ignore -v` exit | `git status --porcelain` |
|---|---|---|
| `knowledge/canvas-ui/README.md` | `1` (not ignored) | `?? knowledge/canvas-ui/README.md` |
| `knowledge/canvas-ui/catalog.json` | `1` (not ignored) | `?? knowledge/canvas-ui/catalog.json` |
| `src/commands/knowledge-effect-matrix.ts` | `1` (not ignored) | `?? src/commands/knowledge-effect-matrix.ts` |
| `src/core/knowledge-effect-catalog-parse.ts` | `1` (not ignored) | `?? src/core/knowledge-effect-catalog-parse.ts` |
| `docs/research/canvas-ui/implementation-evidence-260725.md` | `1` (not ignored) | `?? docs/research/canvas-ui/implementation-evidence-260725.md` |

**This is a proxy, not a proof** — "not ignored + shown as `??` untracked" means the path is
capable of reaching the repository on a future `git add`/`git commit`, which this session does
not perform. It does not itself prove the file is, or will be, committed.

## 5. Group 0.6 isolation result

Baseline (`git diff`) captured for the five protected modified paths **before any edit in this
session**, then re-captured after all C1–C5 edits:

- `feedbacks/README.md` — byte-identical.
- `figma-agent/plugin/manifest.json` — byte-identical.
- `figma-agent/plugin/src/ui/ui-relay.ts` — byte-identical.
- `figma-agent/plugin/ui.html` — byte-identical.
- `specs/015-world-class-learning-loop/research/higgsfield-reference-ledger.md` —
  byte-identical.

Full-tree `git status --porcelain` diff, before vs. after: **one line added** —
`?? src/core/knowledge-effect-catalog-parse.ts` (the Art IX split module the C1 correction
required, on the Group 0.5 allowlist). No other status-line change, no protected path touched.

Baseline four-gate state (recorded before any edit, in the working tree): typecheck / lint /
build all clean; `npm test` — `Test Files 157 passed (157)`, `Tests 2351 passed | 6 skipped
(2357)`. Post-change working-tree state: same four gates green; `npm test` — `Test Files 157
passed (157)`, `Tests 2361 passed | 6 skipped (2367)` (10 new tests: 5 row-drift cases (E1b) + 2
provenance one-finding cases (D9c) + 3 T6e cases (E7d)).

## 6. G-CI (G7) — read-only status today

`.github/workflows/ci.yml` verified read-only: `checkout` + `npm ci` + the four gates + `node
dist/cli.js knowledge check`, on `ubuntu-latest`, no symlink anywhere in the job. `gh run list
--branch spec/021-scrollworld-gflow-video-track --limit 5` shows the branch's most recent run —
`success`, against an earlier commit that predates this session's uncommitted C1–C5 changes.

**G7 is pending — blocked on owner.** It has not run against this session's changes (nothing
was committed or pushed), and this session is not authorized to commit or push to make it run.
Not passed, not failed: unrun.

## 7. What this does not prove

- **The files are not committed.** G-now is a copy-in proxy (§4 above), not a commit; G6's
  trackability check shows the paths are capable of being tracked, not that they are.
- **G-CI (G7) has not run** against these changes — see §6. Its absence today is expected, not
  a failure, and is not itself evidence of anything about the change's correctness.
- **T6a–T6e and T7 (`tests/adapters-canvas-effect-routing.test.ts`) are substring/structure
  checks.** They do not prove "no upstream source" — they cannot detect a paraphrase, a renamed
  identifier, an algorithm described in prose, or upstream text reflowed into DESIGN:OS's own
  voice. That residual risk is closed only by the diff audit (spec E7c), a human act this
  session's report describes but a fresh reviewer should still perform independently.
- **The spec §10 benchmark (Group F) has not run.** No capability (a/b/c) evidence — desktop,
  mobile, reduced-motion, unsupported-browser, or trial-absent captures — was produced in this
  session; Group F is owner-gated and explicitly does not block implementation-complete.
- **Owner-run items are open:** a real low-power/mobile-GPU device and WebGL context-loss
  recovery (F4) — headless Chromium cannot substantiate either, and this session made no attempt
  to.
- **The §12.1 license interpretation (MIT + Commons Clause, for the install-handoff blocks) is
  an open owner decision (F7).** Nothing in this session resolves it; if it lands adverse, the
  two `ease:install-handoff` blocks are deleted and the suite re-run.
