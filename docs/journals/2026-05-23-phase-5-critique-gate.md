# Phase 5: Critique Gate — Contract Tracing Catches the Phantom Handoff

**Date**: 2026-05-23 23:47
**Severity**: High (audit found; fixed before ship)
**Component**: templates/workflows/critique.md (466 lines, new), templates/workflows/extract.md (+133 / −34), knowledge/taste-rubric.md (+21 lines)
**Status**: Resolved

## What Happened

Phase 5 shipped the critique gate — a six-axis + one "vibe" taste rubric that scores generated designs (visual consistency, semantic alignment, spacing balance, color harmony, depth hierarchy, contrast fidelity, and vibrational fit). The workflow was clean: ingest variant HTML, score each axis 0–10, enforce ≥7 threshold to pass, guide refine loops for 3 rounds max, return structured JSON with per-axis feedback and best-revision metadata. Added a 26-row vibe-word mapping table to anchor "this variant *feels* like 'industrial minimalism'" to measurable axis scores. Commit `2e1bd26` landed critique.md (466 lines), taste-rubric.md (+21 lines, thresholds subsection), and an overhaul of extract.md's gate logic. Audit scored 8.5/10, flagged three IMPORTANT correctness bugs (artifact overwrite losing prior rounds, inconsistent field presence, unclamped loop bounds), one design pattern issue (refine loop could ping-pong on Tailwind arbitrary values). All fixed before ship. Two lessons worth recording.

## The Brutal Truth

The critique workflow itself was straightforward to write. It cleanly scored seven axes, handled refine feedback, returned structured JSON. The real catch came when the auditor traced the *contract* between extract.md and critique.md — the handoff that extract.md claimed to own.

Extract.md promised: "passes HTML variant to the critique handler." But what extract actually produces is a design system (tokens, palette definitions, layout schema) plus regenerated component CSS. No HTML. No visual artifact. Nothing for critique's visual axes to grade against.

Two files claiming a contract neither side honored. Extract said "I hand off to critique." Critique said "I score your HTML." They were talking about different things. The audit found this by tracing both directions: "does extract produce what critique consumes?" Answer: no. That's a contract violation, not a documentation typo.

## Technical Details

**IMPORTANT findings:**

1. **Artifact overwrite loses prior rounds:**
   - Critique.md Step 6 promised: "return the best revision so far, across all rounds."
   - Implementation: overwrote the variant HTML in-place every round.
   - By round 3, the earlier rounds' HTML files were gone. The "best so far" option disappeared.
   - Fix: added per-round `.r<N>.bak` backups. Step 6 now compares all three rounds, returns the best.

2. **Inconsistent field presence:**
   - Output JSON had `consistencySkipped: true` only when there was no design system to validate against.
   - Consumers couldn't tell if `consistencySkipped` being absent meant "it ran and passed" or "it was skipped."
   - Fix: renamed to `consistencyScored: boolean`, always present. Clear intent: `true` = axis was scored, `false` = skipped.

3. **Unclamped loop bounds:**
   - Step 1 validated `round: 1 | 2 | 3`, but didn't enforce it on input.
   - A caller handing `round: 0` would infinite-loop. `round: 5` would short-circuit before refine could engage.
   - Fix: Step 1 now validates `1 ≤ round ≤ 3`, returns error code `BAD_ROUND` if violated.

**Design pattern issue:**

4. **Tailwind arbitrary-value ping-pong:**
   - Refine prompt permitted `bg-[#1a1614]` (arbitrary-value utilities) to fix Spacing or Depth axis issues.
   - Consistency axis flags arbitrary-value utilities as raw literals when a semantic DS token exists.
   - Round 1: refine suggests `bg-[#1a1614]`. Round 2: Consistency fails it. Round 3: refine suggests it again. Infinite loop risk.
   - Fix: tightened constraint to "arbitrary-value utilities ONLY when no equivalent DS token exists." Passes this constraint to the refine prompt.

**The phantom contract:**

5. **Extract→Critique handoff is impossible:**
   - Extract.md (Phase 4 workflow) produced: design system, token registry, regenerated CSS, derived Tailwind config.
   - Critique.md (Phase 5 workflow) consumes: HTML variant to score visually.
   - Extract never generates HTML. Critique has no visual artifact to grade.
   - The contract was declared but never tested. Extract said "we defer visual assessment to critique." Critique said "score the HTML." They were incompatible.
   - Fix: Extract.md's gate was replaced with DS-validity checks using actual binary commands: `ui ds context --strict` (validate token tree), `ui registry list --json` (verify component registry), contrast spot-checks on semantic palette, `change-token` round-trip to verify mutation contract.

## What We Tried

1. **Wrote critique.md cleanly:** Six visual axes + vibrational fit, bounded to 3-round refine loop, structured JSON output. Audit passed initial logic.
2. **Ran audit against both extract.md and critique.md together:** Traced the claimed handoff. Found extract produces no HTML.
3. **Replaced extract's gate:** Instead of deferring to critique (impossible), extract now validates the design system artifact itself using commands the binary actually provides.
4. **Fixed three IMPORTANT correctness bugs:** Backup per-round HTML, made `consistencyScored` always-present, clamped `round` input to 1–3.
5. **Tightened refine constraint:** Arbitrary-value utilities only when no DS token equivalent exists. Prevents Consistency ping-pong.
6. **Verified against binary:** Tested all DS-validity commands used in extract.md against live `ui` binary. All commands execute, contracts match.

## Root Cause Analysis

