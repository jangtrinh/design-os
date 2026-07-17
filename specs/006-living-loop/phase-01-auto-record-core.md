# Phase 01 — Auto-record core (kernel)

> **Executor: Sonnet.** Follow this file verbatim. If the code contradicts a signature here,
> STOP and report — do not improvise (Art V). Every signature below was read from the live
> source on 2026-07-17 and is quoted, not assumed.

## Context Links

- Spec: `specs/006-living-loop/spec.md` · Plan: `specs/006-living-loop/plan.md`
- Constitution: `.specify/memory/constitution.md` — Art I (kernel deterministic), Art IV
  (fix at the shared layer), Art VI (git discipline), Art IX (<200 lines)
- Event API read: `src/core/memory-events.ts`, `src/core/memory-store.ts`
- Append precedent: `src/commands/memory-record-impl.ts:78-111`

## Overview

- **Priority**: P1 — highest leverage, blocks P2/P3/P4/P5.
- **Status**: not started.
- **Description**: one shared helper appends a `MemoryEvent` as a side-effect of running an
  outcome-bearing kernel subcommand. No model, no network, no opt-in. Nine call sites, one
  helper (Art IV).

## Key Insights (read before editing — each one changes the design)

1. **`EVENT_TYPES` is a CLOSED set of 12** (`memory-events.ts:19-32`) and `parseLedger`
   **hard-fails** the whole file on an unknown type (`memory-events.ts:191-193`,
   `BAD_LEDGER`). Adding types is therefore not free: an *older* `ui` binary reading a
   *newer* ledger throws on line 1 and every consumer (`memory compile`, `librarian
   collect`) dies. Accepted because the binary is repo-linked and rebuilt by
   `design-os update` (memory: `design-os-cli-typer`) — but it is why we add the
   **minimum** number of types and reuse existing ones wherever the shape genuinely fits.
2. **`token_change` already exists** with exactly the payload `ds change-token` produces:
   `REQUIRED_DATA.token_change = ["path","from","to"]` (`memory-events.ts:42`). plan.md's
   proposed `token_changed` would be a **duplicate type** — see Deviations.
3. **`user_pick` must NOT be reused for a taste vote.** `compileGraph` treats
   `data.chosen` as a **designId** and writes it into the `designs` map
   (`memory-graph.ts:93-108`). A taste-corpus item id is not a design; reusing the type
   would pollute the graph with phantom designs. Hence a new `taste_vote` type.
4. **`compileGraph` has `default: break`** (`memory-graph.ts:155-156`) and
   `memory-corpus.shape()` has `default: return null` (`memory-corpus.ts:93-94`). New
   event types are therefore **safely inert**: recorded as truth, aggregated by nobody,
   embedded by nobody, until P3 opts them in. This is the correct v1 behaviour — do not
   add graph reducers in P1.
5. **`memory-events.ts` is pure — no fs, no clock** (module docstring). The impl layer
   stamps `t`/`id` (`memory-record-impl.ts:78,83`). `recordOutcome` must do the same, in
   the same order, or ids collide.
6. **The lint commands take no `--dir` flag**, and `cli.ts:187-201` runs a central
   unknown-flag guard from `COMMAND_SIGNATURES` — so an undeclared `--dir` on `a11y-lint`
   is **rejected**, not ignored. P1 therefore resolves the ledger from **cwd** for those
   commands (see Decision 3) and adds **no new flags**.

## Decisions (RESOLVED — do not re-open)

### Decision 1 — the event-type map

Four new types; two existing types reused. `EVENT_TYPES` goes 12 → 16.

| Outcome (command) | EventType | New? | `data` |
|---|---|---|---|
| `a11y-lint`, `content-lint`, `taste-lint`, `validate-layout`, `audit` | `lint_run` | **NEW** | `{check, file, errorCount, warningCount, checkIds}` |
| `autofix --write` (≥1 fix) | `autofix_applied` | **NEW** | `{file, fixCount, ruleIds}` |
| `figma reconcile --apply` (state changed) | `reconcile_applied` | **NEW** | `{added, updated, deprecated, mirrored, cursorFrom, cursorTo}` |
| `taste record --mode pair` | `taste_vote` | **NEW** | `{a, b, winner}` |
| `ds change-token` (changed) | `token_change` | reuse | `{path, from, to, reason?, generation}` |
| `taste record --mode study` | — | **deferred** | see Decision 6 |

