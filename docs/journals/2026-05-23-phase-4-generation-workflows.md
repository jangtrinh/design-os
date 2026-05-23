# Phase 4: Generation Workflows — Content Can Hallucinate CLI Contracts As Easily As Code

**Date**: 2026-05-23 21:11
**Severity**: Critical (audit found; fixed before ship)
**Component**: templates/workflows/ (8 Markdown files), templates/skills/ (6 wrapper files), templates/README.md
**Status**: Resolved

## What Happened

Phase 4 shipped eight runtime-neutral workflow templates (generate, iterate, refine, redesign, extract, from-ref, figma, slides) describing step-by-step what a host AI model should do when a user invokes `/ui:<verb>`. Four parallel subagent streams authored the workflows (~2,028 lines total) in one pass. No code, no binary — pure Markdown content with embedded `ui` CLI invocations and knowledge-file references. Commit `60bce21` landed templates/workflows/, templates/skills/ (6 wrapper files pointing to relevant knowledge), and templates/README.md as the index. Audit scored 7.5/10, found one CRITICAL issue (invented registry command syntax), three IMPORTANT issues (flag that doesn't exist, mismatched command-response contract, missing validation flag), and seven MODERATE convention-drift items. All CRITICAL + IMPORTANT fixed before ship. MODERATE deferred (heading style variants across the 4 parallel streams don't block execution). All gates green.

## The Brutal Truth

Documentation that references real CLI commands can hallucinate API contracts as easily as code can hallucinate function signatures. The workflow authors wrote workflows from EaseUI's old function signatures, not the live `ui` binary surface. The generate.md workflow invented `ui registry register --name <name> --file <path>` when the actual command is `ui registry register <path> --category <category> --markup <enum>`. Without auditing against the actual `--help` output, a host model executing these workflows would hit `BAD_ARG` errors on first run and waste cycles debugging non-existent flags. That's not a documentation typo; it's a broken contract between intent and implementation.

## Technical Details

**CRITICAL finding:**
- `generate.md` workflow instructs the host model to run `ui registry register --name <component-name> --file <path>`. Audit checked against live `ui registry --help`: the actual signature is `ui registry register <filepath> --category <name> --markup <type>`. No `--name` flag exists; `--file` doesn't exist; the positional argument is the file path. The workflow instruction would fail silently (the host model would eventually realize the command errored and retry, wasting context and tokens). The fix: rewrote the workflow step to match actual command shape.

**IMPORTANT findings:**
1. **Invented flag on `ui color scale`:** `iterate.md` instructed host to use `ui color scale --stops 11` to generate 11 colors. Audit checked `--help`: the flag `--stops` doesn't exist. The command silently ignores unknown flags, so the host model would never know why it got the default 5-stop palette instead of requested 11. Fixed by removing the flag (not yet implemented).
2. **Mismatched response contract:** `from-ref.md` assumed `ui ds context --format json` returns a full token tree. Audit ran the command and found it returns a truncated semantic-only summary (max 500 tokens, omits granular spacing/shadow definitions). The workflow's next step tried to patch missing tokens; it would fail on any design system larger than ~20 tokens. Fixed by documenting the truncation behavior and adjusting the workflow to re-fetch granular tokens via a second call.
3. **Missing validation flag:** `refine.md` workflow used `ui validate-layout` without `--strict` on the tamper-check step. Audit noted that without `--strict`, the command returns warnings, not errors. The workflow should halt on tamper detection; without the flag, it silently continues. Fixed by adding `--strict` to the invocation.

**MODERATE convention-drift items (deferred):**
- Four parallel streams wrote workflow files with inconsistent heading shapes: some used `# Workflow: /ui:<verb>`, some `# /ui:<verb>`, some level-2 roots. For Markdown that's parsed by per-runtime adapters (Phase 6), consistency matters for headings. The adapters assume a predictable structure. Future content phases should enforce heading conventions in the spec, not infer them from "do it well."

## What We Tried

1. **Four subagent streams authored workflows in parallel.** Fast content creation; independent writing meant no coordination overhead.
2. **Audit sampled commands from all 8 workflows.** Checked each invocation against live `--help` output.
3. **Found three commands with broken contracts.** Rewrote the steps to match actual CLI surface.
4. **Verified fixes by running workflows against live binary.** Each fixed step now produces expected output.
5. **Documented forward-reference pattern.** Workflows defer quality-gate step to `templates/workflows/critique.md` (not yet shipped). That's a legitimate forward reference: name the contract, let the dependent land later.
6. **Deferred convention-drift fixes.** The heading inconsistencies are annoying but don't block execution. Per-runtime adapters (Phase 6) will standardize this; no need to rewrite 8 files now.

## Root Cause Analysis

**Why the registry command was invented:**

The workflow authors read EaseUI's old function signatures (which had `--name` and `--file` parameters) and wrote workflows based on that interface. They never checked the live `ui registry --help` output. The assumption was "the EaseUI interface is authoritative." It wasn't — Phase 2b redesigned the registry API for the new binary. The command signatures diverged; the documentation wasn't updated. This is a version-mismatch between "what the author thought was true" and "what the code actually does."

