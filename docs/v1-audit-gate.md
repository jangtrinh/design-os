# v1 audit-gate report

Snapshot of ease-design at v1 completion. All automated gates pass; the
deterministic surface is closed; one explicit gap remains (live host-model
dogfood) and is documented below.

## Gates

| Gate | Command | Exit | Result |
|---|---|---|---|
| Typecheck | `npm run typecheck` | 0 | `tsc --noEmit` clean |
| Lint | `npm run lint` | 0 | `eslint src tests` clean |
| Build | `npm run build` | 0 | `dist/cli.js` 170.81 KB ESM, built in 11 ms |
| Tests | `npm test` | 0 | **42 test files / 619 tests passing**, 524 ms |
| Personas | `npm run personas:verify` | 0 | 23 personas verified against Markdown family files |

All five exit 0. Stable across re-runs.

## Plan-reference leakage scan

Scanned for `Phase [0-9]`, `OD-[0-9]`, and `finding [A-Z]` substrings inside
the *shipped* surface — `src/`, `tests/`, `schemas/`, `scripts/`,
`templates/workflows/`, and the public-facing `knowledge/taste-rubric.md`:

```
grep -rE "Phase [0-9]|OD-[0-9]|finding [A-Z]" \
  src/ tests/ schemas/ scripts/ templates/workflows/ knowledge/taste-rubric.md
```

**Result: zero matches.** The two known false-positive zones live outside this
scan and are intentional:

- `tests/persona-loader.test.ts:135` uses the hex literal `#F00` as a test
  fixture — a CSS color, not a finding code.
- `knowledge/persona-index.md` uses "Phase 1" / "Phase 2" as **algorithm step
  labels** inside the persona-selection algorithm (round-robin then top-up).
  These describe internal algorithm phases, not plan phases, and they're stable
  long-term names users will read.

No other surface references plan artifacts.

## Runtime dependency count

```json
"dependencies": <absent>
"devDependencies": { 7 entries }
```

The shipped binary has **zero runtime dependencies**. The seven devDeps are
build/test tooling: `@eslint/js`, `@types/node`, `eslint`, `tsup`, `typescript`,
`typescript-eslint`, `vitest`. None ship in `dist/`.

## Synthetic walkthrough

`examples/synthetic/run.sh` exercises six commands end-to-end without a host
model:

1. `ui init --runtime claude --cwd <tmp>` — writes 15 adapter files (9
   commands + 6 skills) plus the manifest.
2. `ui ds init demo --persona liquid-glass --intent "landing page for a new gym" --brand-hex "#3b82f6"`
   — compiles the three DS artifacts; manifest seals with a SHA-256
   `compiledHash`.
3. `ui ds context --strict --format markdown` — emits the active DS as a
   host-model context block.
4. `ui ds change-token color.primary --value '{primary.600}'` — generation
   bumps from 1 → 2; manifest re-seals.
5. `ui color scale '#3b82f6'` — 11-stop perceptual scale with WCAG contrast
   columns; anchor stop identified.
6. `ui tokens compile design.tokens.json --target tailwind` — emits a Tailwind
   v4 `@theme { ... }` block built from the DS the previous steps just
   produced.

All six steps exit 0. Artifacts checked into `examples/synthetic/0N-*.txt`;
scratch state lives under `examples/synthetic/output/` (gitignored).

The walkthrough proves the seams between commands hold: output of one becomes
input to the next, and the DS hash-seal travels through.

## Knowledge core inventory

| Axis | Count |
|---|---|
| Taste-rubric axes | 6 + 1 (Consistency) |
| Persona families | 7 |
| Personas | 23 |
| UI mode constraint sets | 8 + `TECHNICAL_RULES` |
| Components | 32 across 8 categories |
| Prompt-mode strategies | 3 (replicate / enhance / adapt) |
| Workflow templates | 9 (`generate`, `iterate`, `extract`, `from-ref`, `figma`, `redesign`, `refine`, `slides`, `critique`) |
| Skill wrappers | 6 |

All counts match `knowledge/README.md` and the JSON-derived `personas.json`.

## What's still pending

Two items remain for a future session — both require a host AI model and are
out of scope for an autonomous CLI session:

1. **Live dogfood.** A host CLI (Claude Code, Antigravity CLI, or Codex CLI)
   running `/ui:generate`, `/ui:iterate`, `/ui:extract` against an installed
   ease-design and committing the resulting HTML + critique JSON into
   `examples/generated/`, `examples/iterated/`, `examples/extracted/`. Until
   that session happens, the generation pipeline is verified by unit tests and
   by the deterministic walkthrough but not by real model output.
2. **Taste-rubric threshold tuning.** The 0-10 per-axis pass thresholds in the
   critique gate are *a priori* best-guesses. They need calibration against
   real generation samples so the gate catches bad output without rejecting
   acceptable variants. This is downstream of live dogfood — you can't tune a
   threshold without samples.

Nothing else is blocking v1.

## Bottom line

The deterministic surface is **shipped, tested, and closed**. The host-model
surface is **wired up, documented, and ready** — adapter files generate
correctly into all three runtimes, the workflows have stable templates, and
the critique gate is in place. What remains is empirical validation of
generation quality, which only a host model can produce.