**Why one `lint_run` for five checkers, not five types.** All five are the same shape — a
checker over one file yielding rule-keyed findings + an error/warning split — and
`data.check` discriminates them. Five types would mean five reducers, five corpus arms and
five harvest lenses for one concept (Art IX / YAGNI). `audit` is included despite its name:
structurally it *is* a checker (violations by rule, exit 1 iff `total > 0`,
`audit.ts:174`); its `total` maps to `errorCount` with `warningCount: 0`, which preserves
the exit-code semantics exactly.

**Why `checkIds` and not the findings.** The durable signal is *which rules trip*, not each
instance. Storing findings verbatim would put hundreds of message strings per run into an
append-only ledger — the documented bloat failure (spec §Why: accuracy collapse at 2,400
records). `checkIds` is a sorted unique array: small, stable, and exactly what a recurrence
counter needs.

### Decision 2 — exact `memory-events.ts` edit spec

**Edit A** — `EVENT_TYPES` (`memory-events.ts:19-32`), append **after** `"gap",` and before
the closing `] as const;`, preserving one entry per line:

```ts
  "lint_run",
  "autofix_applied",
  "reconcile_applied",
  "taste_vote",
```

**Edit B** — `REQUIRED_DATA` (`memory-events.ts:36-53`), append inside the object literal
after the `gap: ["text", "target"],` entry, with the comment block:

```ts
  // ─── Auto-recorded outcomes (spec 006 P1) — appended by `recordOutcome`, never by hand.
  // A checker run: `check` names the tool (a11y-lint | content-lint | taste-lint |
  // validate-layout | audit), `checkIds` is the sorted unique set of rules that tripped.
  // `audit` maps total→errorCount, warningCount: 0 (it has no severity split).
  lint_run: ["check", "file", "errorCount", "warningCount", "checkIds"],
  // A `ui autofix --write` that CHANGED the file. A no-op autofix records nothing.
  autofix_applied: ["file", "fixCount", "ruleIds"],
  // A `ui figma reconcile --apply` that changed the registry and/or wrote sidecars.
  reconcile_applied: ["added", "updated", "deprecated"],
  // One `ui taste record --mode pair` vote. NOT `user_pick`: a corpus item id is not a
  // designId, and compileGraph would file it under `designs` (memory-graph.ts:93).
  taste_vote: ["a", "b", "winner"],
```

**Edit C** — no change to `validateEvent`. It is already generic: it reads
`REQUIRED_DATA[type]` (`memory-events.ts:111-116`) and its only special case is the
`insight`-needs-refs rule (`:117-122`), which must stay as-is. **Do not** add per-type
branches.

**Edit D** — no change to `MEMORY_EVENT_VERSION` (stays `1`). The addition is additive
within v1; `parseLedger` never reads `v`. State this in the commit body.

### Decision 3 — where the ledger comes from, and the opt-in guard

`recordOutcome` resolves `memoryPaths(dirFlag)` where `dirFlag` is `parsed.flags["dir"]`
when it is a string, else `undefined` → `process.cwd()` (`memory-store.ts:28-32`).
`ds change-token` and `figma reconcile` already declare `--dir`; the other seven use cwd.

**The guard (non-negotiable): record only when `existsSync(paths.dir)` — i.e. the project
already has a `design/` directory.** Without it, `ui a11y-lint index.html` in any random
folder silently creates `design/memory.events.jsonl` there. With it, auto-record is
**opt-in per project** (a project that ran `ui ds init` / `ui init`) and **automatic per
run** — exactly the locked decision. Use `paths.dir`, not `paths.ledger`, so the *first*
outcome in a real project starts the ledger.

### Decision 4 — failure policy (a lint must never fail because of the ledger)

`recordOutcome` **never throws**. It returns a result; on `not-opted-in` it is silent
(that is the normal case), and on `invalid-event` / `write-failed` the caller appends ONE
line to **stderr**: `ui: memory auto-record skipped (<reason>): <detail>\n`. **stdout, the
JSON envelope and the exit code are never touched** — they are the command's contract and
~130 tests assert them. Honesty floor (Art VIII) is met on stderr, where nothing is
parsed.

### Decision 5 — no graph recompile, no registry upsert

`memory-record-impl.ts:104-105` does `compileAndWrite` + `upsertRegistry` after every
append. `recordOutcome` does **neither**:

- **No recompile**: `loadGraph` already recompiles lazily when the ledger's mtime is newer
  than the graph's (`memory-store.ts:80-92`). Recompiling on every lint is O(ledger) work
  per run and churns `design/memory.graph.json` in git for no reader.
- **No registry upsert**: a lint must not write to `$HOME`. The registry stays what it is —
  an index maintained by the explicit `ui memory record` path.

### Decision 6 — `taste record --mode study` is deferred (open question, resolved)

A study verdict (`{item, verdict: LEARN|PARTIAL|SKIP}`, `taste-record-impl.ts:80`) does not
fit `taste_verdict` (`REQUIRED_DATA` = `scores/lowestAxis/round/pass`) and forcing it there
would be a shape lie. A fifth new type with no reducer and no proven demand fails YAGNI.
The verdict is **already durable** in `study.jsonl` — no data is lost. Revisit only if P5's
real-data run shows study verdicts happening. **Not in the P2 registry** → the linter will
not demand it.

### Decision 7 — `file` paths are stored as typed

`data.file` is the raw positional as the user typed it (usually project-relative). Absolute
paths would leak machine paths into a committed ledger; rewriting to project-relative adds
code for a case that has not bitten yet. Deterministic for a given argv, which is what the
byte-stability test asserts.

## Related Code Files

**Create**
- `src/core/memory-autorecord.ts` (~95 lines)
- `tests/memory-autorecord.test.ts`
- `tests/autorecord-call-sites.test.ts`

**Modify**
- `src/core/memory-events.ts` (Edits A–B only)
- `src/commands/a11y-lint.ts`, `content-lint.ts`, `taste-lint.ts`, `validate-layout.ts`,
  `audit.ts`, `autofix.ts`, `taste-record-impl.ts`, `ds-change-token-impl.ts`,
  `figma-reconcile-run.ts`
- `tests/memory-events.test.ts` (extend the closed-set assertion if it enumerates types)

**Do not touch**: `src/cli.ts`, `src/core/command-signatures.ts` (Art VI collision points —
P1 adds no command and no flag), `src/core/memory-graph.ts` (P3), `src/core/memory-corpus.ts`.

## Architecture — `src/core/memory-autorecord.ts`

Placement: `src/core/`, because `taste-store.ts` already sets the precedent of a core module
importing `ParsedArgs` (`resolveTasteRoot(parsed: ParsedArgs)`, `taste-store.ts:65`).

```ts
/**
 * Auto-record — the fuel line (spec 006 P1).
 *
 * An outcome-bearing kernel subcommand appends a MemoryEvent as a side-effect of
 * RUNNING, with no opt-in and no model call. This module is the ONE write path for
 * that (Art IV); it reuses the existing event API (memory-events + memory-store) and
 * invents nothing. Registered call sites live in src/core/outcome-registry.ts and are
 * enforced by tests/autorecord-call-sites.test.ts (Art II).
 *
 * Invariants:
 *   - Never throws. A ledger failure must never change a lint's exit code.
 *   - Records only into a project that already has design/ (opt-in per project,
 *     automatic per run) — never creates design/ in an arbitrary cwd.
 *   - Appends only: no graph recompile (loadGraph rebuilds lazily on mtime), no
 *     registry upsert (a lint must not write to $HOME).
 */
import { existsSync } from "node:fs";

import type { ParsedArgs } from "./cli-args.js";
import type { CommandResult } from "./output.js";
import { buildEvent, nextEventId, validateEvent, MemoryEventError } from "./memory-events.js";
import type { EventType, Medium, MemoryArtifact } from "./memory-events.js";
import { memoryPaths, ledgerLineCount, appendEvent } from "./memory-store.js";

export interface OutcomeInput {
  type: EventType;
  /** Who caused it — the invoking command, e.g. "ui a11y-lint". */
  actor: string;
  data: Record<string, unknown>;
  refs?: readonly string[];
  designId?: string;
  medium?: Medium;
  artifact?: MemoryArtifact;
}

export type SkipReason = "not-opted-in" | "invalid-event" | "write-failed";

export interface RecordOutcomeResult {
  recorded: boolean;
  /** The appended event id (e.g. "e12") when recorded. */
  id?: string;
  reason?: SkipReason;
  detail?: string;
}

export function recordOutcome(
  parsed: ParsedArgs,
  input: OutcomeInput,
  nowIso?: string,
): RecordOutcomeResult;

/**
 * Call-site sugar: record, and on a real failure append one stderr warning to the
 * command's result. Returns the result (mutated only in the failure case) so a call
 * site is a single wrapped `return`.
 */
export function withOutcome(
  result: CommandResult,
  parsed: ParsedArgs,
  input: OutcomeInput,
  nowIso?: string,
): CommandResult;

/** The shared `lint_run` payload builder — five call sites, one shape (Art IV). */
export function lintOutcomeData(
  check: string,
  file: string,
  r: {
    errorCount: number;
    warningCount: number;
    findings: readonly { checkId: string }[];
  },
): Record<string, unknown>;
```

