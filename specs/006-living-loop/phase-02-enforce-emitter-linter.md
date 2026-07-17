# Phase 02 — Enforce the auto-record convention (emitter + linter)

> **Executor: Sonnet.** Depends on P1 being merged. Art II: a standard that exists only as
> prose drifts — the convention ships with the check that fails without it.

## Context Links

- Spec `specs/006-living-loop/spec.md` §AC2 · Plan `specs/006-living-loop/plan.md` P2
- Constitution Art II (emitter + linter), Art IV (shared layer), Art IX (<200 lines)
- Repo precedent for a meta-linter: `tests/journey-command-consistency.test.ts` (header
  quotes the emitter+linter rule verbatim); metadata-in-core precedent:
  `src/core/command-signatures.ts`
- P1: `specs/006-living-loop/phase-01-auto-record-core.md`

## Overview

- **Priority**: P2 — small, closes the drift hole before more commands land.
- **Status**: not started. **Depends**: P1.
- **Description**: one registry names every outcome-bearing command; one check fails the
  build if a registered command stops calling `withOutcome`, **or** if an unregistered
  command starts calling it. Bidirectional — no silent drift either way.

## Key Insights

1. **`ui knowledge check` is the wrong home.** It lints `knowledge/**` markdown governance
   (index rows, persona drift, xrefs, provenance markers — `src/core/knowledge-lint.ts:96-105`)
   and its command layer reads only `knowledge/` + `personas.json`
   (`src/commands/knowledge.ts:89-111`). Auto-record wiring is a fact about `src/commands/*.ts`.
   Folding it in would force `knowledge check` to walk `src/`, which is not its domain.
2. **`ui lint autorecord` is also wrong.** The `ui` binary is *distributed*
   (`bin: {"ui": "./dist/cli.js"}`); `src/` is not. A shipped subcommand that lints our own
   source is dead weight in every user's install, and it would cost a `COMMAND_SIGNATURES`
   entry + a `--help` block in the Art VI collision file for zero user value.
3. **The repo already answered this.** `tests/journey-command-consistency.test.ts` is a
   vitest meta-linter that walks a repo directory, extracts patterns by regex, and validates
   them against the kernel's own schema — its docstring says: *"the emitter half lives in
   templates/journeys/ itself; this is its paired linter (repo rule: every standard ships an
   emitter AND a linter in the same commit)"*. That is the precedent, and it runs in CI via
   `npm test`. `tests/zero-runtime-deps.test.ts` is the same pattern in 16 lines.

## Decisions (RESOLVED)

### Decision 1 — the check is `tests/autorecord-wiring.test.ts`, not a `ui` subcommand

Grounded in Key Insights 1–3. It fails `npm test`, which is gate #4 of Art VI, so the
convention cannot land unenforced. **This deviates from tasks.md's two suggestions
(`ui lint autorecord` / fold into `ui knowledge check`) — report it to the gate.**

### Decision 2 — the registry lives in `src/core/outcome-registry.ts`

In `core`, not `tests/`, because: (a) `command-signatures.ts` is the exact precedent for
pure metadata shipped in core; (b) it is typed against `EventType`, so a registry entry
naming a type outside the closed set fails **typecheck**, not just the test; (c) P4's
harvest and spec 007's ladder both need to know which commands are outcome-bearing, and a
`tests/` module is unreachable from them.

### Decision 3 — the registry does not drive the wiring

Each call site's payload is bespoke (a lint's `checkIds` vs a reconcile's component names),
so a registry that *generated* the calls would be a framework for nine hand-written lines
(YAGNI, Art IX). The registry is the **single source of truth for the linter and for
documentation**; the wiring is asserted against it, not generated from it. This is the honest
reading of tasks.md's "single source both the wiring and the linter read": both are bound to
it — one by assertion, one by declaration.

## Related Code Files

**Create**
- `src/core/outcome-registry.ts` (~55 lines)
- `tests/autorecord-wiring.test.ts` (~90 lines)

**Read (never modified by this phase)**
- `src/commands/{a11y-lint,content-lint,taste-lint,validate-layout,audit,autofix,taste-record-impl,ds-change-token-impl,figma-reconcile-run}.ts`
- `src/core/memory-events.ts` (`EVENT_TYPES`)

**Do not touch**: `src/cli.ts`, `src/core/command-signatures.ts`, `src/commands/knowledge.ts`.

## Architecture — `src/core/outcome-registry.ts`

