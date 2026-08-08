# Canvas UI — Fable Thinking Review

This is a Codex review performed with the `es:fable-thinking` discipline. It does not
replace the pipeline's actual Fable 5 direction or final audit gates.

## FRAME

Problem: give DESIGN:OS access to Canvas UI's full expressive vocabulary without making
volatile third-party effects owned semantic components or weakening motion, browser,
license, and evidence constraints.

Observable success: one adoption shape survives these attacks:

- all current effect names remain discoverable;
- the deterministic `ui` kernel performs no network/model work;
- no Canvas UI implementation source is redistributed by DESIGN:OS;
- experimental html-in-canvas support is never required for a complete experience;
- specialized context loads only after T6 is justified;
- catalog drift and runtime dependencies are explicit.

Reversibility: two-way door. The proposed work is knowledge/template routing and can be
reverted without migrating user data.

Unnecessity: if named Canvas UI recipes do not improve safe effect selection beyond the
existing generic T6 guidance, no adoption is needed.

## MODEL — epistemic ledger

### FACT

- The researched upstream revision is
  `728550d4523e1b8bef834b64b3e936c215cad630`.
- The live docs and upstream catalog enumerate 25 named effects at that revision.
- DESIGN:OS's semantic component catalog contains 32 ordinary UI building blocks.
- DESIGN:OS routes advanced GSAP work through a selectively loaded skill after the motion
  ladder selects T5.
- All 25 Canvas UI vanilla engines contain reduced-motion handling, off-screen observation,
  and cleanup logic; the three object effects do not need the live-HTML support probe.
- The upstream multi-framework implementation is roughly 32,000 lines at the researched
  revision.
- Dithered Object, Glass Object, and Particle Object depend on `three` and carry a default
  Google-hosted Draco decoder path.
- Chrome documents HTML-in-Canvas as an early-development origin trial in Chrome 148–150
  whose implementation may change.
- Canvas UI's license permits use inside products but restricts redistributing the
  components themselves, including bundles and ports.

### INFERENCE

- Canvas UI effects are motion/presentation wrappers, not semantic component primitives.
- A selective T6 skill matches the repository's existing GSAP architecture and keeps
  irrelevant third-party detail out of ordinary generation context.
- Versioned names, slugs, intent, and fallback guidance are durable enough for knowledge;
  implementation APIs and source are not.
- Installing from upstream into the destination application preserves the clearest
  ownership boundary, subject to current-license review when implemented.

### UNKNOWN

- Whether the Commons Clause permits every future DESIGN:OS-generated installation flow;
  no legal opinion was obtained.
- Real performance limits across target mobile GPUs and combinations with other T6 media.
- Whether shadcn MCP or direct CLI produces the better user experience in every supported
  host runtime.
- How long the current origin trial/API shape will remain valid.

## DECIDE

Hard constraints eliminated two shapes:

1. **Add 25 semantic components — rejected.** Wrong abstraction; effects wrap content and
   would contaminate component selection with art-direction choices.
2. **Rely only on live MCP discovery — rejected.** It violates the offline/deterministic
   core if placed in `ui`, and lacks DESIGN:OS-specific intent/fallback governance.
3. **Versioned reference + selective T6 skill — chosen.** It preserves all names, keeps
   source upstream, matches existing routing, and is reversible.

Discriminating risk: license interpretation. If linking an implementation hand to the
upstream registry is judged redistribution or sublicensing in DESIGN:OS's product context,
the install handoff must be removed; the remaining adoption becomes inspiration-only.

Smallest coherent first step for the later Opus plan:

- capture a revisioned source ledger under `references/`;
- add one Canvas UI motion-direction knowledge file with the adjacent 25-entry matrix;
- add one selective runtime skill and routing tests;
- make no kernel or semantic component-registry changes.

## FALSIFICATION RESULTS

- Hypothesis “the effects can be treated as generally available live-HTML components”
  was refuted by Chrome's early-development origin-trial status.
- Hypothesis “general T6 guidance already makes the catalog unnecessary” was weakened by
  the 25 distinct narrative/fallback patterns and DESIGN:OS's precedent for specialized
  GSAP direction.
- Hypothesis “the full upstream API can become durable knowledge” was refuted by the API's
  experimental status, catalog-count drift across upstream surfaces, and implementation
  size.
- Hypothesis “upstream lifecycle claims are merely marketing” survived a static source
  attack: every vanilla engine contains reduced-motion, visibility, and cleanup paths.
  Runtime correctness remains unverified.

## REVIEW VERDICT

Verdict: **revise the original shape, then advance to the real Fable 5 gate.**

Direction recommended for that gate:

- adopt all current effect names as a revisioned external reference;
- expose them through a selective web-only T6 skill;
- baseline-first progressive enhancement is mandatory;
- keep source/API installation upstream and outside `ui`;
- require a license decision and a real browser benchmark before implementation can ship.

## NOT VERIFIED

- No Canvas UI effect was installed or executed.
- No normal-motion, reduced-motion, unsupported-browser, mobile-GPU, teardown, or WebGL
  context-loss benchmark was run.
- No legal review confirmed the proposed upstream-install handoff.
- No Opus specification, Sonnet implementation, or actual Fable 5 verdict exists yet.

## Unresolved Questions

1. Will the owner obtain a license interpretation before the implementation stage?
2. Should the first benchmark use one live-HTML distortion, one pure overlay, and one
   object effect to cover the three materially different capability families?
