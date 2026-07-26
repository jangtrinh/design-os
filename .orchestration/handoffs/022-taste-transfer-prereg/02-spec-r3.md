# Spec 022 — Stage-2 fix specification r3 (Stage-6 amendment implementation)

Status: frozen fix direction for a narrow Stage-3 r3 correction.
Authority: Fable 5 Stage-6 `VERDICT: REJECT` (`/private/tmp/fable-prereg-stage6-review.md`)
and `02-spec-r2-stage6-amendment.md` items 1–9.

## Why r3 exists

The r2 wave implemented F1–F8 of `02-spec-r2.md` and left the pre-freeze gate green
(`--mode pre-freeze --corpus /private/tmp/mengto-skills` → 0 errors, 0 warnings, verified
2026-07-26 10:56). It did **not** implement the Stage-6 amendment. r3 implements the amendment
and nothing else.

**Preserve everything r2 built.** Do not restructure modules, do not rewrite check semantics that
r2 already fixed, do not change frozen candidate/brief/patch/selection content, and do not touch
the 30 media asset bytes. r3 is additive/corrective on the r2 snapshot.

## Verified current state (do not re-derive; act on it)

| Amendment item | State on the r2 snapshot |
|---|---|
| 1 P7 media identity neutrality | **NOT DONE.** `prompt-assembler.mjs:121-138` deliberately *tolerates* `supplied_assets` ids that embed the brief id. |
| 2 Bundle asset neutrality | **NOT DONE.** `build-judging-bundle.mjs` copies artifact HTML + screenshots only; no supplied-media copy, no ref rewrite, no output identity scan. |
| 3 Frozen documentation truth | **NOT DONE.** `spec.md:206-223` still asserts `"assets": []` / expected-RED / "freeze is blocked"; `assets/brief-media-manifest.json:4` `note` still says the pack is missing; `roles.md:19-21` describes assembly as "brief JSON"; test titles still stale. |
| 4 Boundary-safe judging scan | **PARTIAL.** `checks-judging.mjs:55-57` boundary-matches candidate IDs (good, keep), but `:11` `LEAK_TOKENS` incl. `"control"`/`"treatment"` are still bare `.includes()` at `:61-62`. |
| 5 Real brief facts | **NOT DONE.** `build-judging-bundle.mjs:427-430` writes a one-line placeholder. |
| 6 Complete frozen set | **DATA DONE, GUARD MISSING.** `FROZEN_FILES` (constants.mjs:49-127) lists all 5 scripts, all 23 `scripts/lib/*.mjs`, all 12 schemas. No test fails when a production module is omitted. |
| 7 Pinned custody path | **NOT DONE.** `checks-commitment.mjs:38-46` only rejects paths inside the repo. |
| 8 Safe commitment-tooling proof | **NOT DONE.** No sandbox-`HOME` test exists. |
| 9 Later-mode evidence absence is an error | **DONE** (`checks-judging.mjs:18-24`, `checks-run-evidence.mjs:72-78`). Verify no other check module still warns where evidence is required; fix any straggler. |

## R1 — P7 supplied-asset neutralization (amendment 1; B4)

Nine briefs carry `supplied_assets` (`PA-MED-1..3`, `PB-P1-1..3`, `PB-P2-1..3`), each entry
`{ asset_id, manifest_ref }` where `asset_id` is `<brief_id>-<role>-<n>` — it reconstructs the
Phase-B candidate (`PB-P2-1-headshot-1` → P2) and the Phase-A family.

In `prompt-assembler.mjs`, the canonical projection must replace every `supplied_assets` entry
with a deterministic, role-indexed neutral alias:

```
{ "asset_ref": "asset-<role>-<n>", "role": "<role>" }
```

- `<role>` is read from the frozen `assets/brief-media-manifest.json` record for that `asset_id`
  (`wide` | `macro` | `portrait` | `headshot` | `directory-headshot` | `presskit-headshot`).
  Never infer the role from substrings of the id.
- `<n>` is the 1-based index of the entry **within its role group, in the brief's own committed
  `supplied_assets` order**. Stable, derived only from committed bytes.
- `manifest_ref` is dropped entirely. No other key survives.
- The transform is arm-independent, so both arms of a pair receive byte-identical projections
  except for the treatment patch — arm equality holds by construction, as before.