**Why the contract phantom happened:**

The workflow authors assumed a linear pipeline: "generate → extract → critique." They wrote extract.md to defer visual assessment, and critique.md to receive that deferred artifact. But extract produces artifacts and code, not visual designs. The handoff was conceptually clean (separation of concerns) but physically impossible (extract has no HTML to hand off). The assumption was not validated against what the binary actually produces.

**Why artifact overwrite destroyed the "best so far" option:**

Step 6 promised "return the best revision," but the implementation looped 1–3 times, overwriting the variant HTML each round. The promise required keeping all three revisions in memory or as files. The implementation didn't. This is a classic mismatch between promised semantics (best-of-N) and implemented semantics (final-only).

**Why the field went conditional-on-absence:**

The author added `consistencySkipped: true` only when consistency was skipped, to signal "this axis wasn't scored." But the absence of a field is noisy — callers see no `consistencySkipped` and don't know if the axis ran and passed, or was skipped. Explicit fields (even when redundant) beat silent absence.

**Why the loop bounds weren't clamped at entry:**

The validation was in Step 1, but Step 1 didn't reject invalid input — it just logged "round must be 1–3" and continued. The author assumed the caller would read the log. Validation that doesn't halt is aspirational, not operational.

**Why the Tailwind ping-pong wasn't caught earlier:**

The refine prompt looked good in isolation: "use Tailwind if helpful, including arbitrary values." The Consistency axis also looked good: "flag raw literals when DS tokens exist." Neither rule is wrong. But run them back-to-back in a loop and they fight each other. This pattern — two correct rules that conflict at scale — is hard to catch without running the full loop.

## Lessons Learned

1. **Contract tracing is bidirectional.** When workflow A says "defers to workflow B," both A and B's input/output shapes must be verified. Declaring the handoff on A isn't a contract — it's an assertion B has to honor. The audit caught this by asking: "does extract produce what critique consumes?" No. Then it's not a contract, it's a wish.

2. **Always-present fields beat conditional-omit fields.** `consistencyScored: boolean` is unambiguous; `consistencySkipped?: true` requires consumers to know that an absence means "it ran and passed." Explicit intent wins. Pay the small cost of a redundant field to eliminate ambiguity.

3. **Bounded loops need clamped inputs.** A 3-round cap doesn't bound the loop if the caller can hand in round 0 or 5. Validation that logs but doesn't halt is theater. Reject invalid input at the entry point, return error code, let the caller decide what to do.

4. **In-place mutation throws away the "best so far" option.** If a workflow promises to return the best revision across N rounds, it must keep all N candidates. Overwriting in-place is incompatible with the promise. This is a semantic contract — the implementation must match the advertised behavior.

5. **Two correct rules can ping-pong in a loop.** The refine rule (use arbitrary values when helpful) and the Consistency rule (flag raw literals) are both correct in isolation. But in a feedback loop they fight. Audit that runs the full loop under realistic constraints, not just individual components.

6. **Documentation is grounded in what the system produces, not what we intended to produce.** Extract.md was written from intent ("we'll separate visual concerns") rather than from what the binary actually outputs. The only way to catch this is to trace the actual data flow — what does extract produce? Who actually consumes it? If the answer is "nobody consumes what extract produces," you have a phantom handoff.

## Next Steps

1. **All 3 IMPORTANT + 1 design-pattern findings fixed.** HTML backups in place. `consistencyScored` always present. Loop bounds clamped. Tailwind constraint tightened.
2. **Commit `2e1bd26` includes all fixes.** Extract.md's gate replaced with DS-validity checks. Critique.md scoring and refine logic solid.
3. **Extract→Critique contract resolved:** Extract now validates its own artifact (design system), not defers to critique. Critique validates visual designs when HTML is available (Phase 6, per-runtime adapters). No phantom handoff.
4. **Taste rubric shipped with explicit thresholds:** Each axis ≥ 7/10 to pass, rationale documented in taste-rubric.md. Vibe-words table (26 rows) anchors qualitative fit to axis scores.
5. **Phase 5 shipping with confidence:** Critique gate is deterministic, audit-tested, contracts verified bidirectionally. Refine loops bounded, field semantics explicit.
6. **New audit pattern for Phases 6+:** When two workflows claim to hand off to each other, audit must trace both directions. Don't trust the declaration; verify the data flow.

---

## Reflection

Writing critique.md was the easy part. The workflow cleanly implemented a seven-axis rubric, handled refine feedback, returned structured JSON. The audit didn't flag correctness issues with the logic itself.

The hard part was the contract. Extract.md said "we defer visual assessment to critique." Critique.md said "I score the HTML." The auditor asked: "does extract produce HTML?" No. Then who's consuming what?

This is a class of bug that doesn't exist in code. Code either compiles or it doesn't. But a workflow can declare a contract it doesn't actually fulfill. The contract exists in prose, not in types. The only way to catch it is to trace the actual data flow: artifact from A, what does B consume, do they match?

The fix for extract.md wasn't to make it produce HTML (that's Phase 6, per-runtime). It was to replace the phantom handoff with a real gate that validates what extract actually produces. DS-validity checks using real `ui` commands.

Phase 5 is solid now. The three IMPORTANT bugs are fixed. The phantom contract is replaced. Critique scores reliably. Refine loops don't ping-pong. The lesson — contract tracing is bidirectional — is one we'll apply to every handoff going forward.

The audit discipline is paying off. We're catching mismatches between prose and reality before they ship.
