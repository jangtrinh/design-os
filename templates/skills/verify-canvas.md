---
description: "Prove a canvas change actually landed, with checks that can refuse rather than pass. Use when verifying any live Figma mutation, before reporting a task done or posting a handoff."
---

# Skill: Verify Canvas

Use when the host model has just changed something on a live Figma canvas and has to decide
whether it is done. A canvas change cannot be proved by a build; it is proved by looking, and
looking is exactly where a check quietly lies.

Read `knowledge/verification-honesty.md` first — this skill is that doctrine applied to a
canvas. The rule that carries the weight: **a check that cannot establish a fact MUST refuse,
never pass.**

## When to invoke

After any mutation to a live file — an instance override, a property change, a component swap,
a deletion — and before either marking a task done or posting a handoff comment.

Do NOT invoke it for read-only scans, or for work whose deliverable is code. A `pnpm` build
proves a code change and proves nothing about a design.

## The four measurements

Each one exists because assuming it instead of measuring it produced a wrong verdict on a real
run (2026-08-15, VSF-PCP).

**1 · Visibility is a property of the ANCESTOR CHAIN, not the node.**
A node can carry `visible: true` inside a hidden parent and render nowhere. Walk from the node
to the frame root; if any ancestor is hidden, the node is not visible. A check that reads only
the node reports text as present that no human can see.

**2 · Counts MUST be measured on the live canvas, never carried forward.**
Evidence gathered before a mutation, or truncated by a budget, describes a canvas that no
longer exists. If an assertion needs "there are N of these", count them now. An expected count
supplied with no fresh payload is a REFUSAL, not a pass.

**3 · A component swap needs a SECOND export.**
The first render after a swap can capture stale paint while the underlying property state is
already correct — the image and the truth disagree, and the image is what gets reviewed.
Re-export, then judge. If the two exports disagree, refuse and re-export again.

**4 · Enum values MUST be probed against the connected runtime.**
Documented API names drift from what a live plugin accepts. A mutation that fails on an
unrecognised enum has not verified anything; an unknown value is a refusal, not a guess.

## What to produce

For each task, all three, or the task is not verified:

- a **before** render of the affected frame, captured before the mutation;
- an **after** render of the same frame, captured after it;
- the **node ids** actually changed — not file paths, not screen names.

Record the verdict as `pass: canvas verified <before>.png -> <after>.png`, or
`fail: <what is still wrong>`, or `refuse: <what could not be established>`. A refusal blocks
delivery exactly as a failure does; a refusal downgraded to a warning is a pass wearing a
disguise.

## Blast radius — check BEFORE the work, not at attempt seven

If the pin sits inside a component instance, the correct fix may belong in the master and will
propagate to every other consumer. In a fully componentised file almost every pin is inside
*some* instance, so that bare fact carries no signal. What separates a local component from a
shared one is **how often the same master recurs across the batch you are working through**.

A master that appears repeatedly needs owner approval before any edit. On the run this skill
comes from, shared-master tasks cost several times the attempts of ordinary ones, and nothing
in the task spec warned about it.

## Deletions carry the most risk and the least tooling

There is no typed delete command in the plugin CLI, so every deletion runs through `exec-js` —
the most destructive operation on the least-guarded path, against a file a team is watching.

Before deleting: render the frame, confirm the node is not a component master, and confirm the
count you are about to remove. Bracket every mutation in `--undo-group` so a task collapses to
one undo step and reverts on error.

## Failure Modes

- **Reporting the check you meant to run.** The verdict describes the intended check, not the
  one that executed. State what was measured, in the words of what was measured.
- **A verifier written per task.** The same defect gets repaired inside two different tasks and
  never extracted, so it returns forever. A defect class that has recurred once belongs in a
  shared checker.
- **Passing because nothing was found.** "No violations" from a check that could not see the
  subtree is a refusal, and MUST be reported as one.
- **Verifying the frame you edited rather than the frame the reviewer looks at.** A demo
  instance can be correct while the screen in review is untouched.
- **Trusting the doctrine over the run.** Every rule above was written after a check that
  followed the previous version of this file still returned a wrong answer on live data. Run
  it against the real canvas before believing it.
