# Real-time fields and emitters

These techniques are optional live visual layers. They inherit the Canvas T6 floor, static baseline,
one-effect cap, capability branches, and teardown rules from `canvas-effect-direction.md`.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## FX-01 — Perspective grid field

### Purpose
Provide a restrained coordinate frame that helps users read depth, scale, or technical orientation.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a perspective grid when depth, scale, or a technical coordinate frame helps explain the subject.
The trigger is spatial orientation, not an empty backdrop.

### Mechanism
Draw a bounded grid in a camera-relative plane, fade distant lines, and keep the perspective motion
subordinate to the content. The grid is decorative evidence of space, not a navigation surface.

### Anti-use
Do not place dense lines behind small text, use them on a flat utility screen, or let the grid imply
measurements that are not real. A decorative coordinate frame must not masquerade as data.

### Required fallback
Use a static token-bound line pattern or plain surface with the same content visible. Reduced motion
settles the camera and capability failure removes the field without removing the page.

### Responsive and input behavior
Reduce line count and depth span on narrow screens; disable pointer steering for coarse input. Keep
the canvas aria-hidden and leave pointer, touch, and keyboard events to the DOM.

### Lifecycle and performance downgrade
Cap device-pixel ratio, pause when hidden or offscreen, and dispose the renderer on unmount. Lower
density and update rate before shrinking the content surface or adding another effect.

### Verification
Capture static, reduced-motion, capability-off, narrow, wide, and cleanup states. Check that text
contrast and focus remain unchanged while the grid is active.

### Failure Modes
Failures are a grid that reads as false data, a canvas that remains hot in a hidden tab, and lines
that dominate the page. Limit the field to one spatial job and prove the fallback.

## FX-03 — Particle globe field

### Purpose
Suggest a connected global or distributed system through bounded points without making particles the data source.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a particle globe when distributed locations or worldwide reach are part of the story. The
trigger is a real spatial network or coverage idea, not a generic sphere.

### Mechanism
Place points on a bounded spherical surface with a restrained core, optional ring, and data marker
layer. Keep labels and explanations in semantic HTML outside the particles.

### Anti-use
Do not imply geographic accuracy from decorative points, expose a globe without a data question, or
make markers the only representation of coverage. Avoid interaction that competes with page scroll.

### Required fallback
Provide a list, map still, or labeled summary that carries the same locations and values. Reduced
motion freezes a legible frame; no-context or load failure selects the semantic summary.

### Responsive and input behavior
Use a still or simplified point view on narrow or coarse-pointer devices. Dragging is optional and
must not hijack scroll; keyboard users receive the same data through focusable summaries.

### Lifecycle and performance downgrade
Reuse point buffers, cap particle count and DPR, pause hidden canvases, and release geometry on
teardown. Reduce marker density before hiding a data label.

### Verification
Check representative data, empty/error states, focus order, reduced motion, touch scrolling,
capability-off, and remount cleanup. Confirm every claim has a non-particle representation.

### Failure Modes
Watch for decorative geography presented as evidence, a drag gesture blocking scroll, and a marker
layer that drains memory. Treat the summary as the truth and particles as an optional view.

## FX-09 — Laser threshold field

### Purpose
Use a thresholded line signal to mark proximity, activation, or a narrow spatial relationship.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a laser-like threshold field to mark a scan, boundary, or focused reveal in a technical story.
The trigger is a directional signal with a known target.

### Mechanism
Separate a narrow bright core from a restrained halo and connect its progress to an explicit state.
Keep the revealed content already available so the beam communicates order rather than access control.

### Anti-use
Do not gate primary content behind the beam, use it as an unbounded glow, or stack several beams
with no state distinction. Avoid it when a border or progress marker is clearer.

### Required fallback
Show the complete content and a static boundary marker when the field is unavailable. Reduced motion
uses a settled threshold; capability failure must not leave an empty hero.

### Responsive and input behavior
Shorten the beam and reduce halo spread on narrow screens. Pointer interaction is optional, never
required; keyboard and touch receive the same state changes through semantic controls.

### Lifecycle and performance downgrade
Render one bounded field, pause it offscreen, cap DPR, and remove listeners and RAF work on teardown.
Lower glow samples before sacrificing the visible boundary or content.

### Verification
Check threshold before/after states, reduced motion, touch, keyboard, load failure, and viewport
resize. Verify the static content is readable without executing the reveal.

### Failure Modes
Failures include a bright wash that erases text, a beam tied to raw pixels rather than state, and
a scroll-blocking interaction. Keep the signal narrow and the content independent.

## FX-10 — Ordered dither field

### Purpose
Add controlled tonal texture to a field while keeping the underlying content legible and stable.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a dither field as a controlled inspection or tonal treatment when coarse texture carries a
specific narrative role. It is an optional surface effect, not a content renderer.

### Mechanism
Apply a small repeating threshold pattern to a sampled field and composite it beneath the semantic
surface. Choose scale and contrast so the eye reads a stable texture rather than flicker.

### Anti-use
Do not dither body text, charts, focus states, or an otherwise modern utility surface without a
clear reason. Never use the field to conceal weak imagery or missing information.

