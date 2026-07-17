# Spec 006 — Living loop: connect the fuel line

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (kernel deterministic, model at host), Art II (emitter+linter),
Art III (real data), Art IV (fix at shared layer), Art V (three-tier pipeline), Art VIII
(honesty floors)

## What

Make design:os's learning loops actually **accumulate during real work**. The machinery
(`recall`, `taste`, `memory` ledger+graph, `soul`, the `librarian` graduation loop) is
already built and correct — but every write is a **manual, opt-in step nobody runs while
working**, so in real projects the loops stay empty. This spec adds the missing **fuel
line**, in two mechanisms plus two refinements:

1. **Auto-record (kernel, deterministic).** Outcome-bearing kernel subcommands append a
   `memory.events.jsonl` event as a **side-effect of running** — no opt-in, no model call.
   A lint result, an audit, an autofix, a taste vote, a token change, a reconcile become
   events automatically. The trigger is the tool call itself, not a journaling decision.
2. **Harvest (host layer, model-driven).** A new `design-os harvest` pass runs on the
   heartbeat rhythm, reads end-of-phase `plans/*.md` reports **with the outcome known**,
   **extracts structured candidates** (insights, gaps, taste observations), **gates** them
   (does not distill everything), and routes them through the **existing librarian
   veto-chain** into the loops / `knowledge/`. Uses a **fresh model instance** (avoid
   self-serving lessons).
3. **Recurrence lifecycle (kernel).** Insights in `memory.graph.json` carry up/down-vote
   counters — an insight strengthens on recurrence and decays without it (ExpeL pattern).
4. **Decay on last-retrieval (kernel).** `recall` decays by time-since-last-*retrieval*,
   not write time (Oblivion refinement) — a lesson nobody re-queries fades even if freshly
   written.

## Why

The audit that motivates this (memory `living-loop-fuel-line-finding`, 2026-07-17) is
decisive: across **two real projects** doing world-class, compounding work (a full DS
adoption campaign with phased audits, QA sweeps, font-metric proofs), the ledger held
**0 gap events**, the graph was **empty of all learning signal**, the soul **never
evolved**, and there were **0 taste votes**. The rich lessons ("fixed-width box hugging
Inter's width wraps under Be Vietnam Pro"; broker-routing hazard; info tone-gap) piled up
as **unstructured prose in `plans/*.md`**, never flowing into the structured, queryable,
compounding loops. **Agents live in the WORK but not in the LOOP — the two are
disconnected.** Root cause: recording is manual; the engine has no fuel line.

Prior-art research (2026-07-17, lab report) confirms the diagnosis precisely: every working
auto-fed memory system — **Reflexion** (write wired to the outcome signal), **Generative
Agents** (auto-append + threshold reflection), **Voyager** (only verified artifacts
graduate), **ExpeL** (recurrence-gated insights), **AWM** (induce structure from traces) —
**hard-wires the write-trigger into the loop** rather than leaving it to the agent's
discretion. The one thing they all do that we don't is exactly the fix. Unbounded add-all
memory is a documented failure (accuracy collapsed to 13% at 2,400 records vs 39% under
selective curation) — hence auto-record only on outcome-bearing commands, and a gated
harvest.

## Locked decisions (owner brainstorm, 2026-07-17)

- **Fuel line first (this spec, 006); competence ladder is spec 007.** The ladder cannot
  level a dead ledger — build + run the fuel line, let a real ledger fill, then 007 reads it.
- **Auto-record fires ONLY on outcome-bearing subcommands** (lints, audit, autofix, taste
  vote, token change, reconcile) — not every kernel call. Avoids memory bloat.
- **Harvest runs AUTOMATICALLY on the heartbeat rhythm**, with a **fresh model instance**,
  through the **existing librarian gate**.
- **Split holds:** the model produces language artifacts + judgments (extraction,
  graduation adjudication) at the host layer; the kernel produces triggers, math, and state
  (event append, recurrence counters, decay, retrieval) — deterministically.

## Non-goals

- The **competence ladder** (per-domain, evidence-gated autonomy) — that is spec 007, and it
  reads the ledger this spec fills.
- **Model-discretionary self-editing memory** as the primary durable write path (MemGPT /
  memory-tool style) — SKIP; it is the exact failure mode ("the model must remember to
  write") this spec escapes. Host scratch memory may still use it ephemerally.
- Fine-tuning / parametric learning — design:os evolves the non-parametric substrate only.
- Changing what the librarian veto-chain *judges* — harvest feeds it; the gate is unchanged.

## Acceptance criteria (per phase)

1. **Auto-record is a deterministic side-effect.** Each outcome-bearing kernel subcommand
   appends a valid `MemoryEvent` (Art I: no model, no network; same input → same event bytes
   modulo the id/timestamp the store already stamps). A shared helper does it once (Art IV).
2. **Auto-record is enforced (Art II).** A linter fails if an outcome-bearing command is not
   wired to auto-record — the emitter (the convention) ships with its check, same commit.
3. **Harvest turns prose into structured candidates.** On a real campaign's `plans/*.md`,
   `design-os harvest` surfaces the actual findings as candidate insights/gaps, gates out the
   noise, and hands them to the librarian. Fresh-model. Extraction is model-driven (host).
4. **Recurrence + retrieval-decay wired.** An insight that recurs across harvests
   strengthens (up-vote); one never re-queried fades (down-weight / last-retrieval decay).
5. **Heartbeat runs harvest + reflect on rhythm** — no human trigger; the loop is *live*.
6. **Art III — real-data proof.** Run the fed loop on VSF-PCP + platform-design-system: the
   ledger goes from ingest-only (one burst, 2 mechanical types) to **alive** — diverse event
   types, a populated graph, the first real graduations. This is the definitive proof, not a
   fixture.
7. Every phase = 1 PR, three-tier pipeline (Art V), human merge; 4 gates + `ui knowledge
   check` + pytest green.

## References

- Motivating audit: memory `living-loop-fuel-line-finding` (0 gap events across 2 real
  projects; lessons trapped in `plans/` prose).
- Prior art: lab research (Reflexion, Generative Agents, Voyager, ExpeL, AWM, A-MEM,
  Devin playbooks, Anthropic memory tool; ExpeL recurrence gate; Oblivion last-retrieval
  decay; Selective Hindsight Distillation gate; Behavioral Credibility Trilemma → 007).
- Hook points + phasing: `plan.md`. Existing loop: spec 002 (studio librarian), `recall`,
  `taste`, `soul`.
