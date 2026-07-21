# Spec 018 - Motion Direction

## Shared grammar

- Motion thesis: intelligence becomes visible through continuity, not spectacle.
- Primary ease: `power3.inOut`; responsive feedback: `power2.out`; scroll progress: `none`.
- Duration family: 160 ms tactile, 420 ms state, 720 ms narrative, scroll-linked for spatial scenes.
- Only transforms and opacity by default. Layout continuity uses Flip when a real state change
  requires measurement.
- One signature interaction per case. All supporting motion borrows its direction and timing.

## DESIGN:OS promotion - Prompt becomes direction

### Meaning

Show the product's core causal chain instead of decorating a marketing claim: a short user prompt
is resolved into design decisions, then those decisions become a qualified interface, then
feedback becomes a later rule.

### Scene contract

| Trigger | Changed property | User meaning | Reduced-motion equivalent |
|---|---|---|---|
| Section reaches viewport top | Three stages pin and hand off focal scale/position | DESIGN:OS resolves intent before output | Static vertical sequence with persistent causal connectors |
| Scroll progress crosses stage label | Prompt tokens move into typed decision groups | The system adds structure, not adjectives | Immediate stage replacement with heading announcement |
| Decision stage completes | Selected decisions Flip into positions around the final render | Output preserves its reasoning | Final render appears beside a compact decision list |
| Learning receipt enters | A corrected detail travels back to the relevant decision | Feedback changes later behavior | Source, decision, and outcome remain linked in a static receipt |

### GSAP plan

- One top-level ScrollTrigger timeline on the scene wrapper: `start: "top top"`, calculated end,
  `pin: true`, `scrub: 0.8`, `invalidateOnRefresh: true`.
- Animate children only. Timeline labels: `intent`, `resolve`, `compose`, `learn`.
- Use Flip only for the decision-to-render placement transition.
- Use `gsap.matchMedia()` for desktop choreography, compact mobile steps, and reduced motion.
- Refresh after generated preview images and fonts settle.

### Interaction support

- Before/after comparison uses a keyboard-operable range input. GSAP responds to the semantic
  value; it does not replace the control.
- CTA feedback is directional but not magnetic on touch devices.
- Interruption keeps the closest completed label, avoiding half-resolved content.

## Nutrition native mobile - Capture becomes understanding

### Meaning

Keep the meal visually continuous from camera capture through analysis and into an editable plan.
The user should feel that the system understood the same object, not that it opened another page.

### Native scene contract

| Trigger | Changed property | User meaning | Reduced-motion equivalent |
|---|---|---|---|
| Shutter confirmation | Captured meal thumbnail expands into analysis surface | Analysis is anchored to the photographed meal | Crossfade with persistent thumbnail |
| Ingredient recognition completes | Regions receive sequential focus rings and labels | The system explains what it recognized | Labels appear together in reading order |
| User corrects an ingredient | Nutrition summary and meal plan update with shared identity | Correction changes the plan immediately | Values replace with a clear changed-state announcement |
| User drags meal into a day | Card follows touch, target reacts, result settles with haptic | Planning is direct manipulation | Accessible move action and confirmation |

Production uses platform-native shared-element transitions, spring animation, drag gestures, and
haptics. A GSAP prototype may demonstrate timing but is not benchmark implementation evidence.
Respect Reduce Motion, Dynamic Type, safe areas, VoiceOver/TalkBack ordering, and 44/48-point
targets. Haptics signal capture, accepted correction, and successful placement only.

## Architecture - Site forces become space

### Meaning

Reveal how light, slope, wind, and memory determine the built form. The interaction connects
analysis to architecture rather than presenting another image carousel.

### Scene contract

| Trigger | Changed property | User meaning | Reduced-motion equivalent |
|---|---|---|---|
| Site section pins | Landscape image establishes full frame | The project starts with place | Static site image with four ordered annotations |
| Scroll crosses each force | Light path, contour, wind line, and remembered view reveal in sequence | Each force contributes a constraint | Four stacked evidence rows beside the image |
| Force sequence completes | Building volume resolves over the site photograph | Form is the consequence of constraints | Final built image follows the site analysis |
| Material detail receives focus/hover | Detail moves from raw material to installed surface | Material choice connects touch to room | Side-by-side material and room images |

### GSAP plan

- Use one pinned ScrollTrigger timeline for the site-to-form sequence; no second marquee or
  competing scroll hijack.
- Draw meaningful analysis paths with DrawSVG; use MorphSVG only if site and building outlines
  have a legible correspondence.
- Apply restrained image scale and depth translation to children. No ambient perpetual parallax.
- Mobile becomes a native vertical evidence sequence. Do not pin beyond one viewport on small
  screens.

## Evidence gate

For each implementation capture:

- desktop and mobile normal-motion video;
- reduced-motion video or state sequence;
- keyboard traversal through pinned and interactive regions;
- pointer interruption and reverse-scroll behavior;
- late-font/image refresh and route teardown;
- performance trace on representative mobile hardware;
- INP below 200 ms and animation-caused CLS of zero;
- console and detached-listener check;
- a one-sentence meaning for every surviving animation.

Fail a scene when its static fallback loses content, its interaction traps input, its motion owner
is ambiguous, or removing the effect changes nothing about comprehension.