- Retain the role fact so the arm can still build the brief; the manifest's `required_roles`
  ratio contract remains the arm-visible source of dimension guidance.

Signature: `projectBrief(brief, phase, { assetRoles })` where `assetRoles` is a
`Map<asset_id, role>` built from the frozen manifest by a small exported helper
(`assetRoleMap(manifestObject)`). If a brief references an `asset_id` absent from the map,
**throw** — fail closed; never emit an alias for an unknown asset.

Update `arm-prompt-template.md` §"Assembly rule" / the supplied-asset paragraph and `spec.md` §P7
to describe this exact transform (both are frozen prose that must not lie).

## R2 — PR-020 rejects original asset identity (amendment 1; B4/B5)

`promptTextLeaks` must be strengthened, and its current "media ids legitimately survive" comment
and carve-out deleted:

- Reject the `brief_id` as a standalone token (keep the existing boundary regex).
- Additionally reject **any** of the 30 frozen `asset_id` values and **any** of the 30 frozen
  manifest `path` values appearing anywhere in the assembled prompt bytes, matched as
  boundary-delimited tokens (`asset_id`) and as plain substrings (`path` — it contains `/` and is
  unambiguous).
- Reject the literal `manifest_ref` prefix `assets/brief-media-manifest.json#`.
- Keep the existing probe-prose leak checks unchanged.

PR-020 already consumes `assembleArmPrompt`; wire the manifest through so every recomputation
runs this scan and produces an `error` finding.

Tests: for each of the nine media briefs, assert (a) the projection contains no `asset_id`,
`manifest_ref`, brief id, candidate id, or family; (b) role and alias index are correct;
(c) control and treatment projections are byte-identical; (d) a mutated assembler that leaves the
original ids in place makes PR-020 fire.

## R3 — Judging-bundle media neutrality + real brief facts (amendments 2 and 5; B9/B11)

All of this happens in `build-judging-bundle.mjs`, inside the existing **preflight-then-write**
structure. Nothing may be written until every presentation preflights clean.

1. **Supplied media copy + reference rewrite.** During preflight of each side, scan the primary
   artifact HTML for references to spec media — any frozen manifest `path`, any `asset_id`, and
   any P7 neutral alias (`asset-<role>-<n>`). For each distinct hit resolve the underlying file
   under `assets/brief-media/`, verify it is a regular non-symlink file whose SHA-256 equals the
   frozen manifest `sha256`, and plan a copy into the bundle as
   `<codename>.media-<role>-<n><ext>` (`<n>` = per-side, per-role 1-based order of first
   appearance; `<ext>` from the frozen path). Rewrite the HTML reference to the bare bundle-local
   filename. Reuse the existing containment/symlink/hash helpers — do not add a second path-safety
   implementation.
2. **Real `brief-facts.md`.** Replace the placeholder. Load the frozen brief named by the run
   manifest's `brief_id` from `phase-a-briefs.json` / `phase-b-briefs.json`, run it through the
   canonical `projectBrief` (R1), and render deterministic markdown that states the surface to
   judge: the projected requirement/content facts, acceptance-check text, and the neutral asset
   list (`asset-<role>-<n>`, role). Never emit `brief_id`, `candidate_id`, `family`, `ordinal`,
   arm labels, patch text, or the probe fields P7 removes. Both sides of a pair share one brief,
   so emit `brief-facts.md` once per presentation.