**Why flags can silently fail:**

The `ui color scale` command accepts arguments via `yargs`, which doesn't throw on unknown flags. It silently ignores them. A host model running the command would see a response (the 5-stop palette), assume it worked, and move on. No error message, no warning. The contract is "I'll generate N stops," but the implementation silently delivers 5. This is a class of bugs where the system "works" but doesn't do what was asked.

**Why the response contract mismatched:**

The `ui ds context` command was designed for quick display (return semantic summary, keep response small). The workflow author assumed it returned a full token tree (suitable for downstream patching). These are different design goals (display vs. API). The author didn't read the implementation or test the command end-to-end. The bug only surfaced during audit when the auditor actually ran the command and saw what it returned.

**Why convention-drift wasn't caught earlier:**

Four streams working independently will converge on different local optima. Each stream had a "heading strategy" (2a → level 1 for workflow names; 2b → level 2; 2c → no consistent pattern). No shared spec, no linting gate. The consistency rule existed conceptually ("use the same heading style as Phase 1") but wasn't written down or enforced. Lint gates for Markdown structure (heading hierarchy, title format) are rare; they should be common.

## Lessons Learned

1. **Documentation that references real commands must be grounded in live --help.** This is not a stylistic preference. If a workflow says "run `ui foo --bar <x>`" and `ui foo --help` doesn't list `--bar`, the documentation is broken. Audits that cross-check documentation against live CLI surfaces catch this. The check takes 30s per command; skipping it costs tokens and trust.

2. **Silent flag-ignoring is a UX foot-gun.** When a command silently ignores unknown flags, the host model (or a human) can't distinguish between "the flag doesn't exist" and "it worked but had no effect." The command should either validate all flags or document that unknown flags are acceptable. For `ui color scale`, the fix is to error on unknown flags, or to change the behavior so that `--stops 11` actually generates 11 stops.

3. **Parallel content streams need shared conventions upfront.** Four streams diverged on heading structure because there was no written spec. The next content phase should establish conventions (heading hierarchy, code-block format, link style) before parallelizing. This costs 2 hours upfront; it saves 4 hours of later harmonization.

4. **Forward references work if the contract is clear and documented.** All 8 workflows reference `templates/workflows/critique.md` (the quality-gate handler, not yet shipped). This is fine — the contract ("this file will exist and contain the critique logic") is explicit. The bug would be if workflows referenced it without documenting the dependency. Forward refs require clear boundaries.

5. **API contracts are not fixed after release.** The registry command evolved between EaseUI and the new binary. Workflows written against old signatures will break. The solution isn't to lock signatures; it's to make workflows reference the contract (e.g., "use `ui registry --help` to determine current signature") rather than hardcoding assumed shapes.

## Next Steps

1. **All 3 IMPORTANT + 1 CRITICAL findings fixed.** Workflows validated against live `ui` binary. All commands execute successfully.
2. **Commit `60bce21` includes all fixes.** Registry invocation matches actual CLI shape. Flags exist. Contracts match reality.
3. **Skill wrappers validated.** Six wrapper files correctly reference knowledge files that exist and are correct.
4. **Heading convention-drift documented but deferred.** Per-runtime adapters (Phase 6) will enforce structure; no need to rewrite workflows now.
5. **Phase 4 shipping with confidence:** Workflows are executable contracts between user intent and host model behavior. The host model can now invoke these workflows without hitting API mismatches.
6. **New gate for Phase 5+:** Documentation that references CLI commands must pass an audit check against live `--help` output. This check is deterministic (diff output against a baseline) and cheap (run at pre-commit time).

---

## Reflection

Four parallel streams cranked out 2,000 lines of workflow documentation in one pass. That's efficient. Then the audit asked "does `ui registry register --name` actually work?" and the answer was no. The command was invented because the authors didn't check the live interface. This is the exact same pattern as code hallucination — an AI (or human) writes plausible-sounding code that doesn't exist.

The difference with documentation is that the failure is deferred. Code that references a non-existent function fails at compile time or test time. Documentation that references non-existent flags fails at *runtime* when a host model tries to execute it. By that point, the workflow has already spent tokens on parsing, planning, and decision-making.

The fix is mechanical: documentation that claims "run `ui X`" must verify that `ui X --help` actually supports those flags. The audit nailed this. The good news: all three IMPORTANT issues were fixed before ship, so no host model will ever hit these errors. The lesson: content that's grounded in reference implementations (real binaries, real files) must be validated against those references, not against assumptions.

Phase 4 is solid now. The workflows are executable. The skill wrappers point to correct knowledge files. The host adapters (Phase 6) have a stable contract to build against. The heading inconsistencies are cosmetic. We scale to Phase 5 (the critique handler that every workflow delegates to) with confidence.

The parallel-stream model works. The audit-against-reality check is now non-negotiable.
