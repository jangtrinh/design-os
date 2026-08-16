---
id: verification-honesty
description: "Why a false pass costs more than a crash, and the four rules that stop a check, a status flag, or an agent from reporting success it did not earn."
when: [verify, verifier, false-pass, gate, silent-failure, acceptance, sign-off, refuse, done, status-flag]
---

# Verification honesty — make every component say what it did NOT do

## Purpose

Stop a check, a status flag, or a delegated agent from standing in for a result it never
produced.

## Mental Model

A verifier is not a helper that tells you when things are fine. It is a **witness under
oath**, and the only thing that makes it worth having is that it will refuse to answer when
it does not know.

The instinct is to rank failures by how loud they are: a crash is bad, a wrong answer is
worse, silence is merely annoying. That ranking is backwards. A crash stops the line and gets
fixed. A **false pass** — a confident wrong answer wearing the shape of success — does not
stop anything. It ships, it accumulates, and it is discovered by someone who has no idea the
check ever ran.

The three things that produce a false pass look unrelated and are the same failure:

- a **check** that returns "ok" because it could not see the problem;
- a **status flag** consumed with a meaning its setter never intended;
- an **agent** that goes idle instead of reporting that it failed.

Each substitutes silence, or success-shaped output, for a real result.

## When to Use / When NOT

**Use** this file when designing anything that produces a verdict another party will act on:
a linter, a canvas or visual check, a gate, an acceptance signal, an orchestration status, a
delegated advisory call.

**Do NOT** apply it to exploratory or read-only work where nobody consumes the output as
proof — a scan, a survey, a draft. Demanding refusal semantics from a tool nobody trusts yet
adds ceremony without a consumer who benefits.

## The four rules

### 1 — A checker MUST encode its refusals

ALLOWED: `pass`, `fail`, and **`refuse`** — "I could not establish this".
NOT ALLOWED: collapsing `refuse` into `pass` because the check found nothing to complain
about.

A check that cannot distinguish "I looked and it was fine" from "I could not look" will
report the second as the first, because the absence of a finding is indistinguishable from a
clean result at the point where the verdict is written. **The mechanism is that the caller
consumes only the verdict, never the reasoning** — so anything the check could not do
disappears at exactly the moment it matters.

Concretely, a check MUST refuse rather than pass when:

- it was handed an expected value with no fresh evidence to compare against;
- its evidence predates the change it is verifying (a re-render after a swap is a different
  artefact from the one captured before it);
- it encountered a value outside the set it knows (an unrecognised enum is not a passing
  enum).

This is the same discipline the repo already applies to mocks — *a permissive mock is a green
light that means nothing*. A permissive verifier is that green light wired to the gate.

### 2 — Totals MUST reconcile, and the parts MUST be named

ALLOWED: reporting a subset, as long as everything excluded is counted and labelled in the
same breath.
NOT ALLOWED: reporting only what survived a filter.

A pipeline that shows `N shown` and nothing else cannot be audited: the reader has no way to
tell a small result from a large loss. **The mechanism is that filters are invisible in their
own output** — a dropped item leaves no trace, so the only defence is an arithmetic identity
the reader can check by eye.

The cheapest instrument in this repo is a line whose parts add up to the input. In the
2026-08-15 comment-triage run, a reconciling header caught two silent drops in the folding
code and one mis-specified path whose filter had matched nothing at all — none of which were
visible in the list the tool printed, and all of which were visible in the total.

### 3 — A status flag carries its SETTER's meaning, never the reader's

ALLOWED: consuming a flag whose semantics are the same for every party that writes it.
NOT ALLOWED: treating one boolean as authoritative when different actors set it for
different reasons.

`resolved`, `approved`, `closed`, `done` are the usual offenders. **The mechanism is that a
boolean discards the identity and intent of whoever set it**, so two incompatible meanings
compress into one value and the reader silently gets whichever they assumed.

Before consuming a flag, ask *who sets this, and does it mean the same thing when each of
them sets it?* If the answer differs by actor, the flag is a fact about a state change, not a
verdict — resolve it by reading what the actor actually said, or by keeping the actor's
identity alongside the flag.

### 4 — Silence MUST be its own state

ALLOWED: `accepted`, `rejected`, and an explicit `silent` / `awaiting` state.
NOT ALLOWED: a two-valued model where "nothing came back" falls into the accepting branch.

**The mechanism is that absence has no representation in a boolean**, so it lands wherever
the default sits — and defaults are chosen for the common case, which is approval. The result
is manufactured consent: work recorded as agreed by someone who never answered.

This applies identically to a reviewer who closed a thread without replying, and to a
delegated agent that went idle without reporting. Both are unanswered. Neither is agreement.

## Consequences for delegation

An advisory or worker agent is a verifier of the same kind, and the same rules bind it:

- treat a delegated call as **best-effort, never a dependency**. Spawn it, keep working, fold
  in whatever arrives.
- a second silence is the answer. Re-ping once at most, then proceed and record that no
  answer came.
- NEVER let a caller infer success from the absence of a failure report. An agent that
  produced nothing MUST be recorded as having produced nothing, not omitted.

## Failure Modes

- **The comfortable zero.** A run reports `0 problems` and nobody asks whether the probe
  could have returned anything else. Every zero is a claim; prove it with an input that
  should make it non-zero. This is the single highest-yield habit in this file — on
  2026-08-15 it caught a feature that returned all zeros because it had filtered away the
  exact data it was built to read.
- **Refusal downgraded to a warning.** A check technically reports "could not verify", the
  caller treats non-fatal as fine, and the refusal is functionally a pass. A refusal MUST
  block the gate it feeds, or it is decoration.
- **Fixing a false pass at the symptom site.** The same verifier defect is repaired inside
  two different tasks and never extracted, so it returns indefinitely. A defect class that
  has recurred once is a shared-layer bug.
- **Reconciling totals that reconcile against the wrong thing.** Parts that sum to the
  filtered set rather than the input prove nothing. The identity MUST close against what
  entered the pipeline.
- **Trusting the doctrine over the run.** A rule written in this file and applied from memory
  is weaker than one line of real output. The 2026-08-15 run produced three features that
  passed their fixtures and were wrong on first contact with live data — including one that
  violated a rule its own author had written hours earlier. Fixtures encode what you already
  understand; live data is the only place the rest shows up.
