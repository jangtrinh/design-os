# Fable 5 Architecture Verdict — Canvas UI Adoption

Model: `claude-fable-5` (`--model fable`, high effort)
Mode: read-only architecture gate
Date: 2026-07-25
Verdict: **approve**

## Direction

- Adopt the versioned external-effect reference (all 25 current names, pinned to
  upstream revision `728550d…`) plus ONE selective, web-only T6 Canvas UI motion skill
  mirroring the existing `gsap-motion` routing shape. Catalog membership is not
  endorsement: per-use qualification gates use; the catalog only names the vocabulary.
- Classify the whole integration in the SAME architecture class as Lottie authoring
  (`knowledge/motion-craft.md`, T6): an EXTERNAL HAND. Installation is a host-hand action
  against Canvas UI's upstream shadcn registry into the destination app. Primary handoff
  = an emitted direct upstream CLI command (runtime-neutral, inspectable, works in every
  host CLI); shadcn MCP is opportunistic convenience when the host exposes it — never a
  requirement, never in `ui`.
- html-in-canvas is experimental progressive enhancement only (Chrome 148–150 origin
  trial): design the complete static baseline FIRST; no effect may ever be load-bearing
  for content, controls, or navigation. This is the existing T3 `@supports` doctrine
  applied at T6 — the browser constraint does not change the architecture.
- The license constraint likewise CONFIRMS the proposed boundary rather than changing
  it: no vendoring, no ports, no bundles; source ownership stays upstream; copied code
  lives only in the user's application.
- Web-only for v1. No Figma static-approximation surface in this spec; that is a separate
  future spec if demand appears.

## Boundaries

- `ui` stays deterministic and offline — zero network, zero registry fetch, zero effect
  code. Non-negotiable.
- `knowledge/` stores names, slugs, narrative job, anti-use, fallback, and provenance
  ONLY — never implementation detail or API tables sufficient for the host model to
  reconstruct an effect. A regenerated effect is a port-by-proxy and breaches the
  Commons Clause boundary as surely as vendoring.
- Effects are art-direction recipes: never entries in the 32-component semantic catalog,
  never reachable before the motion ladder + persona cap justify T6. Ordinary generation
  context must provably NOT contain the catalog.
- Every use requires the full T6 floor: narrative intent; complete static/reduced-motion/
  unsupported fallback preserving content, controls, focus order, and contrast (not
  merely paused); visual verification; teardown; provenance note with the upstream
  revision re-checked at use time.
- Max ONE active Canvas UI effect per viewport moment. When an effect is embedded as a
  section among others, the Tenant Law binds (`tenant-lint` pass; off-screen pause must
  actually disarm — upstream visibility observers count only when evidenced at page level).
- The three `three`-based object effects must not silently ship the default Google-hosted
  Draco decoder in generated output; self-host or an explicit per-destination permit is
  required.
- Repo law binds: every new required recipe-metadata field ships with its deterministic
  check in the same commit (emitter AND linter); the provenance revision/slug check must
  be mechanical, not prose.

## Required proof

- Routing proof: adapter/knowledge tests plus prompt-context inspection showing non-T6
  generation never loads the catalog, and T6 generation loads it only after the ladder
  decision.
- Real-browser benchmark on three effects covering the three capability families (one
  live-HTML distortion, one pure WebGL overlay, one three.js object effect), each with:
  desktop + mobile captures, reduced-motion capture, unsupported-browser capture proving
  the static baseline is complete, clean console, unmount/teardown leak check, and WebGL
  context-loss recovering to the static fallback; the object family additionally proves
  asset load/error states and the Draco decision.
- At least one low-power/mobile-GPU device in evidence, and coexistence evidence for two
  effects (or effect + scrub section) sharing one page under the tenant contract.
- Deterministic gates green on generated pages: `taste-lint` (including
  `animation-no-reduced-motion`) and `tenant-lint` where embedded.
- Release-blocking failures: any missing or incomplete static baseline; any load-bearing
  html-in-canvas dependency; any catalog leakage into ordinary generation context; any
  Canvas UI source appearing in DESIGN:OS-packaged files.

## Open decisions

- License interpretation of MIT + Commons Clause for the upstream-install handoff in
  DESIGN:OS's product context: obtain before RELEASE (ship gate), not before Opus
  planning — Opus must plan the adverse branch (drop the install handoff → inspiration-
  only catalog) as an explicit fallback so the door stays two-way.
- Catalog refresh ownership: who re-checks the upstream revision, on what cadence, and
  who approves additions/removals of effect names.
- Whether the one-effect-per-viewport cap may be relaxed for specific expressive personas.

## Pipeline status

Architecture gate passed. Next: Opus 4.8 authors the specification and execution plan;
Codex 5.6 sol reviews it. Implementation and final audit have not occurred.
