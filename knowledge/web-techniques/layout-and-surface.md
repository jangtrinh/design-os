# Layout and surface techniques

These techniques change how a surface groups, separates, or frames content. They do not choose a
persona, replace the page-structure owner, or become a reason to add decoration without a job.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## SUR-01 — Alpha mask

### Purpose
Shape a visual boundary around meaningful content while preserving the content box and semantic hierarchy.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a mask when a silhouette or edge should follow the content rather than a rectangular box. The
trigger is a meaningful shape boundary, not a desire to hide a weak crop.

### Mechanism
Keep the image or color field in its own layer and reveal it through a bounded alpha shape. The
underlying DOM remains the source of meaning, while the mask supplies only the visual contour.

### Anti-use
Do not mask essential text, controls, or focus indicators because a clipped semantic layer can
become unreadable and untestable. Use an ordinary overflow or border when a rectangle communicates
the same grouping.

### Required fallback
Provide the unmasked image or solid surface when masking is unsupported or disabled. Reduced motion
does not require a change, but the static path must keep the same reading order and contrast.

### Responsive and input behavior
Anchor the mask to the container rather than a fixed viewport size, and recalculate its aspect
when the crop changes. It must not intercept pointer or keyboard input unless it is itself a control.

### Lifecycle and performance downgrade
Prefer CSS and a single composited layer; do not redraw a canvas for a static mask. Remove observers
when the owning section leaves the document, and drop to a rectangular crop under memory pressure.

### Verification
Check the unmasked fallback, narrow and wide crops, zoom, keyboard focus, and a long text label.
Confirm the mask never hides content required to understand or operate the page.

### Failure Modes
Common failures are a focal point cut off at mobile width, a mask that clips focus, and a decorative
shape that adds bytes without changing hierarchy. Each is fixed by measuring the content box first.

## SUR-02 — Gradient edge

### Purpose
Use a controlled edge transition to separate adjacent regions without adding a hard container wall.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a gradient edge to mark a boundary or transition where a solid rule would be too assertive.
It earns a place when the edge clarifies grouping, state, or depth.

### Mechanism
Render a narrow color transition in a pseudo-element or border layer separate from content. Bind
its colors to the active surface and accent roles; the edge should remain a line of information,
not a second background.

### Anti-use
Do not wrap every card in a luminous edge because repetition erases hierarchy and raises contrast
noise. Avoid it when a plain border already communicates ownership or when the edge competes with
focus styling.

### Required fallback
Use a solid token-bound border when gradient paint or masking is unavailable. The fallback must
retain the same boundary and state signal without relying on a visual glow.

### Responsive and input behavior
Keep edge thickness stable across widths and let the containing box determine its length. Set
`pointer-events: none` on decorative layers so hover and touch remain owned by the real control.

### Lifecycle and performance downgrade
Use CSS paint before a shader or canvas; remove animated edge work when the surface is offscreen.
If a field must animate, reduce resolution and frequency before reducing content contrast.

### Verification
Inspect default, hover, focus, disabled, and error states against the neighboring surface. Test
forced colors, reduced motion, narrow width, and the solid fallback independently.

### Failure Modes
Failure looks like a border that reads as a glow blob, a gradient that lowers text contrast, or a
decorative layer stealing input. The repair is a thinner bounded edge with measured contrast.

## SUR-03 — Progressive blur

### Purpose
Soften or focus a region with a bounded blur treatment whose paint cost and contrast can be measured.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use progressive blur to establish a shallow depth veil between foreground content and a moving or
busy background. It is appropriate when separation matters more than showing every background detail.

### Mechanism
Stack a small number of clipped blur bands whose opacity and blur increase toward the occluded edge.
Place the content on a stable surface above them so legibility never depends on a blur algorithm.

### Anti-use
Do not blur primary copy, controls, or the only representation of an image because information is
then lost rather than organized. Avoid many bands that simulate depth without a compositional need.

### Required fallback
Replace the bands with an opaque or translucent token-bound surface. Preserve the complete text and
control states when backdrop filters are absent or reduced motion is requested.

