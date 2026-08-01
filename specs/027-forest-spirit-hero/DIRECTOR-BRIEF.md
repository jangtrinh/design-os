# Director Brief — Follow What Disappears

**Director:** Fable 5  
**Status:** OWNER STORYBOARD APPROVAL REQUIRED  
**Scope:** Direction only. No final assets or implementation until the storyboard gate passes.

## Delivery contract

**Outcome:** Turn the forest hero from a layered zoom into one continuous encounter with invitation, acceleration, disappearance, commitment, reveal, orbit, and arrival.

**Constraints:** The shrine remains physically fused to terrain. Only the spirit independently flies. The world is continuous, copy stays live HTML, reduced motion is static, and the existing 12 semantic layers remain the production budget.

**Non-goals:** Final asset generation, GSAP implementation, video, WebGL, autonomous movement for every layer, or redesigning the world between stations.

**Acceptance:** Seven desktop storyboard frames communicate threshold → invitation → loss → reveal → arrival without copy, preserve world geography, and pass the gate at the end of this brief.

## Why the current proof reads basic

- Every checkpoint preserves essentially the same wide composition at a larger scale.
- The spirit follows a predictable diagonal and covers the shrine instead of revealing it.
- The shrine is visible from the beginning, leaving the ending with no new information.
- Foreground, atmosphere, and text progress in parallel without causing one another.
- There is no anticipation, interruption, hold, depth crossing, reversal, or payoff.

The 12 layers prove separation. Separation alone is not a story.

## Concepts considered

| Concept | Core event | Decision |
|---|---|---|
| **Follow What Disappears** | The spirit beckons, crosses close, vanishes, then reappears around the shrine as the camera clears the obstruction. | **Selected:** strongest contrast, occlusion, emotional reversal, and earned reveal. |
| The Shrine Awakens | The spirit circles the shrine while light and pollen intensify. | Rejected: effect-led and shrine-obvious from the opening. |
| Across the Water | The spirit skims the creek with reflection and water response. | Rejected: expensive water work weakens the shrine reveal. |

## Emotional thesis

**Trust begins when the guide leaves your sight.**

The spirit notices the visitor and invites pursuit. At the midpoint it disappears behind the forest's near structure. The camera continues without reassurance. Clearing that obstruction reveals the shrine and the spirit's purpose.

The shrine does nothing. Its permanence is the reward.

## Persistent-world bible

- The creek enters from lower centre and leads diagonally into the clearing.
- The shrine is permanently rooted on the raised right bank beneath the ancient tree.
- The upper-left canopy opening is the single daylight source.
- The waterfall and deep mist preserve left-background orientation.
- The right trunk and hanging vines are the reveal obstruction.
- The lower bank, root, and ferns are the near threshold.
- Light always originates upper-left; haze and occlusion change, never the sun.
- Neighbouring stations retain at least 60% recognizable world overlap.
- Shrine contact, architecture, and world coordinates remain identical throughout.

The camera advances monotonically along the creek. It never cuts, teleports, pulls back, or starts a second composition.

## Seven-station desktop storyboard

| Station | Camera and composition | Spirit performance | Shrine / scene state | Copy purpose |
|---|---|---|---|---|
| **1. Threshold** `0.00–0.10` | Low wide view behind the bank; creek leads inward; camera nearly still. | Tiny presence near `35%/36%`; no flight. | Shrine 10–20% visible as roof fragment behind trunk/vines. Cool haze; weak shaft. | Place eyebrow only. |
| **2. Recognition** `0.10–0.23` | Slow forward commitment on the creek axis. | Familiar hover at `38%/43%`, hold, then 1–2vh dip back-left. | Shrine stays below 25%; shaft concentrates around spirit. | First headline line. |
| **3. Crossing** `0.23–0.38` | Camera accelerates forward without changing axis. | Fast rising curve centre-right, moving mid-depth → near-depth. | Shrine remains unresolved; near vine passes in front of spirit at the end. | Headline resolves, then recedes. |
| **4. Absence** `0.38–0.48` | Deliberate near-hold; forward travel barely perceptible. | 70–100% concealed by right trunk/vines; bounded edge glow only. | Shrine 25–35%; foreground occlusion maximal; shaft cools and dims. | Visual silence; no new copy. |
| **5. Reveal** `0.48–0.68` | Camera resumes and slips laterally past the obstruction while moving forward. | Reappears behind the shrine roofline and traces the left eave. | Shrine moves from partial to fully readable without moving in the world; warm rear light opens. | Lede appears after the landmark is earned. |
| **6. Orbit** `0.68–0.86` | Slow approach with shrine as anchor. | Passes behind roof, emerges at near eave, briefly crosses in front, then decelerates. | Genuine behind/in-front depth payoff; lower sill rises as visitor reaches bank. | CTA enters after peak speed. |
| **7. Settle** `0.86–1.00` | Arrival framing; no reverse or final zoom lurch. | Stable hover beside doorway/lantern, clear of shrine silhouette and copy. | Shrine fully visible, grounded, calm, and dominant; proscenium yields to next section. | CTA holds for reading and action. |