**`recordOutcome` body — exact order (mirrors `memory-record-impl.ts:71-105`)**

1. `const dirFlag = parsed.flags["dir"]; const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);`
2. `if (!existsSync(paths.dir)) return { recorded: false, reason: "not-opted-in" };`
3. `try { validateEvent(input.type, input.data, input.refs); } catch (e) { if (e instanceof MemoryEventError) return { recorded: false, reason: "invalid-event", detail: e.message }; throw e; }`
4. `const id = nextEventId(ledgerLineCount(paths)); const t = nowIso ?? new Date().toISOString();`
5. `const event = buildEvent({ id, t, type: input.type, data: input.data, actor: input.actor, ...(input.medium !== undefined && { medium: input.medium }), ...(input.designId !== undefined && { designId: input.designId }), ...(input.artifact !== undefined && { artifact: input.artifact }), ...(input.refs !== undefined && { refs: input.refs }) });`
6. `try { appendEvent(paths, event); } catch (e) { return { recorded: false, reason: "write-failed", detail: e instanceof Error ? e.message : String(e) }; }`
7. `return { recorded: true, id };`

**`withOutcome` body**

```
const r = recordOutcome(parsed, input, nowIso);
if (r.recorded || r.reason === "not-opted-in") return result;
return { ...result, stderr: (result.stderr ?? "") + `ui: memory auto-record skipped (${r.reason}): ${r.detail ?? ""}\n` };
```

**`lintOutcomeData` body**

```
return {
  check,
  file,
  errorCount: r.errorCount,
  warningCount: r.warningCount,
  checkIds: [...new Set(r.findings.map((f) => f.checkId))].sort(),
};
```
Key insertion order is fixed → `serializeEvent`'s `JSON.stringify(data)` is byte-stable.

## Implementation Steps — the nine call sites, exactly

Each site keeps its existing return expression and wraps it. Import at the top of each file:
`import { withOutcome, lintOutcomeData } from "../core/memory-autorecord.js";`

**1 · `src/commands/a11y-lint.ts`** — replace the tail of `run()` (`:77-81`):