3. **Output identity scan, fail-closed, before write.** After computing all planned bytes and
   filenames for a presentation, scan every planned filename and every planned text output
   (`*.html`, `brief-facts.md`) for: the 30 `asset_id`s, the 30 manifest `path`s, the 12 candidate
   IDs, the 4 family names, all 52 brief IDs, the arm labels, and the source-identity strings from
   the manifest (creator, licence label/URL, Commons file URL, original URL, derivative URL,
   `commons.wikimedia.org`, `upload.wikimedia.org`). Short tokens (candidate IDs, family names,
   arm labels) use boundary matching (R4's shared matcher); long tokens use substring. Any hit is
   a `fatal` that aborts before any bundle directory is created.

Tests (extend `tests/spec-022-judging-bundle.test.ts`): a positive fixture whose artifact HTML
references two media assets produces a bundle with codename-neutral media filenames, rewritten
refs, and a non-placeholder `brief-facts.md`; and isolated negatives for a media file whose bytes
no longer match the manifest hash, a media symlink, an artifact HTML that leaks a candidate ID,
and a brief-facts projection asked to render an unknown `brief_id`.

## R4 — Boundary-safe identity matching, centralized (amendment 4; B6)

Extract one shared matcher module (`scripts/lib/identity-tokens.mjs`) exporting:

- `boundaryTokenRegex(token)` — the word-boundary regex used by `checks-candidates.mjs:129-143`;
- `scanIdentityTokens(text, { boundaryTokens, substringTokens })` → array of matched tokens.

Rewire `checks-judging.mjs` (`LEAK_TOKENS` `"control"`/`"treatment"` become **boundary** tokens;
`"mengto"`/`"neuform"`/selection slugs stay substring; candidate IDs keep their existing boundary
behaviour via the shared helper), `checks-candidates.mjs`, and the R3 bundler scan onto it. Add
the frozen `asset_id`s (boundary) and manifest `path`s (substring) to PR-023's banned set so
`brief-facts.md` and rewritten HTML are covered.

Regressions: assert `"controls"`, `"# controlled vocabulary"`, `#1a1a1a`, `a1b2c3d4` codenames and
`d1e2f3a4` do **not** fire; assert `control`, `treatment`, ` A1 `, `"P2"`, `PA-MED-1-wide-1` and
`assets/brief-media/…jpg` **do** fire. Carry forward the `checks-candidates.mjs` comment's warning
against reverting to `.includes()`.

## R5 — Frozen documentation truth (amendment 3; B1/B2/B3 + roles.md concern)

Rewrite every line that contradicts the shipped pack. The pack is complete: 30 assets, roles
wide 9 / macro 6 / portrait 4 / headshot 4 / directory-headshot 6 / presskit-headshot 1, all
SHA-256-verified, all CC0/PD/CC BY(-SA), identity disclaimer on all 15 person-bearing assets.

- `spec.md:206-223` — replace the "Current media-pack blocker (P4)" section with a record of the
  resolved pack: what it contains, that PR-014 is green against it, and that the gate was never
  relaxed to get there.
- `spec.md` §P7 — describe the R1 neutralization.
- `assets/brief-media-manifest.json` `note` — replace the stale "freeze is blocked" text with a
  truthful note describing the complete pack and its provenance discipline. Do not alter any
  asset record.
- **Record the amendment to the media pin.** In `spec.md` (and mirrored in the manifest note):
  the HANDOFF's original pin was licence-cleared **local/project** assets only; the
  owner/coordinator subsequently amended it to authorize a **Wikimedia Commons-derived,
  licence-cleared pack** with per-asset creator, licence label/URL, Commons file URL, original
  URL, derivative URL, source SHA-1, source revision timestamp and crop method recorded for
  post-hoc audit. State this as an explicit owner/coordinator amendment, not as a builder
  decision.
- `roles.md:19-21` — the builder receives the **P7 arm-visible projection**, not raw brief JSON;
  sync the wording with R1.
- `tests/spec-022-prereg.test.ts` header (`:1-12`) and the stale title near `:766` — remove any
  claim that the pack is absent or expected-RED.
- Sweep: `grep -rn "freeze is blocked\|expected to fail RED\|assets\": \[\]\|genuinely absent"` over
  `specs/022-taste-transfer-prereg/` and `tests/` must return nothing after this task.

## R6 — Frozen-set completeness guard (amendment 6)

`FROZEN_FILES` is already complete. Add the linter that keeps it that way: a test that reads the
real directory listings of `specs/022-taste-transfer-prereg/scripts/*.mjs`,
`scripts/lib/*.mjs`, and `schemas/*.json` and fails if any file on disk is missing from
`FROZEN_FILES`, and fails if `FROZEN_FILES` names a path that does not exist. Include
`scripts/lib/identity-tokens.mjs` (new in R4) in `FROZEN_FILES`.

## R7 — Pinned secret-map custody path (amendment 7; Fable AC-11 refinement 2)

Add to `constants.mjs`:

```js
export const OWNER_SECRET_MAP_REL = [".design-os", "prereg-022", "randomization-map.secret.json"];
export function ownerSecretMapPath(home) { return join(home, ...OWNER_SECRET_MAP_REL); }
```

`make-randomization-map.mjs` must import and use it (single source of truth with the check).

PR-016 must require `resolve(secret_map_location) === ownerSecretMapPath(homedir())` — an exact
match against the **expanded absolute** owner custody path. Reject `~`-prefixed, relative, and
any other absolute location, each with a distinct message. Keep the existing inside-repo check as
a separate, earlier finding so its dedicated mutation test still fires.

Update the lifecycle fixture (`tests/spec-022-lifecycle.ts`) so its committed commitment records
the expanded path under the sandbox `HOME` the validator subprocess runs with, and the fixture
writes the secret map there. Add a mutation asserting a temp-path `secret_map_location` errors.

## R8 — Safe commitment-tooling proof (amendment 8; AC-11)

New test (`tests/spec-022-commitment-tooling.test.ts`). It must **never** touch the real tree or
real `$HOME`:

1. Copy `specs/022-taste-transfer-prereg` into a temp dir; create a separate temp `HOME`.
2. Assert `<realHome>/.design-os/prereg-022/randomization-map.secret.json` does not exist before
   the test, and assert the same after it (the test must not create it).
3. Run `node <tempSpec>/scripts/make-randomization-map.mjs` as a subprocess with
   `env HOME=<tempHome>` (and `USERPROFILE` for parity). Assert exit 0, then assert:
   - `<tempSpec>/randomization-commitment.json` exists and validates against
     `schemas/randomization-commitment.schema.json`;
   - `secret_map_location === ownerSecretMapPath(tempHome)`;
   - the secret file exists, `statSync(...).mode & 0o777 === 0o600`;
   - `sha256(secretFileBytes) === commitment.secret_map_sha256`;
   - counts are exactly 16 / 20 / 36 / 36, presentations total 56, codenames unique 8-hex-lowercase,
     `presentation_id` matches `PR-[0-9a-f]{8}`, presentation orders are exactly 1..20 and 21..56.
4. Record both output files' bytes + mtimes, run the script a **second** time with the same
   sandbox `HOME`, assert exit code 1, assert stderr names the refusal, and assert both files are
   byte-identical and unmodified.
5. `finally`: remove the temp spec dir and temp `HOME` recursively. No real map, no real
   commitment, no `runs/` at any point.

## R9 — Straggler check: required evidence is never a warning (amendment 9)

Audit every `scripts/lib/checks-*.mjs` for a `severity: "warning"` emitted in a mode where the
evidence is required. `checks-judging.mjs` and `checks-run-evidence.mjs` are already correct;
confirm `checks-freeze.mjs`, `checks-reveal.mjs`, `checks-results.mjs`, `checks-render.mjs`,
`checks-phase-a.mjs` and fix any straggler. Do not turn genuinely-not-yet-applicable absences into
errors.

## Hard constraints

- No commits. No `git add`. Leave the tree reviewable.
- No `runs/` in the real spec dir. No real randomization map or commitment. No writes to the real
  `$HOME`.
- No rendering, no network, no paid services, no provider coupling.
- Do not change the 30 media asset bytes, the manifest asset records, the selection manifest,
  candidate manifest, briefs, or patches.
- Preserve every r2 behaviour that the amendment does not name.
- TDD: for each requirement write the failing test first, then the code.

## Required verification (report exact commands and outputs)

1. `node specs/022-taste-transfer-prereg/scripts/validate-prereg.mjs --mode pre-freeze --corpus /private/tmp/mengto-skills` → 0 errors, 0 warnings
2. `npx vitest run tests/spec-022-*.test.ts` → all green, report counts
3. `npm run typecheck`
4. `npm run lint`
5. `npm run build`
6. `npm test` (full suite)
7. `git status --short` and `git diff --check`
8. Secret/token scan: no absolute real-home paths, no API keys, no provider names, no
   `commons.wikimedia.org` strings outside the manifest's provenance fields, and confirm
   `~/.design-os/prereg-022/` still does not exist.
