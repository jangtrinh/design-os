# Forest Spirit Hero — 12-Layer Motion Proof

Status: superseded by the approved production in `site/`. This document preserves the earlier rough-mask proof contract.

## Outcome

Prove that a shrine-targeted camera, three world-depth thresholds, and one independent spirit flight create a materially more immersive hero than the existing five-layer test.

## Locked direction

- Author 12 semantic layers, deliver at most 9 image assets, and promote at most 8 compositor planes.
- The shrine is physically fused to its terrain and receives no independent transform, pointer offset, bob, drift, or flight path.
- The spirit is the only subject that independently changes position by more than 24px relative to the world.
- The prototype uses rough masks derived from current art at half resolution. It is evidence for motion and depth, not final art.
- Use one `requestAnimationFrame` render loop and transform/opacity animation only.

## Semantic layers and delivery groups

| # | Semantic layer | Runtime delivery group |
|---:|---|---|
| 1 | Far canopy and sky opening | `far-world` |
| 2 | Deep trunks and forest mist | `far-world` |
| 3 | Clearing, stream, banks, and shrine terrain | `mid-world` |
| 4 | Shrine plus immediate grounded island | `shrine-grounded`, nested in the focus group |
| 5 | Spirit core | `spirit-core` |
| 6 | Spirit wing-light envelope | `spirit-light-envelope`, nested in the spirit carrier |
| 7 | Rear volumetric shaft and haze | `rear-atmosphere` |
| 8 | Mid-distance pollen and motes | `rear-atmosphere` |
| 9 | Near motes or leaf flecks | `near-atmosphere` |
| 10 | Upper and left canopy arch | `canopy-arch` |
| 11 | Right trunk and hanging vines | `canopy-arch` |
| 12 | Lower bank, ferns, and stream lip | `near-sill` |

## Camera and flight contract

The desktop sequence is a sticky `300svh` section with a `100svh` viewport. The camera target is the shrine ground contact at approximately `68% 75%` of the authored desktop composition.

| Plane | Scale at start | Scale at approach |
|---|---:|---:|
| Far world | 1.00 | 1.04 |
| Rear atmosphere | 1.00 | 1.06 |
| Focus group: mid-world + shrine | 1.00 | 1.10 |
| Canopy arch | 1.00 | 1.16 |
| Near sill | 1.00 | 1.22 |

The shrine base may drift no more than 16px on desktop and 8px on mobile relative to its screen anchor. World transforms expand around that anchor. Pointer input may perturb the shared camera by a few pixels, never the shrine relative to terrain.

The spirit follows one authored arc: `38vw/43svh` → `48vw/34svh` → `58vw/48svh`. Its core and light envelope share one carrier. Internal light may shimmer through restrained opacity and scale only.

## Prototype changes

- Replace the five independent layer transforms with the grouped camera model above.
- Derive half-resolution rough assets from the current master/background/foreground/shrine/spirit art; do not call image generation.
- Add a debug overlay, enabled by `?debug=1`, showing progress, shrine-anchor drift, layer labels, and the spirit path.
- Add deterministic `?progress=0|0.25|0.5|0.75|1` rendering so the five review checkpoints can be captured without timing races.
- Preserve live HTML text, keyboard navigation, fallback behavior, and reduced-motion behavior.

## Acceptance criteria

1. The shrine remains fused to terrain at all five checkpoints with measured base drift within tolerance.
2. Only the spirit travels independently; atmosphere only breathes or drifts locally.
3. Far world, focus group, canopy arch, and near sill produce visibly distinct depth at 25–75% progress.
4. No transparency seam or empty canvas edge is exposed at maximum approach.
5. Maximum 9 scene requests, 8 promoted planes, one RAF, desktop assets at or below 1.5MB, and a static reduced-motion mode.

## Non-goals

- Final regenerated art, production-ready mattes, video, canvas/WebGL, multiple scenes, or final copy.
- Independent shrine animation or individual animation for leaves, stones, vines, or architectural pieces.
- Shipping or replacing the current approved fallback before this motion proof passes.