```ts
/**
 * The outcome-bearing command registry (spec 006 P2).
 *
 * The single source of truth for WHICH kernel subcommands must append a MemoryEvent as
 * a side-effect of running (spec 006 P1), and under what condition. Pure metadata — the
 * same role command-signatures.ts plays for flags.
 *
 * Its paired linter is tests/autorecord-wiring.test.ts (Art II): it fails when a listed
 * file stops calling withOutcome, AND when an unlisted src/commands file starts calling
 * it. Adding a new outcome-bearing command = add an entry here + wire the call site;
 * the linter fails until both halves exist.
 *
 * `condition` is prose for humans and for the PR reviewer — it is NOT executed. The
 * executable truth is the call site's own guard; keep the two in sync by hand.
 */
import type { EventType } from "./memory-events.js";

export interface OutcomeCommandSpec {
  /** The invocation as a user types it, e.g. "ui audit". */
  command: string;
  /** Repo-relative path of the file holding the call site. */
  file: string;
  /** The event type this command appends. Typed → a bogus type fails typecheck. */
  eventType: EventType;
  /** When it records (prose; the call site holds the executable guard). */
  condition: string;
}

export const OUTCOME_BEARING: readonly OutcomeCommandSpec[] = [
  { command: "ui a11y-lint",       file: "src/commands/a11y-lint.ts",           eventType: "lint_run",          condition: "every successful run (a clean pass is an outcome)" },
  { command: "ui content-lint",    file: "src/commands/content-lint.ts",        eventType: "lint_run",          condition: "every successful run" },
  { command: "ui taste-lint",      file: "src/commands/taste-lint.ts",          eventType: "lint_run",          condition: "every successful run" },
  { command: "ui validate-layout", file: "src/commands/validate-layout.ts",     eventType: "lint_run",          condition: "every successful run" },
  { command: "ui audit",           file: "src/commands/audit.ts",               eventType: "lint_run",          condition: "every successful run (total→errorCount)" },
  { command: "ui autofix",         file: "src/commands/autofix.ts",             eventType: "autofix_applied",   condition: "--write AND >=1 fix applied (state change only)" },
  { command: "ui taste record",    file: "src/commands/taste-record-impl.ts",   eventType: "taste_vote",        condition: "--mode pair only; --mode study is deferred (P1 Decision 6)" },
  { command: "ui ds change-token", file: "src/commands/ds-change-token-impl.ts", eventType: "token_change",     condition: "the value actually changed (the no-op branch returns first)" },
  { command: "ui figma reconcile", file: "src/commands/figma-reconcile-run.ts", eventType: "reconcile_applied", condition: "--apply AND (registry changed OR a sidecar was written)" },
];

/** Repo-relative files that are allowed to call withOutcome/recordOutcome. */
export const OUTCOME_FILES: readonly string[] = OUTCOME_BEARING.map((s) => s.file);
```

## Architecture — `tests/autorecord-wiring.test.ts`

Structural template: `tests/journey-command-consistency.test.ts` (repo-root resolution +
`readdirSync`/`readFileSync` + regex extraction + assert against the kernel's own schema).

```ts
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMANDS_DIR = join(REPO_ROOT, "src", "commands");
const CALL_RE = /\bwithOutcome\s*\(|\brecordOutcome\s*\(/;
const IMPORT_RE = /from\s+"\.\.\/core\/memory-autorecord\.js"/;
```

Four checks:

1. **Every registered file exists.** `existsSync(join(REPO_ROOT, spec.file))`.
2. **Every registered file is wired.** Its source matches `IMPORT_RE` **and** `CALL_RE`.
   Failure message must name the fix, not just the fact:
   `` `${spec.command} (${spec.file}) is registered as outcome-bearing but never calls withOutcome — wire it (spec 006 P1) or remove it from OUTCOME_BEARING` ``.
3. **No unregistered caller** (the reverse direction — this is what catches drift as new
   commands land). Walk every `*.ts` under `src/commands/`, collect those matching
   `CALL_RE`, and assert the set **equals** `new Set(OUTCOME_FILES)`. Assert with sorted
   arrays (`expect(found.sort()).toEqual([...OUTCOME_FILES].sort())`) so the diff names the
   offending file.
4. **Every registered `eventType` is in the closed set.** Runtime belt to typecheck's braces:
   `expect(EVENT_TYPES).toContain(spec.eventType)` — catches a hand-edit to
   `memory-events.ts` that removes a type the registry still names.

Use `describe("outcome-bearing registry")` with `it.each(OUTCOME_BEARING)` for checks 1/2/4
so a failure names the command (`it.each` title: `"$command is wired to auto-record"`), and a
single `it` for check 3.

## Implementation Steps

1. Create `src/core/outcome-registry.ts` exactly as above.
2. Create `tests/autorecord-wiring.test.ts` with the four checks.
3. **Prove the linter bites** (Art II is worthless if the check cannot fail): temporarily
   delete the `withOutcome` call from `src/commands/audit.ts`, run `npx vitest run
   tests/autorecord-wiring.test.ts`, confirm check 2 fails naming `ui audit`; revert. Then
   temporarily add a `withOutcome` call to an unregistered command, confirm check 3 fails;
   revert. **Paste both failure outputs into the PR body** — that is this phase's evidence.
4. Document the convention where a future author will hit it: add a short paragraph to the
   `README.md` section that lists the kernel's conventions (or, if no such section exists,
   to the docstring of `src/core/memory-autorecord.ts` only — do **not** invent a new doc file).
