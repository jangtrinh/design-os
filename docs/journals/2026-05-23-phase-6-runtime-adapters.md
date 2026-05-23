# Phase 6: Per-Runtime Adapters — Binary Path Resolution Bug Invisible to Source Tests

**Date**: 2026-05-23 15:42
**Severity**: Critical (audit found; fixed before ship)
**Component**: src/commands/init.ts (runtime adapter generator), tests/cmd-init-*.test.ts (new production-binary tests), templates/ (canonical reference resolution)
**Status**: Resolved

## What Happened

Phase 6 upgraded `ui init --runtime <claude|antigravity|codex>|--all` from a Phase 2c stub to a full adapter generator. The implementation: resolve templates directory, validate against runtime manifests, render per-runtime artifact files (15 Claude: `.claude/commands/ui/` slash-commands + skills; 15 Antigravity mirrored under `.agent/`; Codex sentinel in `AGENTS.md`), reference templates by absolute path + sha256 hash (no duplication), cross-runtime all-or-nothing rollback on partial failure. Shipped in 609 tests, all gates passing. Then the audit ran `node dist/cli.js init --runtime claude` against a tmp directory and got `WRITE_ERROR: templates directory not found`. The entire test suite passed against a binary that couldn't find its own templates.

## The Brutal Truth

The implementation was correct in the numbers: new code integrated smoothly, 609 → 609 tests green, determinism gates passing, persona-fidelity score steady. The brutal fact is that the test suite was blind to a production-breaking bug.

Why? The tests import `src/commands/init.ts` directly. When vitest reads that file, `import.meta.url` resolves relative to the source tree: `resolve(dirname(thisFile), "..", "..", "templates")` from `src/commands/init.ts` lands at the repo root by accident. The same path, when bundled into `dist/cli.js` and executed via `node dist/cli.js`, resolves from the `dist/` directory, overshooting the repo root into the parent. Off-by-one directory walk. The bug was invisible to vitest's source-import semantics but fatal at runtime.

This is infuriating because the test coverage *looked* complete. Every code path exercised, every error case validated, 100% pass rate. The test suite was testing the wrong thing: not the binary users will run, but a loose interpretations of the source tree.

## Technical Details

**Critical finding — path resolution off-by-one:**
- `src/commands/init.ts` line 47: `const templatesDir = resolve(dirname(import.meta.url), "..", "..", "templates");`
- When vitest imports `src/commands/init.ts` directly: `import.meta.url = "file:///repo/src/commands/init.ts"` → dirname → `/repo/src/commands` → up two levels → `/repo` → correct.
- When bundled `dist/cli.js` runs via `node`: `import.meta.url = "file:///repo/dist/cli.js"` → dirname → `/repo/dist` → up two levels → `/` → templates not found.
- Fix: compute path from `process.cwd()` + relative markers, or embed templates absolute path at bundle time. Chose: upward-walk from `process.cwd()` to find `templates/workflows/generate.md` (canonical sentinel), fail explicitly if not found.

**Why vitest missed it:**
- All 609 tests passed because vitest's resolution of `import.meta.url` in source files happens in the source tree context.
- The bug only manifests when `import.meta.url` is evaluated in the bundled context (via `node dist/cli.js`).
- No test spawned the actual built binary; all tests directly imported the TypeScript source.

**The fix required two layers:**
1. **Upward-walk sentinel:** Replace hard-coded relative path with filesystem walk. Start from `process.cwd()`, walk up the directory tree, look for `templates/workflows/generate.md` (not just any `templates/` dir). Fail with `TEMPLATES_NOT_FOUND` if walk reaches filesystem root.
2. **Production-binary tests:** Added `tests/cmd-init-built-binary.test.ts` — spawns the actual `node dist/cli.js init --runtime <r>` against real tmp directories. 7 tests; 6 fail if the path fix is reverted (auditor verified by commenting out the fix, re-running tests).