```ts
const result = lintA11y(html);
const exitCode = result.errorCount > 0 ? 1 : 0;
const out = useJson ? okJsonWithExit(CMD, { file, ...result }, exitCode) : { exitCode, stdout: formatReport(result, file) };
return withOutcome(out, parsed, { type: "lint_run", actor: "ui a11y-lint", data: lintOutcomeData("a11y-lint", file, result) });
```
Condition: **always on a successful run** (a clean lint is an outcome — it is the evidence
007's ladder reads). Error paths (`BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`) return before
this and record nothing.

**2 · `src/commands/content-lint.ts`** (`:70-79`) — same shape. `result` is already
`{ file, findings, errorCount, warningCount }` (`:71`), so:
`data: lintOutcomeData("content-lint", file, result)`, `actor: "ui content-lint"`.

**3 · `src/commands/taste-lint.ts`** (`:182-198`) — same, plus the taste-specific axis
signal (extra keys are allowed by design: "extra keys allowed for forward compat",
`memory-events.ts:35`):

```ts
data: { ...lintOutcomeData("taste-lint", filePath, { errorCount, warningCount, findings }), axes: axesAffected }
```
`axesAffected` is already sorted + deduped (`taste-lint.ts:158`). `actor: "ui taste-lint"`.

**4 · `src/commands/validate-layout.ts`** (`:120-133`):
`data: lintOutcomeData("validate-layout", filePath, { errorCount, warningCount, findings })`,
`actor: "ui validate-layout"`.

**5 · `src/commands/audit.ts`** (`:172-178`) — the adapter is one line at the call site; do
NOT add a second helper (`Violation.rule`, `AuditResult.total`, no severity split):

```ts
data: lintOutcomeData("audit", nodesPath, {
  errorCount: result.total,
  warningCount: 0,
  findings: result.violations.map((v) => ({ checkId: v.rule })),
}),
actor: "ui audit",
```

**6 · `src/commands/autofix.ts`** (`:90-127`) — **conditional**. Record iff
`doWrite && written && findings.length > 0` (state-change only, per the locked decision:
an autofix that changed nothing records nothing; a non-`--write` run prints to stdout and
changes no state). Both the JSON and text returns must be wrapped; hoist the decision:

```ts
const recordable = doWrite && written && findings.length > 0;
const out = /* the existing JSON or text CommandResult, unchanged */;
if (!recordable) return out;
return withOutcome(out, parsed, {
  type: "autofix_applied",
  actor: "ui autofix",
  data: { file: filePath, fixCount: findings.length, ruleIds: [...new Set(findings.map((f) => f.ruleId))].sort() },
});
```

**7 · `src/commands/taste-record-impl.ts`** (`:63-64`, the `mode === "pair"` return only) —
record **every** pair vote including `tie`/`skip` (a tie is a judgment, not an absence):

```ts
appendVote(root, vote);
const out = useJson ? okJson(CMD, { recorded: vote }) : ok(`recorded pair vote: ${a} vs ${b} -> ${winner}\n`);
return withOutcome(out, parsed, { type: "taste_vote", actor: "ui taste record", data: { a, b, winner } });
```
The `mode === "study"` return (`:86`) is **untouched** (Decision 6).
**Known limitation, document in the module comment**: `taste record` has no `--dir`, so the
mirror only fires when cwd is a project with `design/`. `votes.jsonl` remains the vote's
system of record either way — no data is lost. P5's real-data run decides whether a `--dir`
flag is worth the `COMMAND_SIGNATURES` churn.

**8 · `src/commands/ds-change-token-impl.ts`** (`:347-354`) — the no-op branch (`:263-272`,
`changed: false`) returns **before** this and records nothing, which is the state-change
rule for free. Wrap the final success return:

```ts
const out = okJson(CMD, { path: tokenPath, from: oldSerialized, to: newSerialized, changed: true, generation: newManifestObj.generation, compiledHash: newHash });
return withOutcome(out, parsed, {
  type: "token_change",
  actor: "ui ds change-token",
  data: { path: tokenPath, from: oldSerialized, to: newSerialized, ...(reason !== undefined && { reason }), generation: newManifestObj.generation },
});
```
`reason` is included when present **on purpose**: `memory-corpus.shape()` embeds a
token_change into the semantic tier **only if it carries a reason** (`memory-corpus.ts:63-71`)
— so this one field is what makes a token change recallable prose. Note `--dir` here means
the DS dir (`ds-change-token-impl.ts:185-186`, `KNOWN_FLAGS` already contains `"dir"`), and
`memoryPaths` resolves `<dir>/design` from the same flag — consistent.

**9 · `src/commands/figma-reconcile-run.ts`** (`:163-177`) — **conditional**, apply-path
only (a dry-run returns at `:140-143` and writes nothing):

```ts
const recordable = changed || sidecarWrites.length > 0;
const data = { ...base, dry_run: false as const, applied: true as const, apply: report };
const out = useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderApply(data, report) };
if (!recordable) return out;
return withOutcome(out, parsed, {
  type: "reconcile_applied",
  actor: "ui figma reconcile",
  data: {
    added: report.added, updated: report.updated, deprecated: report.deprecated,
    mirrored: report.mirrored.length, cursorFrom, cursorTo,
  },
});
```
`ApplyReport.added/updated/deprecated` are `string[]` of component names
(`figma-apply.ts:54-64`) — the churn signal worth learning; `mirrored` is stored as a count
(the names are ⊇ added and would double-store). `changed` and `sidecarWrites` are already in
scope from the destructure at `:163`.

## Todo List

- [ ] Edit A + B in `src/core/memory-events.ts` (4 types + 4 REQUIRED_DATA entries + comments)
- [ ] Create `src/core/memory-autorecord.ts` (`recordOutcome`, `withOutcome`, `lintOutcomeData`)
- [ ] Wire call sites 1–5 (the `lint_run` five)
- [ ] Wire call sites 6–9 (the conditional four)
- [ ] `tests/memory-autorecord.test.ts`
- [ ] `tests/autorecord-call-sites.test.ts`
- [ ] Extend `tests/memory-events.test.ts` if it enumerates the closed set
- [ ] 4 gates: `npm run typecheck && npm run lint && npm run build && npm test`
- [ ] Art III smoke: run each of the 9 commands once against a real project with `design/`;
      paste the resulting ledger lines into the PR body

## Tests — file, name, assertion

### `tests/memory-autorecord.test.ts` (kernel, calls the functions directly)

Setup: `mkdtempSync(join(tmpdir(), "ease-autorec-"))`; set `EASE_DESIGN_HOME` to a second
tmpdir in `beforeEach` and restore in `afterEach` (plan invariant #5 — copy the pattern from
`tests/cmd-memory.test.ts:27-39`). Build `ParsedArgs` inline via `parseArgs([...])`.

- `describe("recordOutcome")`
  - `it("does nothing when the project has no design/ dir — no file is created")` → assert
    `{recorded:false, reason:"not-opted-in"}` **and** `existsSync(join(proj,"design")) === false`.
  - `it("appends one line and returns the monotonic id once design/ exists")` → mkdir
    `design/`, record twice, expect ids `e1`, `e2`, ledger has 2 lines.
  - `it("does not write design/memory.graph.json (the graph rebuilds lazily)")` → assert
    `existsSync(join(proj,"design","memory.graph.json")) === false` after a record.
  - `it("does not upsert the user registry (a lint must not write to $HOME)")` → assert
    `existsSync(join(home,"projects.json")) === false`.
  - `it("returns invalid-event, and writes nothing, when data misses a required key")` →
    `{type:"lint_run", data:{check:"a11y-lint"}}` → `reason:"invalid-event"`, ledger absent.
  - `it("never throws when the ledger is unwritable — returns write-failed")` →
    `chmodSync(paths.dir, 0o500)`; expect `reason:"write-failed"` and no throw. Restore mode
    in `finally`. (Skip on `process.getuid?.() === 0`.)
  - `it("stamps t from nowIso when given, so the line is byte-stable")` → record the same
    input twice into two fresh projects with the same `nowIso`; assert the two ledger lines
    are **byte-identical**. *This is the Art I acceptance assertion.*
- `describe("lintOutcomeData")`
  - `it("emits checkIds sorted and deduped")` → findings `[{checkId:"b"},{checkId:"a"},{checkId:"b"}]` → `["a","b"]`.
  - `it("is byte-stable: two calls on the same result stringify identically")` →
    `JSON.stringify(lintOutcomeData(...)) === JSON.stringify(lintOutcomeData(...))`.
- `describe("withOutcome")`
  - `it("returns the result untouched when the project is not opted in")` → `toBe` the same
    stdout/exitCode, `stderr` undefined.
  - `it("appends exactly one stderr warning on an invalid event, leaving stdout and exitCode alone")`.

### `tests/autorecord-call-sites.test.ts` (CLI seam, in-process via `run()`)

Copy the `capture()` helper from `tests/cmd-memory.test.ts:9-25`. Each test scaffolds a tmp
project **with `design/`**, writes a fixture input, `process.chdir(proj)` (restore in
`afterEach`) or passes `--dir` where the command supports it.

- `it("ui a11y-lint appends one lint_run event naming the rules that tripped")` → fixture
  HTML with a missing `alt` → parse the last ledger line → `type==="lint_run"`,
  `data.check==="a11y-lint"`, `data.checkIds` contains `"img-missing-alt"`.
- `it("ui a11y-lint records a CLEAN run too — a pass is an outcome")` → `errorCount:0`,
  `checkIds: []`, one event appended.
- `it("ui content-lint appends lint_run with check=content-lint")`.
- `it("ui taste-lint appends lint_run carrying the axes affected")` → `data.axes` non-empty.
- `it("ui validate-layout appends lint_run with check=validate-layout")`.
- `it("ui audit maps total violations onto errorCount and rules onto checkIds")` →
  `data.errorCount === data.checkIds.length > 0 ? … ` — assert `errorCount` equals the
  reported `total` and `warningCount === 0`.
- `it("ui autofix without --write records nothing (stdout only, no state change)")`.
- `it("ui autofix --write on already-fixed HTML records nothing (0 fixes = no change)")` →
  ledger absent/unchanged. *Idempotency is documented at `autofix.ts:44`.*
- `it("ui autofix --write that applies a fix appends autofix_applied with sorted ruleIds")`.
- `it("ui ds change-token records token_change carrying the reason")` → `data.reason` present.
- `it("ui ds change-token to the SAME value records nothing (the no-op branch)")`.
- `it("ui figma reconcile --dry-run records nothing")`.
- `it("ui figma reconcile --apply that changed the registry appends reconcile_applied")`.
- `it("ui taste record --mode pair appends taste_vote and never touches the designs graph")`
  → after the vote, `ui memory compile --now <iso>` → `graph.designs` is `{}`.
- `it("a lint in a project WITHOUT design/ exits 0/1 exactly as before and writes nothing")`
  → the regression guard for Decision 3.
- `it("a failing auto-record never changes the lint's exit code")` → point the command at a
  project whose `design/` is read-only; assert exit code equals the pristine run's.

## Success Criteria

1. Nine commands append a valid `MemoryEvent` on an outcome-bearing run; zero append on a
   no-op or a dry-run.
2. Same input + same `nowIso` → **byte-identical** ledger line (Art I). No model, no network.
3. `recordOutcome` is the only write path added; the nine sites call it via `withOutcome`
   (Art IV).
4. `existsSync(design/)` guard proven: no `design/` is ever created by a lint.
5. stdout / JSON envelope / exit code of all nine commands unchanged — the existing suite
   passes untouched.
6. `src/core/memory-autorecord.ts` < 200 lines (Art IX).
7. Four gates green + `ui knowledge check` clean.
8. Art III: one real project run, ledger lines pasted in the PR body.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| An old `ui` binary reads a new ledger → `BAD_LEDGER` on line 1 kills `memory compile` / `librarian collect` | Named in Key Insight 1; binaries are repo-linked and rebuilt via `design-os update`. State it in the PR body so the owner rebuilds every hand. |
| The ledger floods on a lint-heavy loop | Outcome-bearing only + `checkIds` not findings + P3's decay. P5 measures the real rate on VSF-PCP and demotes any chatty command. |
| `taste record`'s mirror never fires (no `--dir`, cwd is rarely a project) | Documented as a known limitation; `votes.jsonl` stays the system of record; P5 decides. |
| A heartbeat-invoked `ui audit` records into the wrong project (cwd ≠ project) | P1 is cwd-resolved by design; **P5's runners MUST pass `cwd=project_dir` to `subprocess.run` or call the core directly.** Carried into phase-05 as a binding constraint. |
| `parsed.flags["dir"]` on `figma reconcile` means the project dir, on `ds change-token` the DS dir | Both resolve `<dir>/design` — verified identical (`figma-reconcile-run.ts:54-57`, `ds-change-token-impl.ts:185-195`). |

## Security Considerations

No network, no model, no shell-out. Only new fs write: an append inside an **existing**
`design/` dir. `data.file` is the user's own argv; no secret is read or emitted. The stderr
warning surfaces only fs error text.

## Deviations from `plan.md` (report these to the gate)

1. **`token_changed` is NOT added — `token_change` already exists** with the exact payload
   (`memory-events.ts:42`). plan.md's list would have duplicated a live type.
2. **`audit_run` is NOT added** — folded into `lint_run` with `data.check = "audit"`
   (Decision 1).
3. **plan.md says "`taste vote` already has a shape"** — it does not. `taste_verdict`
   requires `scores/lowestAxis/round/pass`, and `user_pick` would corrupt the graph's
   `designs` map (Key Insight 3). New type `taste_vote` added instead.
4. **Net new types = 4** (`lint_run`, `autofix_applied`, `reconcile_applied`, `taste_vote`),
   not plan.md's 5.
5. **plan.md's helper signature `recordOutcome(kind, data, dir)`** → the real one takes
   `(parsed, input, nowIso?)`: the `--dir` read is centralised (Art IV), `actor` is carried,
   and `nowIso` is injectable so the byte-stability test can pin the clock. `withOutcome` is
   added as the call-site form so each site stays one line.
6. **`nextEventId(lineCount)` exists** and is used as-is; plan.md listed it correctly.

## Next Steps

- **P2** consumes this: `src/core/outcome-registry.ts` lists these nine sites and a linter
  fails if any drops its `withOutcome` call.
- **P3** may add graph reducers for `lint_run` / `taste_vote` (both are inert here by design).
- **P5** proves it on real projects — and carries the `cwd=project_dir` constraint above.