5. Four gates.

## Todo List

- [ ] `src/core/outcome-registry.ts`
- [ ] `tests/autorecord-wiring.test.ts` (4 checks)
- [ ] Prove-it-bites: both failure modes captured for the PR body
- [ ] Convention documented (README conventions section or the module docstring)
- [ ] `npm run typecheck && npm run lint && npm run build && npm test`

## Tests — file, name, assertion

`tests/autorecord-wiring.test.ts`:

- `describe("outcome-bearing registry")`
  - `it.each(OUTCOME_BEARING)("$command's file exists")` → `existsSync`.
  - `it.each(OUTCOME_BEARING)("$command imports memory-autorecord and calls withOutcome")` →
    `IMPORT_RE` and `CALL_RE` both match the file's source.
  - `it.each(OUTCOME_BEARING)("$command's eventType is in the closed EVENT_TYPES set")` →
    `expect(EVENT_TYPES as readonly string[]).toContain(spec.eventType)`.
  - `it("no src/commands file calls withOutcome without being registered")` → the walked set
    of callers, sorted, `toEqual` `OUTCOME_FILES` sorted.
- `describe("registry shape")`
  - `it("names each command exactly once")` → `new Set(commands).size === OUTCOME_BEARING.length`.
  - `it("covers the nine commands spec 006 locked as outcome-bearing")` →
    `expect(OUTCOME_BEARING).toHaveLength(9)` with the nine `command` strings listed
    verbatim in the assertion. *This pins the locked decision itself: a tenth command cannot
    be smuggled in without editing the spec's own number.*

## Success Criteria

1. Removing any `withOutcome` call from a registered file fails `npm test` with a message
   naming the command and the fix.
2. Adding a `withOutcome` call to an unregistered `src/commands/*.ts` fails `npm test`.
3. A registry entry naming a non-existent `EventType` fails `npm run typecheck`.
4. Both failure modes demonstrated in the PR body (step 3).
5. `src/core/outcome-registry.ts` < 200 lines; no change to `cli.ts` / `command-signatures.ts`.
6. Four gates green + `ui knowledge check` clean.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A regex linter is fooled by a call inside a comment or a string | Accepted: the failure mode is a **false pass** on a deliberately-commented-out call, which no honest author writes. The alternative (AST parse) needs a parser dep and the repo ships **zero runtime deps** (`tests/zero-runtime-deps.test.ts`). Documented in the test's docstring. |
| `condition` prose drifts from the call site's real guard | Named in the registry docstring; the PR reviewer checks both halves. Executable coupling is deliberately not attempted (Decision 3). |
| A future author adds an outcome-bearing command and never learns the rule | Check 3 fails the moment they wire it; if they *don't* wire it, no check can know — which is why P5's real-data run inspects event-type diversity, not just green tests. |

## Security Considerations

Test-only file reads inside the repo. No network, no writes, no new runtime dep.

## Deviations from `plan.md` / `tasks.md` (report to the gate)

1. **Neither `ui lint autorecord` nor a fold into `ui knowledge check`** — the check is a
   vitest meta-linter, per the repo's own precedent for exactly this
   (`tests/journey-command-consistency.test.ts`). Rationale in Key Insights 1–3. Art II is
   satisfied: it ships with the convention and fails the build.
2. **The registry does not drive the wiring** (Decision 3) — tasks.md's phrase "single
   source both the wiring and the linter read" is honoured by assertion, not codegen.

## Next Steps

- **P4** imports `OUTCOME_BEARING` only if it needs the list; do not couple harvest to it.
- **Spec 007**'s competence ladder reads this registry to know which evidence exists per
  domain — keep the `command` strings stable.