**Audit also found:**
- **Partial failure leaves orphans:** `--all` rolled back the manifest but not adapter files of earlier-succeeded runtimes. Fixed: single accumulator tracking all writes across the loop; catch block unwinds the full set.
- **Plan references in new code:** Two comments said `(F5)` and `failure mode F8` (plan codes). Grep-verified clean; comments rewritten to explain the actual invariants.
- **Sentinel inconsistency:** The `snapshots` Map used `null` to mean "not yet generated" and `undefined` elsewhere. Innocent coincidence — current code path doesn't hit the mismatch — but a future refactor bypassing Step 1 would flip semantics. Fixed: always use `null`; asserted in type.
- **Misleading error text:** `--all` error said "manifests already exist" when the conflicting path was an adapter file (e.g., `.claude/commands/ui/build.md`). Fixed: categorize conflict and name the actual file.
- **Template-walk accepts any `templates/` directory:** Upward-walk accepted any directory named `templates/` in a parent. In a monorepo with sibling packages, could latch onto the wrong one. Fixed: require `templates/workflows/generate.md` to exist (canonical marker). Auditor verified by planting a decoy-templates dir; walk correctly skipped it.
- **Arbitrary 5-hop cap:** Original code had `for (let hops = 0; hops < 5; hops++)` — no documented reason for 5. Replaced with "walk until root" + explicit root-check. Simpler, more robust.

## What We Tried

1. **Wrote full adapter generator.** Templates directory resolution via relative path, per-runtime artifact rendering, atomic rollback on partial failure. Logic clean; 609 tests green.
2. **Audit ran production binary:** Spawned `node dist/cli.js` against real tmp dir. Immediately hit `WRITE_ERROR: templates directory not found`. The bug that vitest couldn't see.
3. **Traced path resolution:** Found off-by-one in directory walk. `import.meta.url` resolves differently in source vs. bundled context. Vitest was testing source; users run bundled.
4. **Upward-walk fix with canonical sentinel:** Replace hard-coded relative path with filesystem walk starting from `process.cwd()`, looking for `templates/workflows/generate.md`. Walk stops at root or success.
5. **Added production-binary test suite:** `tests/cmd-init-built-binary.test.ts`, 7 tests spawning real `node dist/cli.js` against tmp dirs. 6 tests fail if path fix reverted (auditor verified).
6. **Fixed 5 additional findings:** Partial-failure orphans (accumulator-based rollback), plan references (grep-verified clean), sentinel consistency (`null` only), error categorization, template-walk decoy resistance.
7. **Re-audit after fixes:** 619 tests (added 10 spawn tests), all gates green, no plan references in code, §5 grep clean, persona fidelity still passing.

## Root Cause Analysis

**Why the path bug was invisible to vitest:**

When a test imports `src/commands/init.ts` directly, Node resolves `import.meta.url` to the source file's actual location on disk. The path walk (`..` `..` from `src/commands/`) coincidentally lands at the repo root because the source tree is shallow enough. But the same code path in the bundled binary (`dist/cli.js`) resolves `import.meta.url` to the bundle entry point, and the path walk overshoots. Two execution contexts, two different `import.meta.url` values, one passing test suite.

This is a gap between "source compiles and tests pass" and "bundled binary runs correctly." The test harness exercises source; the shipped artifact is bundled. They behave differently.

**Why Phases 1–5 didn't encounter this:**

Earlier phases had small init stubs or no filesystem walking. The Phase 6 adapter generator is the first to compute a templates path based on `import.meta.url`. The bug was latent in the bundled-binary semantic all along; Phase 6 just exposed it.

**Why upward-walk was the right fix over hard-coding paths:**

Hard-coding `resolve(dirname(bundleEntry), "../../templates")` would embed the bundle layout at compile time. If the binary moves or a monorepo reorganizes the structure, the path breaks. Upward-walk from `process.cwd()` is resilient to deploy structure; as long as `templates/` is *somewhere* in a parent, the binary finds it. The canonical sentinel (`templates/workflows/generate.md`) prevents latching onto decoy directories.

**Why partial-failure rollback needed cross-iteration tracking:**

Each iteration's rollback was locally correct: if iteration N fails, undo N's writes. But the bug was across iterations: if Claude succeeds, Antigravity fails, Codex succeeds, we had Claude and Codex files orphaned on disk with the manifest rolled back. The fix is a single accumulator tracking all successful writes, and the catch block unwinds the full set atomically.

