# 3D world techniques

These techniques describe runtime-neutral 3D scene jobs. They never authorize a dependency, asset,
or vendor recipe; the Canvas T6 owner and the static baseline remain binding.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## FX-04 — Lit object stage

### Purpose
Give a product or place a measured sense of volume when spatial form is part of the proof.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a lit object stage when a real object, material, or spatial product property is central proof.
The trigger is a subject that gains meaning from volume, not a generic 3D flourish.

### Mechanism
Place a bounded object under one coherent key light with restrained fill and camera movement.
Keep the object description, labels, and action controls in semantic HTML outside the scene.

### Anti-use
Do not use an unlicensed or unverifiable model, put critical text inside the render, or add depth
when a still image carries the same proof. Avoid a rotating object with no stated viewing purpose.

### Required fallback
Ship an approved static image or structured product details when 3D fails. Reduced motion settles on
a poster; capability failure keeps the object description and controls visible.

### Responsive and input behavior
Use a still or lower-detail stage on narrow and coarse-pointer devices. Drag or orbit is optional,
bounded, and never required for discovery; keyboard controls belong in the semantic layer.

### Lifecycle and performance downgrade
Load only when the brief earns T6, cap pixel ratio, pause offscreen, and dispose geometry, materials,
textures, and listeners on teardown. Lower geometry and lighting complexity before hiding proof.

### Verification
Check asset provenance, poster, reduced motion, no-context behavior, narrow/wide framing, focus,
and remount cleanup. Confirm the fallback conveys the object's key property without WebGL.

### Failure Modes
Failures include an object with no semantic purpose, a blank canvas while assets load, and GPU
resources surviving navigation. Treat the still and description as the deliverable.

## FX-05 — Procedural landscape

### Purpose
Make a sparse landscape communicate scale and terrain while keeping the scene bounded and explainable.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a procedural landscape when terrain, distance, or changing horizon is a useful metaphor for
the product story. The trigger is exploration or scale, not empty decorative space.

### Mechanism
Generate a limited terrain vocabulary with a clear horizon, restrained color zones, and optional
time change. Tie scene transitions to chapters or states rather than random variation.

### Anti-use
Do not present generated terrain as geographic evidence or spend a heavy scene behind dense copy.
Avoid unbounded geometry, endless camera travel, and visual detail without narrative landmarks.

### Required fallback
Provide a static landscape, diagram, or chapter illustration with the same stated landmarks.
Reduced motion settles the horizon; capability failure selects the semantic illustration.

### Responsive and input behavior
Use a fixed still or simplified horizon on narrow and coarse-pointer devices. Touch scroll stays
native, and any camera gesture is secondary to labeled chapter navigation.

### Lifecycle and performance downgrade
Use level-of-detail bands, cap terrain extent, pause hidden scenes, and dispose buffers on unmount.
Reduce tessellation, vegetation, and transitions in that order before dropping the fallback content.

### Verification
Test landmarks, chapter transitions, reduced motion, capability-off, wide/narrow crops, hidden-tab
pause, and cleanup. Do not claim geography or performance beyond observed target evidence.

### Failure Modes
Watch for terrain that reads as random wallpaper, a horizon that clips on mobile, and geometry that
grows after resize. Keep the world small enough to explain and prove the still state.

## FX-06 — Procedural architecture

### Purpose
Show architectural massing as a reusable visual system without turning the page into a free-form model viewer.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use procedural architecture when repeated modules, assembly, or system scale are part of the
message. The trigger is a structure that benefits from recombination.

### Mechanism
Compose a small explicit vocabulary of forms from a deterministic profile, then reveal or vary only
the part that carries the story. Labels and system relationships remain DOM content.

### Anti-use
Do not use random buildings as a generic tech backdrop or imply real infrastructure from invented
forms. Avoid excessive instances that obscure the actual product hierarchy.

### Required fallback
Provide a static isometric or schematic illustration with named modules when the scene is absent.
Reduced motion settles the assembly, and capability failure preserves the module list and explanation.

### Responsive and input behavior
Reduce instance count and camera range on narrow screens; expose a 2D module list for touch and
keyboard. Never require orbit or zoom to reach a label or action.

### Lifecycle and performance downgrade
Reuse geometry, cap instances, pause offscreen, and release buffers and observers during teardown.
Lower instance count and shadow complexity before removing the system's semantic labels.

### Verification
Check deterministic profiles, module labels, reduced motion, capability-off, resize, focus order,
and remount cleanup. Confirm repeated forms remain legible at the smallest supported width.

### Failure Modes
Failures include a city of meaningless shapes, random output that changes the proof, and instance
buffers leaking between scenes. Keep the vocabulary small and the fallback explicit.

## FX-07 — Weather field

### Purpose
Use controlled environmental particles to establish weather, atmosphere, or passage of time around content.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a weather field when changing conditions or passage of time supports the subject's mood or
state. The trigger is environmental meaning, not a desire for particles.

### Mechanism
Model a bounded precipitation or atmosphere field with a stable wind direction, depth cue, and
state transition. Treat accumulation or lightning as optional signals with explicit semantics.

### Anti-use
Do not place rain over a calm product explanation, imply live weather without data, or obscure text
with precipitation. Avoid multiple weather states that have no content relationship.

### Required fallback
Use a static atmospheric illustration, token-bound gradient, or no field while preserving the
state label. Reduced motion selects one settled condition; capability failure keeps the page useful.

### Responsive and input behavior
Lower particle density and disable pointer coupling on narrow or coarse-pointer devices. Weather is
decorative, aria-hidden, pointer-transparent, and never changes scroll or focus.

### Lifecycle and performance downgrade
Use pooled particles, cap DPR and depth, pause hidden canvases, and dispose resources on teardown.
Reduce count, simulation frequency, and secondary events before touching the content layer.

### Verification
Test state labels, reduced motion, capability-off, touch, narrow/wide density, hidden-tab pause,
and remount. If the scene implies live data, verify that data separately or label it as illustrative.

### Failure Modes
Failure looks like stock rain over unrelated copy, a storm that obscures controls, or a simulation
continuing after navigation. Keep environmental motion bounded and its meaning explicit.
