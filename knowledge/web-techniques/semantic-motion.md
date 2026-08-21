# Semantic motion techniques

These primitives attach movement to hierarchy, feedback, or spatial explanation. Start with the
lowest sufficient tier in `motion-craft.md`; this card is a selection contract, not permission to
add motion everywhere.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## MOT-02 — Staggered semantic text

### Purpose
Reveal a short semantic sequence in order so timing reinforces hierarchy rather than delaying meaning.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a stagger when a short heading or list should reveal its internal order. The trigger is an
observable sequence in the message, not a desire to animate every word.

### Mechanism
Keep one accessible text source and apply timing to visual spans or line wrappers as an enhancement.
The final readable text must exist before scripting, with each delay supporting the reading rhythm.

### Anti-use
Do not split long paragraphs, links, or labels into dozens of moving nodes because the DOM becomes
fragile and comprehension slows. Avoid stagger when simultaneous visibility is more honest.

### Required fallback
Show the complete text immediately when script, scroll observation, or motion is unavailable. Under
reduced motion, remove delays and leave the semantic order unchanged.

### Responsive and input behavior
Recompute line or word grouping after a width change instead of preserving desktop wrappers. Never
delay a focused label, button name, or live status; touch users receive the same complete copy.

### Lifecycle and performance downgrade
Observe only the owning section, cancel pending timers on teardown, and animate transform/opacity.
Reduce the number of fragments before adding a heavier timeline library.

### Verification
Read the text with animation disabled, resize during and after entry, tab through links, and test
long localized strings. Confirm the DOM order and accessible name are unchanged.

### Failure Modes
Failures include hidden words after a script error, awkward rewraps after resize, and a focus target
arriving late. Make the final state the default and keep the animation optional.

## MOT-07 — Pointer parallax

### Purpose
Give pointer movement a small spatial response that explains depth while leaving the page usable without it.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use restrained pointer parallax to make a layered focal object feel spatially responsive. The
trigger is a quiet depth cue that improves orientation, not a need for constant cursor spectacle.

### Mechanism
Map normalized pointer displacement to small clamped offsets for separate visual layers, then ease
each layer toward its target. Recenter when input leaves and keep the content plane stable.

### Anti-use
Do not move primary copy, controls, or the whole reading surface because parallax can damage focus
and cause motion discomfort. Avoid it when touch is the primary input or a static hero is sufficient.

### Required fallback
Use the centered composition when pointer APIs are absent, touch is detected, or reduced motion is
requested. The focal object and its explanation remain fully visible without the response.

### Responsive and input behavior
Use coarse-pointer and reduced-motion media queries as gates, not as after-the-fact speed changes.
Clamp movement more tightly on narrow screens and never block clicks or keyboard focus.

### Lifecycle and performance downgrade
Use one pointer listener per owning section, schedule at most one visual update per frame, and
remove it on teardown. Drop secondary layers and easing before reducing content opacity.

### Verification
Test enter, leave, pointer cancellation, touch emulation, keyboard-only use, reduced motion, and
resize. Confirm no horizontal overflow or layout shift occurs while the pointer moves.

### Failure Modes
Watch for a drifting hit area, a frozen listener after navigation, and excessive movement near the
viewport edge. Keep the semantic layer fixed and use a small, measured visual range.

## MOT-08 — Hover aperture

### Purpose
Focus attention through a bounded hover or pointer aperture without replacing the visible information layer.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use an aperture when a paired visual comparison benefits from a local reveal under a pointer or
focus. The trigger is a real before/after or detail relationship.

### Mechanism
Keep two aligned images or layers in the same coordinate space and reveal the upper one through a
radial or directional window. The comparison remains available as a static arrangement for every
non-pointer input.

### Anti-use
Do not hide the only product information behind hover, and do not use a moving aperture for a simple
image link. Misaligned source layers make the effect look like a crop bug rather than comparison.

### Required fallback
Provide a visible side-by-side, toggle, or single-image state when hover, masking, or script fails.
Focus and touch must expose the same two states without requiring a fine pointer.

### Responsive and input behavior
Enable the aperture only for `(hover: hover)` and provide a tap-controlled toggle on coarse input.
Use focus-visible to place the window predictably and keep the target's hit box unchanged.

### Lifecycle and performance downgrade
Update one CSS variable per frame and avoid image decoding on every pointer move. Remove listeners
on unmount and fall back to the static comparison if either image cannot load.

### Verification
Check alignment at each breakpoint, keyboard focus, touch toggle, pointer leave, image failure, and
reduced motion. Verify the fallback communicates the comparison without the effect.

### Failure Modes
Typical failures are a reveal that flashes at the wrong origin, a touch device with no alternate
state, and a focus ring hidden under a clip. Establish the static composition first.