### Responsive and input behavior
Reduce band count and blur radius on narrow or low-power devices while preserving the foreground
surface. Keep every band non-interactive and ensure touch targets remain on the semantic layer.

### Lifecycle and performance downgrade
Backdrop filters are expensive over large areas; cap their coverage and pause any animated backdrop
when hidden. Downgrade from several bands to one translucent layer before dropping content.

### Verification
Compare readability over the busiest background, then test no-filter, reduced-motion, zoom, touch,
and keyboard states. Confirm the blur does not change hit areas or focus visibility.

### Failure Modes
Typical failures are a milky page-wide veil, text softened by the wrong stacking order, and GPU
cost that rises with every card. Scope the veil to the focal region and measure the paint area.

## SUR-06 — Tactile depth

### Purpose
Give a panel or control a restrained sense of physical depth that clarifies grouping and interaction.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use tactile depth when a control or object should read as pressable, raised, inset, or materially
separate. The depth must reinforce a state or affordance that already exists semantically.

### Mechanism
Pair a restrained outer elevation with an inner edge or inset change, then move between those
states on interaction. Use a single coherent light direction so the surface reads as one material.

### Anti-use
Do not add deep shadows to ordinary containers or use bevels to imply interactivity where no action
exists. Avoid shadows that lower contrast, obscure focus, or make a flat reading surface feel heavy.

### Required fallback
Keep a visible border and explicit color/state change when shadows are disabled. The control must
remain identifiable and operable with forced colors, reduced motion, and no shadow support.

### Responsive and input behavior
Preserve the pressed state for keyboard, pointer, and touch; never make hover the only signal.
Maintain target size and avoid translating the control in a way that changes surrounding layout.

### Lifecycle and performance downgrade
Animate only transform and opacity where motion is needed, and release compositor hints after the
state change. On low-power surfaces, keep one static elevation rather than stacking live shadows.

### Verification
Check default, hover, focus-visible, pressed, disabled, and error states at every canonical width.
Verify contrast and focus remain clear in forced colors and reduced-motion modes.

### Failure Modes
Watch for floating-everything, a pressed state that is indistinguishable from disabled, and shadow
clipping at an overflow boundary. Fix the state model before tuning the paint.

## SUR-07 — Chamfered surface

### Purpose
Mark a meaningful panel boundary with a clipped angular surface rather than a generic rounded box.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a chamfer when a panel needs a directional, engineered, or cut-material boundary that helps
the reader recognize its role. One or two deliberate corners are enough.

### Mechanism
Clip the visual shell while keeping the semantic content box rectangular and predictable. Place
decoration in a separate layer so text, focus rings, and hit areas are not cut by the silhouette.

### Anti-use
Do not chamfer arbitrary cards or controls because the novelty becomes a repeated border pattern.
Avoid clipping a focus ring, tooltip, or content that must remain fully visible.

### Required fallback
Use a rectangular bordered panel with the same spacing and color roles when clipping is unavailable.
The fallback must carry the panel boundary and retain all controls.

### Responsive and input behavior
Scale the cut by the container's shortest dimension and reduce it at narrow widths. Keep the hit
area rectangular; pointer and keyboard interactions must not depend on the clipped pixels.

### Lifecycle and performance downgrade
Prefer a CSS clip path or pseudo-element; do not create a per-frame geometry pass for a fixed corner.
Remove decorative layers when the panel is hidden and keep the rectangular fallback during stress.

### Verification
Test long headings, focus-visible rings, tooltips, overflow, zoom, and 390/768/1440 layouts. Compare
the clipped and rectangular versions for identical content order and operation.

### Failure Modes
The visible cut can hide focus, eat a badge, or become a sharp visual repeated on every card. Move
the cut to the shell and reserve it for a meaningful panel boundary.

## SUR-08 — Ordered dither

### Purpose
Introduce a low-amplitude ordered texture that preserves tonal hierarchy while reducing sterile flatness.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use ordered dither as a bounded tonal texture when a surface needs inspection, compression, or
technical character. It is a detail layer, never the carrier of essential information.

### Mechanism
Quantize a sampled field against a small repeating threshold pattern, then mix the result below
content. Keep the pattern scale intentional so it reads as texture rather than accidental noise.

