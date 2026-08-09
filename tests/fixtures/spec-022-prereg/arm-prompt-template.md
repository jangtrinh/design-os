# Arm prompt template — frozen assembly rule (D5)

This file is one of the three ingredients of every per-arm prompt in the pilot. It never varies
across arms, families, or phases. Its own bytes are hashed as part of every `prompt_hash`.

## Assembly rule (frozen, unambiguous) — Stage-3 projection resolution (P7)

**This section resolves a genuine conflict between the frozen protocol and the Stage-1
architecture, discovered at Stage 3. It is flagged for Stage-6 confirmation, not treated as
settled architecture — a later reviewer should re-open this if the resolution below is wrong.**

Protocol L68 requires that "source names, skill files, provider names, candidate labels, and
sibling output remain hidden" from arms. Architecture D5 originally assembled the per-arm prompt
as template + brief JSON + [treatment only] one patch, taken literally. But the brief JSON object
carries `candidate_id`, `brief_id` (which itself encodes the candidate), and — on contradiction
briefs — the leak definition being probed. Concatenating the brief JSON unmodified would hand
every arm its own candidate label and, on a contradiction brief, the exact definition of the leak
the probe exists to catch, defeating the contradiction probe outright. **The protocol wins.**

The per-arm prompt is therefore the **byte concatenation, in this exact order**, of:

1. this template (`arm-prompt-template.md`, this file's committed bytes);
2. the **arm-visible projection** of the brief (defined below) — never the raw committed brief
   object;
3. **for the treatment arm only**, exactly one patch file — a family patch
   (`patches/phase-a/{aesthetics,motion,devices,media}.md`) for Phase A, or a candidate patch
   (`patches/phase-b/<ID>.md`) for Phase B.

Control arms concatenate (1) + (2) only — no patch is ever appended to a control prompt.

`prompt_hash` (recorded in every run manifest) is the SHA-256, lowercase hex, of the fully
assembled per-arm prompt bytes — the exact byte string produced by this concatenation, no
normalization.

No other ingredient may enter an arm prompt: no sibling-arm text, no owner or curator feedback, no
source material, no provider or model name, no candidate ID string, no URL.

### The arm-visible projection

The projection is the committed brief object with a **fixed key list removed**. The same removal
list applies to both arms of a pair — control and treatment always see the identical projection
save for the treatment-only patch — so the projection can never itself create an arm differential.

- **Phase A** — remove `brief_id`, `candidate_id`, `family`, `ordinal`, `role`,
  `is_duplicate_source`, `anti_context_condition`.
- **Phase B** — remove `brief_id`, `candidate_id`, `family`, `ordinal`,
  `anti_context.leak_definition`, `anti_context.deterministic_leak_checks`.
  `anti_context.embedded_state` and `anti_context.inactive_requirement` are **retained** — the arm
  must actually build that embedded section and know it is required to stay plain; both arms
  receive it identically.

- **Both phases** — every `supplied_assets[]` entry is **replaced** with a neutral, role-indexed
  alias: `{ "asset_ref": "asset-<role>-<n>", "role": "<role>" }`. `<role>` is read from the
  **frozen `assets/brief-media-manifest.json` record** for that asset id — never inferred from
  substrings of the id itself, which is an identity signal in its own right. `<n>` is the 1-based
  index of the entry within its role group, in the brief's own committed `supplied_assets` order.
  `manifest_ref` is dropped entirely; no other key survives. Removing the identity keys alone was
  not enough: a committed asset id restates its owning brief id — and in Phase B the candidate
  label — verbatim, which is precisely what this projection exists to prevent. **No literal brief
  id, asset id, or candidate label may ever appear in this file**, because this file's own bytes
  are concatenated into every arm prompt; that is why the rule is stated structurally here rather
  than with a worked example. The alias is a pure function of the brief plus the frozen manifest
  and identical for both arms, so it cannot create an arm differential; and because numbering
  restarts per brief, two different briefs with the same asset roles project identical
  supplied-asset blocks.

Every other key is retained verbatim, in committed key order, serialized with `JSON.stringify`
(no pretty-printing, no key sorting) so the assembly is byte-deterministic.

**Why these removals exist:** the arm must not learn its own candidate label, its family, or —
on a contradiction brief (Phase A) or an anti-context brief (Phase B) — the definition of the leak
being probed. Knowing the leak definition would let the generating model steer around the probe
rather than being genuinely tested against it. The committed brief files (`phase-a-briefs.json`,
`phase-b-briefs.json`) still contain **every** field for all of these — the schemas are unchanged
and nothing is stripped from the committed record. Projection happens only at prompt-assembly
time, as a read-time transform applied by the orchestrator immediately before concatenation.

---

## Template body — the instruction given to the generating model

You will build one self-contained design artifact for the brief supplied immediately after this
instruction (and, where present, one additional guidance file supplied after the brief).

**Facts discipline.** State only facts present in the supplied brief. Do not invent metrics,
testimonials, clients, awards, dates, or any other claim not given to you in the brief's `product`
object or `content_requirements`. Inventing content beyond the brief is a content-gate failure.

**Acceptance and gates.** Honor every acceptance check and gate named in the brief
(`acceptance_checks[]`, `gate_set[]`). Your artifact must be self-contained (no external network
requests, no undeclared dependencies), must render without console errors, and must satisfy the
brief's `content_requirements[]` and `context_boundary`.

**Viewports.** Build responsively for exactly the viewport set given in the brief:
390 / 768 / 1440 CSS px. Verify legibility and layout integrity at all three — do not design for
one and hope the others degrade gracefully.

**Reduced motion.** Wherever the brief marks `reduced_motion_required: true`, or wherever the
artifact includes any animation, honor `prefers-reduced-motion`: reduced-motion renders settled
states immediately — no entrance choreography, no scroll-triggered reveal delay, no decorative
loops under the reduced-motion condition.

**Supplied guidance, if present.** If a second file is supplied after the brief in this prompt, it
is additive guidance scoped to its own stated context boundary and anti-context. Apply it only
where its context matches the brief's surface; where the brief's content is inside a named
anti-context or embedded anti-context state, that guidance is inactive and does not apply there.
Never blend it with content it does not name. Accessibility, tap reliability, and performance
always outrank any supplied guidance.

**What this template never contains.** No provider name, no model name, no source name, no URL,
and no candidate ID appears anywhere in this instruction — the assembled prompt is scored on
content alone.
