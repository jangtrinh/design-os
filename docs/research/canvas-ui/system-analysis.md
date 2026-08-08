# Canvas UI System Analysis

## System statement

Canvas UI turns live HTML or a supplied visual asset into an interactive canvas/WebGL
effect for web designers and developers, under the primary constraint that enhanced
live-DOM rendering is experimental and must degrade to ordinary HTML or a compatible
WebGL overlay.

## Boundaries and value

- documented — the library owns effect rendering, pointer/scroll response, support
  detection, visibility pausing, and resource cleanup. The application continues to own
  semantic content, interaction, layout, and accessibility.
- documented — installation copies a standalone implementation file into the consuming
  application; there is no runtime Canvas UI package to pin.
- inferred (high confidence) — its strongest DESIGN:OS value is a vocabulary of
  signature effects plus verified implementation sources, not general component-system
  architecture.

## Data and state

- observed — each effect exposes typed options and an imperative lifecycle with option
  updates, resize handling, and destruction. React and other framework wrappers adapt
  that shared lifecycle.
- observed — effect state is local to the mounted component. Source families use
  `IntersectionObserver` to stop off-screen work and reduced-motion media queries to
  avoid active animation when requested.
- inferred (medium confidence) — there is no durable application data model, migration,
  cache, or server-side state relevant to DESIGN:OS adoption.

## Execution

1. The destination app mounts ordinary content or supplies an image/SVG/3D asset.
2. The component probes browser capabilities and creates canvas/WebGL resources.
3. Pointer, scroll, resize, and visibility signals update the renderer.
4. Unsupported live-HTML painting falls back to normal DOM plus whatever overlay can
   still run.
5. Reduced motion or unmount stops the loop and releases resources.

Observed source evidence: [`src/lib`](https://github.com/DavidHDev/canvas-ui/tree/728550d4523e1b8bef834b64b3e936c215cad630/src/lib).

## Assumptions and failure modes

- html-in-canvas support is browser- and rollout-dependent.
- WebGL context creation, asset loading, or shader compilation can fail.
- 3D asset effects add `three` and may fetch a Draco decoder for compressed models.
- Multiple effects can compete for GPU/frame budget even when each is locally correct.
- Distorting live content can harm reading, focus visibility, pointer predictability,
  and screenshot quality without destination-specific review.

