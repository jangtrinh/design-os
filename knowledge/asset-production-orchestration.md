---
id: asset-production-orchestration
description: "Ordering and gating a multi-asset production run so generated media arrives usable."
when: [asset-production, media-pipeline, batch-generation, orchestration, image-curation, banned-scene, layered-hero, parallax-hero]
---

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

### 8. Curate every generated photo at zoom against the banned-scene list

Generated photography fails on details a contact sheet hides: a hand gesture, what a finger
touches, a prop in the background, a face in the second row. Curation therefore opens EVERY
candidate at 100% zoom or more and walks a fixed checklist — people (gesture, hands, gaze, what
each hand touches), scene (props, screens, documents, signage), and the project's banned-scene
list — before the candidate can be selected. The verdict per image goes into `curation.json` with
the checklist line that decided it.

The banned-scene list comes from the project's art direction
(`generated-photography-art-direction.md` holds the template). It MUST be part of the common
prompt from the FIRST batch, not added after a reviewer finds the first bad image, because a list
that arrives late leaves every earlier batch generated without it and every round of review
re-finds the same scene.

Treat a near-variant of a banned scene as the same scene. If "pointing at a chart" is banned, so
are a finger resting on a printed report, a seated person pointing at a screen, a pen tapping a
graph, and a hand gesturing at a whiteboard. The model routes around the literal wording; the
reader of the page sees the same staged gesture.

ALLOWED: rejecting a candidate on one checklist line, with the line recorded; regenerating with
the banned scene and its variants restated in the prompt.

NOT ALLOWED: approving from thumbnails or a contact sheet, because the gesture or the touched
object that breaks the direction is usually under 5% of the frame and invisible at that size.
NOT ALLOWED: accepting a near-variant because it is "not literally" the banned wording, because the
list bans what the viewer reads, not a string.

### 9. Layered and parallax heroes: recompose in motion, not only at rest

A hero split into planes (background, people, foreground objects) that move at different speeds
is a composition that changes with scroll and load. Section 7's recomposition at rest proves only
the first frame. For a layered hero, also:

- **Rest check against the original.** At scroll offset 0 and the final load state, the
  recomposed planes MUST match the source photo they were cut from — overlay or difference the
  two. A plane that is offset, rescaled, or recoloured at rest is a cutting error, not a motion
  effect.
- **Recompose at the extremes.** Render the stack at the LARGEST offsets the page can produce: the
  maximum scroll travel of the hero, the largest parallax ratio, the widest and the narrowest
  supported viewport, and the end state of any load animation. Look for doubled edges, a plane
  that uncovers a hole or a hard background edge, and an object that appears twice.
- **One owner per object.** The front plane owns the people AND everything they touch — the chair
  a person sits on, the desk under their hands, the cup they hold, the laptop they type on. No
  object exists in both planes. A touched object left in the background separates from the hand
  the moment the planes move apart, and a copy kept in both planes shows as a doubled edge.

ALLOWED: inpainting the background plane where a front-plane object used to be, then checking that
area at the maximum offset.

NOT ALLOWED: approving a layered hero from a screenshot at rest, because the doubled edges and holes
only exist once the planes have moved. NOT ALLOWED: splitting a person from the object they touch
across planes, because the contact point tears as soon as the parallax speeds differ.

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
| A banned gesture survives several review rounds | Candidates approved from thumbnails; the banned-scene list reached the prompt after the first batch | Curate each image at zoom with the §8 checklist; put the list and its near-variants in the common prompt and regenerate the affected batches |
| A near-variant of a banned scene is approved | The list was matched as wording ("pointing"), not as what the viewer reads | Reject it as the same scene; add the variant to the list beside its parent |
| Doubled edges or holes appear when a layered hero moves | Recomposition was checked only at rest; an object exists in both planes or a touched object stayed behind | Recompose at the §9 extremes; move every touched object to the front plane and inpaint the background where it was |
| A layered hero does not match its source photo at rest | A plane was offset, rescaled or recoloured while cutting | Run the §9 rest check against the original and re-cut the plane |