### Required fallback
Use a plain token-bound surface or CSS gradient on capability failure. Reduced motion freezes or
removes the field, while the ordinary DOM remains fully legible.

### Responsive and input behavior
Lower pattern frequency or remove the field on narrow and coarse-pointer devices. Keep the canvas
non-interactive and place all controls in the semantic layer above it.

### Lifecycle and performance downgrade
Precompute static areas, cap backing-store size, pause offscreen redraws, and dispose buffers on
unmount. Lower resolution and contrast before affecting text or controls.

### Verification
Inspect the field at target DPRs, reduced motion, capability-off, zoom, keyboard, touch, and both
canonical viewport extremes. Confirm no moiré or flicker enters fine edges.

### Failure Modes
Failure appears as vibrating content edges, a texture treated as evidence, or a canvas that never
stops. Scope the field, keep contrast low, and prove the plain state.

## MOT-09 — Distance emitter

### Purpose
Make a distance-sensitive response visible around a deliberate user action while keeping the action semantic.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a distance emitter when pointer movement should leave a short-lived trace that explains motion
or gives a focused canvas interaction a physical response.

### Mechanism
Sample movement distance, emit bounded segments into a reusable ring, and fade them by age. The
emitter has an idle state and a clear stop condition; it does not accumulate history forever.

### Anti-use
Do not trail over text, controls, or a reading surface, and do not emit on every page by default.
Avoid it when a hover state communicates the action with less cost.

### Required fallback
Use a static pointer indicator or ordinary focus/hover state when the canvas is absent. Touch and
reduced motion select no-trail behavior while preserving the underlying action.

### Responsive and input behavior
Gate fine-pointer sampling, cap emission on high-frequency devices, and provide a tap/focus state
for coarse input. Pointer cancellation and leave must clear active emission without blocking input.

### Lifecycle and performance downgrade
Pool segments, coalesce movement per frame, pause hidden sections, and remove listeners/RAF loops on
teardown. Reduce segment count and lifetime before reducing responsiveness of the actual control.

### Verification
Check idle, fast movement, pointer leave/cancel, touch, reduced motion, capability-off, and remount.
Confirm the trace is decorative and that focus and click behavior remain identical.

### Failure Modes
Watch for a trail that grows without bound, a listener leaking after navigation, and a glow obscuring
the control that emits it. Bound the lifetime and keep the action's state visible in DOM.

## MOT-10 — Ambient particles

### Purpose
Add a sparse ambient layer that gives a section atmosphere without becoming its subject or its state.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use ambient particles when a section needs subtle living atmosphere tied to its subject or season.
The trigger is a bounded environmental cue, never a quota for visual activity.

### Mechanism
Emit a small population with explicit density, drift, recycling, and a section clip. Each particle
is disposable decoration; content and state remain outside the field.

### Anti-use
Do not place particles behind dense copy, use them on transactional controls, or let them imply
weather or data without labels. Avoid combining them with another full-viewport effect.

### Required fallback
Use a static texture, gradient, or no decoration when the field cannot run. Reduced motion selects
a still or empty state; the section's content remains complete.

### Responsive and input behavior
Lower density and disable pointer coupling on narrow or coarse-pointer devices. The field is
`aria-hidden`, pointer-transparent, and never changes the page's scroll or focus behavior.

### Lifecycle and performance downgrade
Recycle objects, cap DPR and count, pause when hidden, and clear timers/observers on teardown. Reduce
count, then update frequency, then remove the field before content quality is compromised.

### Verification
Test density against text, narrow and wide layouts, reduced motion, capability-off, hidden-tab pause,
and cleanup/remount. Confirm particles stay inside their owning section.

### Failure Modes
Failures include a snow-globe effect over unrelated content, count growth after remount, and a
canvas that remains active below the fold. Clip, recycle, and measure the section boundary.

## MOT-11 — Scan assembly

### Purpose
Reveal a bounded visual assembly in ordered passes so progress or construction is easy to follow.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use scan assembly when a structure benefits from a directional build from outline to resolved form.
The trigger is a materialization or inspection narrative with a clear start and end.

### Mechanism
Advance a world-space front, draw a leading wire signal, then reveal the solid form behind it. Keep
the final geometry or semantic illustration available independently of the scan.

### Anti-use
Do not use a scan to reveal required text, hide load latency, or decorate an unrelated section.
Avoid it when a simple fade or static diagram communicates the assembly.

### Required fallback
Show the resolved structure immediately with an optional static outline when the effect is absent.
Reduced motion selects the resolved state; capability failure never hides the object.

### Responsive and input behavior
Use a simpler 2D or still representation on narrow screens and do not tie progress to wheel speed.
Pointer, touch, and keyboard operate on the surrounding semantic controls, not the scan surface.

### Lifecycle and performance downgrade
Keep geometry bounded, pause when hidden, and dispose buffers, observers, and animation loops on
teardown. Reduce outline detail and sampling before reducing the resolved structure.

### Verification
Check the initial, mid, final, reduced-motion, capability-off, narrow, wide, and remount states.
Confirm the final form is visible even if the scan asset or renderer fails.

### Failure Modes
Watch for a front that reveals in screen space incorrectly, a wire layer that persists after finish,
and required information hidden until completion. Make the completed state the default fallback.
