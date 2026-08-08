# Canvas UI Research

Status: complete
Source: https://github.com/DavidHDev/canvas-ui
Revision: `728550d4523e1b8bef834b64b3e936c215cad630`
Decision: adapt
Confidence: high

## Executive Finding

Canvas UI should enter DESIGN:OS as a **versioned external-effect reference plus a
selective T6 motion skill**, not as 25 new foundational UI components, a flat prompt
appendix, or vendored source. All 25 current effects remain discoverable as named
art-direction recipes. The host agent may load their specialized direction only after
the existing motion ladder, persona cap, reduced-motion, tenant, performance, and
visual-verification gates have passed.

This is concept/API adoption. DESIGN:OS must point an implementation hand at Canvas
UI's upstream shadcn registry and keep the copied source inside the user's application.
It must not copy, port, bundle, or redistribute Canvas UI source through DESIGN:OS.

## Evidence Summary

- observed — the live catalog lists 25 effects: [Canvas UI components](https://canvasui.dev/components).
- documented — effects ship as standalone source in React, Solid, Preact, Vue,
  Svelte, and vanilla forms through a shadcn-compatible registry:
  [upstream README](https://github.com/DavidHDev/canvas-ui/blob/728550d4523e1b8bef834b64b3e936c215cad630/README.md).
- observed — each of the 25 source families contains reduced-motion detection,
  off-screen observation, and teardown paths at the researched revision.
- documented — full live-HTML painting depends on an early-development Chromium origin
  trial in Chrome 148–150; the API may change. Unsupported browsers retain normal HTML
  and only compatible WebGL overlays: [Chrome's origin-trial documentation](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
  and [Canvas UI introduction](https://canvasui.dev/docs).
- observed — the MIT + Commons Clause license permits use inside an application but
  prohibits selling, sublicensing, or redistributing the components themselves:
  [license](https://github.com/DavidHDev/canvas-ui/blob/728550d4523e1b8bef834b64b3e936c215cad630/LICENSE.md).

## Applicability Table

| Finding | Rank | DESIGN:OS decision |
|---|---:|---|
| Named catalog of 25 creative effects | P1 | Adopt every entry in a versioned reference with intent, fallback, and evidence metadata. |
| shadcn registry as implementation handoff | P1 | Teach the host agent to install from upstream into the destination app; never fetch in `ui`. |
| Shared lifecycle: support probe, reduced motion, visibility pause, teardown | P0 | Add these as mandatory acceptance fields for every external canvas recipe. |
| Selective Canvas UI motion skill | P1 | Mirror the existing GSAP routing shape so the catalog loads only after T6 is chosen. |
| Raw source bundling or ports in DESIGN:OS | P3 | Reject: redistribution risk and wrong ownership boundary. |
| Treating effects as default component-catalog primitives | P3 | Reject: they are presentation/effect wrappers, not semantic UI building blocks. |

## Recommended Next Step

Route the revised integration brief and `fable-thinking-review.md` through the actual
Fable 5 direction gate, then Opus 4.8 for the spec/plan. The smallest planned change is
a versioned provenance snapshot, one specialized knowledge file, one selective routing
skill, and tests proving installed runtime adapters expose it without adding network
behavior to `ui`.

## Risks

- Experimental html-in-canvas support can change; browser claims require re-checking
  at implementation time.
- A copied 25-name list will drift unless its upstream revision is captured and a
  deliberate refresh procedure owns additions/removals.
- Several effects can obscure or distort readable content. A complete static fallback
  is mandatory, not merely an animation pause.
- GPU cost, device loss, memory pressure, and multiple simultaneous effects need real
  browser evidence; upstream cleanup code is necessary but not proof of page-level fit.
- Canvas UI's license is not plain MIT. Any source redistribution or generated port
  requires separate legal review.

## Unresolved Questions

1. Should the implementation hand prefer shadcn MCP or emit a human-run upstream
   install command when MCP is unavailable?
2. Does Fable want these recipes available only to web generation, or also represented
   as static approximation guidance for Figma?