## Lessons Learned

1. **Source-import tests are blind to bundled-binary resolution bugs.** vitest reading `src/` doesn't exercise the same code paths the bundled binary does. Adding spawn tests (`spawnSync("node", [dist/cli.js, ...])` against tmp dirs) is not optional for filesystem-heavy commands; it's essential. These tests are slower than unit tests but catch a class of bug unit tests structurally cannot see. Earned their keep on Phase 6.

2. **`--all` atomicity must span iterations, not just single iterations.** Per-iteration rollback is necessary but insufficient. If one iteration succeeds and the next fails, the earlier writes must also roll back. The fix: accumulate all side effects in a shared tracker, and the outer catch unwinds the full set. This pattern applies to any multi-step operation with rollback.

3. **Filesystem walks that accept "any candidate" find the wrong one.** The upward-walk for `templates/` worked in clean single-package repos but latched onto monorepo siblings. Canonical sentinel pattern (require a specific marker file inside the directory, not just the directory name) is the standard fix. This adds two lines and eliminates the ambiguity.

4. **Plan-reference creep is recurring because it's not enforced at write-time.** Phase 2c had `OD-1` in user-facing error text. Phase 5 had `Phase 2b` in test describe. Phase 6 had `(F5)` and `failure mode F8` in code comments. Each is small, each is caught by the same grep rule, but each was authored fresh because the rule isn't automated. Eventually needs a pre-commit hook to reject code containing plan codes. For now, audit discipline is the only gate.

5. **"All tests green" and "code works in production" are not synonymous.** A 100% pass rate is loud and reassuring. But if the test suite tests the wrong thing (source import instead of bundled binary), it's a false signal. The auditor's empirical run (`node dist/cli.js init --runtime claude` in a tmp dir) is the truth test. Retrospectively adding spawn tests that exercise the same path as real users is the fix.

## Next Steps

1. **All 6 findings fixed.** Path resolution uses upward-walk with canonical sentinel. Partial-failure rollback spans iterations. Plan references grep-verified clean. Sentinel consistency enforced. Error categorization precise. Template-walk decoy-resistant.
2. **619 tests green, all gates passing.** Commit includes adapter generator + spawn tests.
3. **Production-binary test pattern established:** For any command that does filesystem I/O (write, read, walk), add a spawn-test suite alongside unit tests. Cost: +10% test time, gain: catches bundled-binary bugs unit tests miss.
4. **Phase 6 shipping with confidence:** Adapters generate deterministically. Per-runtime files land correctly. Cross-runtime rollback is atomic. Path resolution is robust to repo structure.
5. **New audit discipline for filesystem-heavy phases:** When a command computes paths or walks the filesystem, audit includes a spawn-test verification step. Don't trust `import.meta.url` behavior in source tests.

---

## Reflection

The implementation felt clean. 609 tests passed. All four gates (determinism, persona-fidelity, coverage, style) came back green. The code integrated smoothly into the adapter pipeline. Then the auditor did the simplest possible thing: ran the command the way a user would and watched it fail immediately.

This is the gap that haunts every compiled or bundled project: the test suite is authored against the source tree, but users run the artifact. A 100-line vitest suite passing against source doesn't mean the bundled binary works. It means the test suite works, which is a different claim.

The fix had two parts. First, the code fix: replace hard-coded relative path with upward-walk + sentinel. Second, the test fix: add spawn tests that exercise the actual binary. The second part is the one that sticks. Every phase going forward needs spawn tests for filesystem operations. That's not overhead; that's the reality test.

The other findings (partial-failure orphans, plan references, sentinel consistency) were secondary. Important to fix, but not the core lesson. The core lesson is: **your tests are only as good as what they test.** If you test source, you learn about source. If you want to know about the bundled binary, you have to test that too.

Phase 6 ships solid now. Adapters generate, paths resolve, rollback is atomic, production-binary tests pass. And next time someone implements a filesystem command, the spawn-test requirement is non-negotiable.
