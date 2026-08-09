# Repair prompt — frozen frame (§I)

This is the sole permitted repair mechanism in the pilot (frozen repair protocol, steps 3–5 of
`PREREGISTRATION.md`). It exists to fix listed machine-gate failures only — never to improve
taste, never to add content, never to second-guess a design decision the gates did not flag.

## The verbatim frame

> "You produced the attached artifact for the attached brief. Deterministic machine gates report
> the findings below. Fix ONLY these findings. Do not restyle, add content, or change design
> decisions beyond what a finding requires. You will not receive any other feedback, any other
> artifact, or any other guidance. This is the only repair. — [ARTIFACT] [ORIGINAL BRIEF]
> [MACHINE FINDINGS JSON]"

`[ARTIFACT]`, `[ORIGINAL BRIEF]`, and `[MACHINE FINDINGS JSON]` are filled by the orchestrator at
repair time with, respectively: the arm's initial-generation artifact bytes; the arm's original
brief re-supplied unchanged; and the exact findings JSON envelope from the initial gate run that
triggered repair eligibility.

## Hard rule — inputs are exactly those three

The repair receives **exactly** the three inputs named above. It never receives:

- any sibling arm (the paired control or treatment output for the same brief);
- any source material (corpus files, source prose, source URLs);
- any owner or curator feedback;
- any treatment guidance beyond the arm's own frozen prompt.

"Original brief" here means the **arm's own frozen prompt is re-supplied unchanged** as part of
this assembly — i.e., for a treatment arm, the re-supplied brief includes the same patch file that
was part of its original assembled prompt (`arm-prompt-template.md` + brief JSON + patch, per D5).
**Control repairs never see a patch** — a control arm's "original brief" re-supply is template +
brief JSON only, exactly as it was assembled for the initial generation, with no patch introduced
at repair time under any circumstance.

## Repair legality (protocol rule, restated)

- Repair is permitted **only after** a listed machine gate failure on the initial-generation
  artifact. If all gates pass initially, repair is **prohibited** — there is no discretionary or
  optional repair pass.
- Exactly one repair attempt per arm. The repair itself is generated single-shot from the frame
  above, gates are run once more, and the unrepaired initial output or the sole repaired output
  becomes the arm's **primary artifact** (never both, never a second repair).
- **Both versions are preserved.** The initial artifact is never deleted or overwritten by a
  repair; both are committed as evidence. Initial-state and repair-rate analyses are diagnostic
  only — they carry no weight in the family/candidate endpoint decision.
- A still-ineligible artifact (fails gates again after its one repair) is **not regenerated**. It
  is preserved as a failed/ineligible run, which per the fail-closed truth table (`spec.md` §N /
  architecture §N) makes its pair non-confirmatory.
- **Undefined correction reduction, including 0→0, is `null`, never improvement.** If a repair was
  not performed (gates passed initially, or the finding count was already zero), the
  `repair_reduction` field in the pair's result is recorded `null` — it is never coerced to `0` or
  read as an improvement signal.