## Camera grammar

- One fixed virtual lens and one continuous dolly path.
- Camera starts low and left of the creek axis; forward motion stays monotonic.
- One restrained lateral slip exists solely to clear the right-trunk obstruction.
- Shrine/terrain gains approximately 8–12% apparent scale through camera approach.
- Shrine base stays within about `2vw/2vh` of its reveal anchor and never moves relative to terrain.
- Near sill may reach 1.24–1.28 effective scale; canopy 1.16–1.20; far world about 1.04.
- Intentional velocity reductions occur only during absence and arrival.
- Reverse scroll reconstructs the same shot: settle → orbit → concealment → threshold.

## Spirit choreography

1. **Notice:** irregular hover resolves into stillness.
2. **Anticipation:** short dip backward/down; wings and light compress.
3. **Acceleration:** decisive curved launch; fastest movement happens before disappearance.
4. **Crossing:** spirit moves mid-depth → near-depth and behind foreground vines.
5. **Absence:** character is hidden; bounded glow leakage remains.
6. **Orbit/reveal:** spirit appears behind the shrine roof, crosses an eave boundary, then emerges in front.
7. **Settle:** speed falls sharply; spirit ends beside the shrine, never over its face or doorway.

A straight diagonal tween, size-only flight, or uninterrupted foreground placement fails direction.

## GSAP master timeline

ScrollTrigger supplies one normalized scroll progress value to one labeled GSAP timeline. GSAP owns interpolation, easing, holds, reversible state, and copy choreography. No child tween owns a ScrollTrigger.

| Label | Progress | Direction |
|---|---:|---|
| `threshold` | `0.00–0.10` | Establish geography; hold `0.00–0.05`. |
| `notice` | `0.10–0.23` | Hover and recognition; anticipation at `0.18–0.23`. |
| `crossing` | `0.23–0.38` | Strong acceleration and foreground depth crossing. |
| `absence` | `0.38–0.48` | Camera near-hold at `0.41–0.46`; spirit concealed. |
| `reveal` | `0.48–0.68` | Lateral clearance, warm-light reversal, shrine reveal. |
| `orbit` | `0.68–0.86` | Behind/in-front shrine crossing; CTA follows peak speed. |
| `settle` | `0.86–0.94` | Character and camera decelerate; arrival hold. |
| `release` | `0.94–1.00` | Following section assumes ownership without a cut. |

Only the spirit launch receives energetic easing. Camera movement stays restrained and continuous: no spring, elastic, bounce, or overshoot.

## Layer participation

- **Far world:** camera only; no ambient wandering.
- **Mid-world + shrine:** one camera group; no independent shrine transform or fade.
- **Canopy / right trunk / vines / near sill:** entrance, concealment, reveal, arrival, and release masks—not decorative motion.
- **Shaft, haze, pollen, motes:** cool → subdued absence → warm reveal; otherwise quiet.
- **Spirit core/light:** the only independently traveling subject; copy enters only after the image creates its reason.

## Deferred work

Mobile adaptation is explicitly out of scope for this delivery. It must be designed and approved as a separate storyboard before implementation; the desktop composition must not be silently center-cropped and presented as a mobile version.

## Reduced-motion keyframe

Use one authored settled-reveal still: shrine fully visible and grounded, spirit beside it and clear of architecture/copy, warm shaft behind shrine, threshold depth intact, and all live copy immediately visible. No sticky travel, timeline, flight, staged opacity, or animated atmosphere.

## STOP list

- STOP uniform zoom as narrative or keeping the shrine fully visible before the reveal.
- STOP shrine translation, bob, pointer parallax, fade-in, or any relative terrain movement.
- STOP straight-line spirit motion without anticipation, concealment, and depth-order crossing.
- STOP moving every layer because it exists or allowing copy to lead every beat simultaneously.
- STOP production if stations redesign geography, move shrine contact, reverse the camera, or rasterize live text.

## Storyboard approval gate

No final assets or code until the desktop board passes:

- Same geography and shrine contact across all stations.
- Threshold → invitation → loss → reveal → arrival is understandable without copy.
- Shrine is teased early, revealed after the absence hold, and remains planted.
- Only the spirit independently travels; both occlusion crossings are credible.
- Camera is continuous and reversible; absence and arrival holds differ visibly from neighbouring motion.
- Final frame provides new information and a stronger composition than the opening.
- Reduced motion represents the payoff.
