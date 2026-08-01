# Asset Production Orchestration

## Purpose

Turn an asset brief into traceable, layer-ready website assets while keeping model generation
swappable and deterministic processing reproducible.

<!-- ease:source ref="knowledge/sources/asset-production-repository-evidence--202608.json" captured="202608" -->

## Mental Model

An image model is a **raw-material hand**, not the asset pipeline. The pipeline is a chain of
explicit custody:

```text
brief → reference lock → raw generation/edit → deterministic processing
      → curation → QA/recomposition → publish
```

Every stage owns a different truth. Raw files prove what the provider returned. Processing proves
what local transforms did. Curation proves what a person or curator selected. Published files are
the only assets a website may consume.

## When to Use

- Use for generated hero art, isolated characters, atmospheric layers, sprites, scene plates,
  and editable PSD handoff.
- Use when Codex, Gemini, or another runtime hand produces or edits raster assets for `design-os`.
- Use when a generated composition must become multiple transparent web layers.

## When Not to Use

- Do not use for harvesting an original asset from an existing site; use `delivery-assets.md`.
- Do not use for icons, controls, or logos that should remain SVG or native UI.
- Do not use generated pixels for final website text; keep text in HTML or Figma.

## The Production Contract

### 1. Start from an asset request

The request MUST declare the role, dimensions, operation (`generate` or `edit`), reference files,
layer order, transparency expectation, and acceptance checks. It SHOULD declare the subject
palette so a chroma key can avoid real artwork colors.

ALLOWED: one request with multiple named output roles when their relationship is explicit.

NOT ALLOWED: a prose prompt as the only source of truth, because dimensions, layer ownership,
acceptance checks, and provenance become implicit.

### 2. Lock identity before variants

Choose one approved master or anchor reference before generating state, angle, or layer variants.
All edits MUST branch from that lock. Record a content hash for every reference.

ALLOWED: a new branch for each isolated layer derived from the same approved master.

NOT ALLOWED: repeatedly asking the model to recreate the subject from prose, because identity,
scale, outline, and palette drift accumulate across assets.

### 3. Choose the extraction route

| Asset property | Primary route | Deterministic finish |
|---|---|---|
| Hard silhouette | Palette-safe chroma isolation | key → despill → trim → alpha inspection |
| Smoke, glow, glass, soft hair | Pixel-aligned white/black edit pair | dual-render alpha solve → edge inspection |
| Opaque background plate | Remove foreground and inpaint occlusion | dimension check → hole/content inspection |
| Good image, failed isolation | Prompted or foreground segmentation | mask refinement → trimap/matting when needed |
| Existing composite needing many layers | Native image-to-layer decomposition | order layers → recompose → compare |

Dual-render pairs MUST be edits of the same locked source with exact pixel alignment. The second
pass MUST NOT be a fresh regeneration, because mismatched geometry produces false alpha.

Prompt repair is bounded. After repeated drift, switch to segmentation or matting rather than
spending unbounded model calls on the same failed instruction.

### 4. Preserve stage custody

Use this logical run layout:

```text
asset-request.json  references/  prompts/  raw/  processed/
curation.json       qa/          published/  asset-manifest.json
```

`raw/` MUST be immutable. `processed/` MUST be reproducible from recorded commands and inputs.
`curation.json` MUST select or reject candidates without mutating them. Only `published/` may feed
the website.

ALLOWED: regenerate `processed/`, `qa/`, and `published/` from immutable raw evidence.

NOT ALLOWED: overwrite a raw provider response with a keyed or retouched result, because the
generation and processing steps can no longer be audited independently.

### 5. Require provider-neutral provenance

For every raw output, record provider, model, operation, prompt text or hash, reference hashes,
dimensions, request or seed identifier when supplied, capture time, code path, and applicable
model/checkpoint/output license evidence.

The provider hand MAY generate or edit pixels. It MUST NOT own deterministic validation. The
`design-os` conductor coordinates the hand; the deterministic `ui` surface may later validate
schemas and file contracts but MUST NOT call a model or the network.

NOT ALLOWED: infer model permission from a repository's code license, because source code, model
weights, training data, and generated outputs can carry different terms.

### 6. Curate before publishing

Raw candidates are evidence, not assets. The curator records selected candidate IDs, rejected IDs,
reasons, crop/anchor decisions, and any approved exception in `curation.json`.

Publishing MUST be atomic: either the complete approved set and manifest are present, or no new
public set is exposed. This prevents a website build from consuming mixed revisions.

### 7. Recompose as the visual gate

Stack every accepted layer bottom-to-top over the target backdrop and compare it with the approved
master or target composition. Inspect at least:

- dimensions and expected alpha range;
- halos, despill contamination, and clipped soft effects;
- holes or repeated content across layers;
- layer order, anchor position, and scale;
- final appearance on both light and dark diagnostic backdrops.

PSD is a delivery container assembled from curated transparent layers. It is NOT the sole source of
truth. Keep the PNG layers and `asset-manifest.json` beside it so web delivery remains portable.

## Runtime Selection

Prefer provider generation plus local deterministic processing on a normal developer machine.
Use a maintained background-removal wrapper for the first segmentation fallback, a specialized
foreground model when the subject requires it, and trimap matting for edge refinement. Native
multi-layer generation or decomposition is optional infrastructure for a declared GPU environment.
ComfyUI may assist visual exploration but MUST NOT become a hidden dependency of the core contract.

## Failure Modes

| Failure | Cause | Required response |
|---|---|---|
| Chroma removes subject pixels | Key color overlaps the subject palette | Choose a scene-safe key color and regenerate the isolated pass |
| Dual-render edge ghosts | White and black images are not pixel-aligned | Reject the pair; create the second pass as an edit of the first branch |
| Background has cut-out holes | Foreground was erased without inpainting | Generate an opaque plate and inspect formerly occluded regions |
| Layer identity drifts | Variants were regenerated from prose | Return to the locked master and branch edits from it |
| Raw candidate appears on site | Stage custody was bypassed | Fail publish; require curation, QA, and a complete manifest |
| PSD cannot reproduce web output | PSD became the only truth | Rebuild from curated PNG layers and the manifest |
| License status is assumed | Code and checkpoint terms were conflated | Stop publication until each applicable license is recorded |
| Model retries grow without bound | No fallback threshold exists | Stop prompt repair and route to segmentation/matting |