### Anti-use
Do not dither body copy, charts, focus states, or a surface whose purpose is calm legibility. Avoid
using the texture as a substitute for a strong layout or as a permanent full-page filter.

### Required fallback
Render a token-bound solid or low-contrast gradient without the texture. Reduced motion freezes or
removes the field; capability failure must still leave a complete readable surface.

### Responsive and input behavior
Increase the effective pattern size or remove it on small screens and coarse pointers. Keep the
texture layer inert so controls receive all pointer, touch, and keyboard events.

### Lifecycle and performance downgrade
Use a static CSS or precomputed layer when possible; cap resolution and pause redraws offscreen.
Downgrade density before adding a second field, and dispose any temporary buffer on unmount.

### Verification
Inspect text contrast over the texture, reduced motion, capability-off, narrow viewport, and zoom.
Check that a screenshot at the target DPR does not turn the texture into flicker or moiré.

### Failure Modes
Failure appears as vibrating edges, illegible small type, or a filter applied to controls. Lower
contrast and area, then verify the plain fallback instead of polishing the artifact.

## SUR-09 — Atmospheric light

### Purpose
Use a quiet, bounded light field to direct attention toward one focal region without competing with content.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use layered light to give a quiet backdrop a focal direction or sense of air. It earns space when
the wash supports the page's hierarchy and the content still works without it.

### Mechanism
Combine a few broad, low-contrast color fields with a localized bloom behind the focal region.
Keep the fields behind an opaque or translucent content surface and bind colors to design tokens.

### Anti-use
Do not use light washes to rescue an empty composition, compete with text, or make every section
feel like a hero. Avoid unbounded animation that turns ambience into visual noise.

### Required fallback
Use a static token-derived gradient or plain surface when animation, blending, or GPU paint is not
available. The fallback must preserve contrast and the same focal hierarchy.

### Responsive and input behavior
Reduce field count and focal spread on narrow screens; keep the content surface opaque enough for
reading. Decorative layers never capture input and do not shift when a pointer leaves the page.

### Lifecycle and performance downgrade
Prefer CSS gradients for static atmosphere, pause animated fields when hidden, and cap blur area.
On constrained devices keep one fixed wash, then remove it while preserving the foreground surface.

### Verification
Measure contrast against the fallback surface, then inspect the wide/narrow, reduced-motion, and
capability-off states. Confirm the light does not hide focus, error text, or loading indicators.

### Failure Modes
Common failures are a color authority that overrides the design system, a bloom behind small type,
and atmosphere repeated without purpose. Tie the light to one focal job and test the plain state.

## SUR-10 — Gooey field

### Purpose
Create a restrained connected surface effect when nearby elements need to read as one fluid group.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a gooey field to visually group related soft forms or show a fluid relationship between nearby
states. The grouping must be understandable from labels and structure without the effect.

### Mechanism
Blur adjacent shapes, then apply a threshold-like contrast step so close forms merge while distant
forms separate. Keep the visual filter on a decorative layer and preserve the source shapes in DOM.

### Anti-use
Do not merge unrelated controls, text, or status indicators because the fluid edge destroys their
individual affordances. Avoid it for dense utility surfaces where crisp grouping is required.

### Required fallback
Replace the merged field with separate token-bound shapes, borders, or a plain grouped surface.
The fallback keeps labels, controls, focus order, and state distinctions intact.

### Responsive and input behavior
Reduce blur radius and merge distance at narrow widths so clusters do not collapse into one blob.
Keep the filter layer non-interactive; keyboard and touch operate on the unfiltered semantic nodes.

### Lifecycle and performance downgrade
Keep the filter region bounded and avoid repainting the entire page. Pause motion and remove filter
work offscreen; downgrade to separated shapes before lowering text or control clarity.

### Verification
Test adjacent but unrelated items, focus rings, error states, reduced motion, fallback rendering,
and all canonical widths. Verify that the semantic grouping remains obvious with filters disabled.

### Failure Modes
Watch for accidental mergers, halos around text, and filter cost that grows with every blob. Split
the visual layer from content and limit the number of moving shapes.
