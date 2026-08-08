# Canvas UI Architecture Review

## Trade-offs

Canvas UI favors source ownership, visual expressiveness, framework reach, and graceful
enhancement. It accepts substantial per-component source size, GPU complexity, and a
browser capability gap. That fits DESIGN:OS's highest motion tier only; it conflicts with
the rule to choose the lowest tier that satisfies intent when treated as a default.

At the researched revision, the framework variants total roughly 32,000 source lines.
The framework wrappers are thin; the lifecycle and rendering logic live in the shared
vanilla engines. This makes upstream installation preferable to restating or maintaining
component APIs inside DESIGN:OS.

## Interfaces and integration

- documented — the shadcn-compatible registry is the public distribution seam. It can
  be addressed directly or through shadcn MCP: [MCP setup](https://canvasui.dev/docs/mcp).
- observed — each source family ships native framework wrappers plus vanilla TypeScript,
  with typed props/options and explicit cleanup.
- inferred (high confidence) — DESIGN:OS should store stable upstream slugs and semantic
  selection guidance, while resolving current install commands only at implementation
  time. Hard-copied source or API tables will drift.
- observed — DESIGN:OS already routes specialized T5 choreography through a selectively
  loaded `gsap-motion` skill. Canvas UI should reuse that architecture at T6 instead of
  adding every effect to general generation context.

## Security and resilience

- Registry content and assets are third-party inputs. Review generated diffs before use;
  pin the upstream revision in evidence and verify the current revision before install.
- User-supplied asset URLs can cross trust boundaries. Destination implementations need
  normal CSP, CORS, file-size, format, and error-state controls.
- A reduced-motion check alone is insufficient. The fallback must preserve all content,
  controls, focus order, contrast, and the intended initial composition.
- WebGL loss and initialization errors require a static DOM/poster fallback. Console
  cleanliness, desktop/mobile captures, reduced-motion capture, and a low-power-device
  check are release evidence.
- Three asset effects depend on `three` and default a Draco decoder path to a Google-hosted
  URL. Destination review must decide whether to self-host or explicitly permit that
  runtime request.

## License and provenance

Adoption class: concept reimplementation plus upstream API/registry use.

The researched license allows the components to be used as part of an application,
website, or product, and requires retaining its notice in substantial copies. It bars
selling, sublicensing, or redistributing the components themselves, including bundles
and ports. Because DESIGN:OS is itself a distributable design tool, it should not vendor
or emit Canvas UI implementation source without legal review. Pointing the implementation
hand at the upstream registry keeps distribution ownership with Canvas UI and the copied
code in the final application.

## Rejected architecture

- No network calls in `ui`; this preserves the deterministic binary contract.
- No 25 entries in the semantic component catalog; effects wrap components and sections.
- No automatic effect selection from visual adjectives alone; every use needs a narrative
  job and must remain within the persona's T6 cap.
- No assumption that html-in-canvas is a broadly shipped platform feature; Chromium's
  current documentation calls it an early-development origin trial whose API may change.
- No claim that upstream graceful degradation proves destination accessibility or
  performance.
