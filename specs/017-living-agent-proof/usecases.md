# Living Agent Proof - Use Cases

## UC-01: Prove applied memory

**Actor:** host design agent
**Precondition:** a source correction or lesson exists
**Happy path:**

1. The agent retrieves a project lesson.
2. It records why the lesson is relevant.
3. It links the lesson to a concrete decision and later artifact.
4. Qualification evidence records the result.

**Edge cases:** stale lesson, missing artifact, application before lesson, cross-project lesson.

## UC-02: Prove defect prevention

**Actor:** design-system maintainer
**Precondition:** a defect escaped an earlier gate
**Happy path:**

1. Record the escaped defect and root cause.
2. Link the correction and new gate.
3. Link a negative fixture that reproduces the defect.
4. Record a later run where the gate detects recurrence or remains clean across applicable work.

**Edge cases:** fixture does not fail, gate predates defect, no later applicable run.

## UC-03: Prove outcome improvement

**Actor:** evaluator
**Precondition:** comparable control and treatment artifacts exist
**Happy path:**

1. Hold inputs and rubric constant.
2. Blindly evaluate memory-disabled control and memory-enabled treatment.
3. Record quality, repair rounds, repeated feedback, and regressions.
4. Apply declared thresholds.

**Edge cases:** uncontrolled inputs, unblinded evaluator, missing isolation test, regressions.

## UC-04: Diagnose proof infrastructure

**Actor:** maintainer
**Precondition:** project contains a DESIGN:OS store
**Happy path:** detect nested competing stores, absent heartbeat state, unresolved corrections,
and missing causal receipts.

## Acceptance criteria

```gherkin
Given a proof with source evidence and a later applied-memory receipt
When the deterministic validator runs
Then it verifies chronology, project scope, decision linkage, and artifact evidence
```

```gherkin
Given a defect-learning record
When the record lacks a failing negative fixture or a later run
Then the project cannot receive an APPLIED prevention verdict
```

```gherkin
Given a controlled memory-on and memory-off comparison
When treatment improves by at least 10 curator points, reduces repair rounds by at least 25 percent,
reduces repeated correction categories by at least 70 percent, and introduces no regression
Then the proof may receive IMPROVING
```

```gherkin
Given evidence from another project
When no explicit shared-knowledge approval exists
Then the validator rejects its use as project memory
```

```gherkin
Given nested DESIGN:OS memory stores
When proof diagnostics run
Then the report names the competing paths and refuses to treat their combined count as evidence
```

## Error states

| Condition | Result |
|---|---|
| Missing proof | ALIVE may still be reported; higher levels remain unproven |
| Malformed proof | Deterministic findings identify fields and reasons |
| Uncontrolled comparison | IMPROVING rejected |
| Regression present | IMPROVING rejected regardless of score gain |
| Stale contradiction | APPLIED rejected when the newer explicit rule was ignored |
| Cross-project leakage | APPLIED and IMPROVING rejected |

## Design-system check

This is a CLI/evidence feature. No visual tokens or components are introduced. It extends the
existing evolution command, delivery evidence conventions, JSON schemas, and deterministic tests.

## Appetite check

| UC | Effort | Value | Ship |
|---|---:|---:|---|
| UC-01 | Medium | Critical | Yes |
| UC-02 | Medium | Critical | Yes |
| UC-03 | High | Critical | Yes, format plus grounded fixture |
| UC-04 | Medium | High | Yes |
