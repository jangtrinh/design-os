# Scroll storytelling techniques

These techniques use ordered progress or continuity to make a narrative easier to follow. They
inherit the motion ladder and page-structure contracts; a scroll effect is never the only route to
content.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## MOT-03 — Scrubbed semantic text

### Purpose
Use reading progress to clarify a short statement without changing the semantic text or its order.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use scroll progress to emphasize a short statement when reading through it is part of the narrative.
The trigger is a deliberate sentence or sequence, not ordinary body copy.

### Mechanism
Preserve original text and inline semantics, then derive normalized progress for visual emphasis.
The emphasized state follows reading order and never becomes the only readable version.

### Anti-use
Do not scrub long legal, instructional, or interactive text because users must not fight scroll to
read. Avoid multiple competing scroll owners in one viewport.

### Required fallback
Render the full statement with ordinary text contrast when scroll timelines or scripting are absent.
Reduced motion selects that complete state instead of freezing halfway through.

### Responsive and input behavior
Recalculate wrapping and progress anchors after responsive reflow. Touch scrolling remains native,
and links inside the statement remain individually operable.

### Lifecycle and performance downgrade
Use one section-scoped progress reader, coalesce updates, and release observers on teardown. Reduce
granularity from word to line before adding heavier choreography.

### Verification
Compare top, middle, and end positions at narrow and wide widths; test reduced motion, keyboard
focus, inline links, fast reverse scroll, and a script-disabled baseline.

### Failure Modes
Failure appears as missing inline emphasis, text that never reaches its final state, or a second
scroll ticker fighting the page. Keep semantic copy authoritative and the effect reversible.

## MOT-05 — Progress story

### Purpose
Show narrative progress as an explicit, reversible indicator that helps users orient within a sequence.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a progress story when a finite sequence has meaningful stages and the reader benefits from
knowing where they are. The trigger is ordered content with a beginning and end.

### Mechanism
Represent stages as an ordered semantic list, then bind a marker or line to the active stage.
Progress comes from section geometry or explicit state, not arbitrary animation duration.

### Anti-use
Do not add a progress indicator to an unstructured page or imply completion when stages can be
skipped. It must not be the only way to discover the next section.

### Required fallback
Keep headings and links visible with a static active marker. If progress math fails, the list
remains navigable and truthful.

### Responsive and input behavior
Collapse a horizontal track into a vertical list or compact current-stage label on narrow screens.
Keyboard and touch can navigate stages directly; the indicator must not trap scroll or focus.

### Lifecycle and performance downgrade
Observe stage boundaries rather than polling the document, and pause updates when hidden. Use a
static marker when scroll work competes with input latency.

### Verification
Test skipped stages, reverse traversal, deep links, keyboard navigation, reduced motion, narrow
layout, and empty or error stages. Confirm the active label matches the visible section.

### Failure Modes
Failures include a bar that claims pixel progress rather than content, a dead stage link, and a
mobile track that overflows. Make stage state explicit and keep the list primary.

## MOT-06 — Reversible visual sequence

### Purpose
Sequence visual states so a story can advance and reverse without hiding the underlying content.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a reversible sequence when continuous progress between two meaningful visual states explains
change better than a discrete swap. The trigger is a bounded comparison or transformation.

### Mechanism
Normalize input progress, choose a renderer suited to the asset, and map progress monotonically to
the sequence. Preload the first usable state and keep the semantic caption outside the renderer.

### Anti-use
Do not scrub a decorative loop, an unbounded scene, or a state with no useful midpoint. The sequence
must never be load-bearing for a product explanation.

### Required fallback
Show a stable representative state plus a textual explanation when assets fail or capability is
missing. Reduced motion selects a settled state rather than a half-loaded frame.

### Responsive and input behavior
Use fewer states on narrow devices while preserving beginning/end meaning. Touch scroll remains
native; coalesce seeks and ignore stale requests after resize or route change.

### Lifecycle and performance downgrade
Load only the active sequence, pause offscreen, cap decoded memory, and release buffers on unmount.
Downgrade frame density before sacrificing the static state or causing scroll jank.

### Verification
Check forward, reverse, jump, fast scroll, reload, load failure, reduced motion, and cleanup/remount.
Evidence must show progress reaches both endpoints at target widths.

### Failure Modes
Watch for unpredictable reversal, blank gaps while seeking, and media buffers leaking across routes.
Treat poster and final state as first-class content.

## STR-01 — Persistent world

### Purpose
Keep a visual world or framing device continuous while the document changes chapters around it.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a persistent world when several chapters describe one place or system and continuity improves
understanding. The trigger is shared spatial context, not merely a wish for a 3D hero.

### Mechanism
Separate chapter content from durable scene state, with explicit ownership of camera, progress,
loading, and transitions. Every chapter remains intelligible as static content.

### Anti-use
Do not keep a heavy scene alive across unrelated pages or use a world to hide missing information.
Avoid continuity when each section has a different subject or a static document is sufficient.

### Required fallback
Provide semantic chapters with static illustrations or ordinary layout when the world cannot load.
Reduced motion settles the scene and exposes every chapter without camera travel.

### Responsive and input behavior
On narrow screens remove pinning or replace the world with a chapter list and focused stills. Touch
scroll and keyboard navigation own the page; pointer gestures are supplemental.

### Lifecycle and performance downgrade
Keep one scene owner, pause offscreen work, and dispose resources on route change. Lower detail,
update rate, and active objects before switching to the static chapter renderer.

### Verification
Check deep-link entry, forward/back navigation, capability-off, reduced motion, mobile de-pin,
scene remount, and evidence that text remains present outside the world.

### Failure Modes
Failure looks like a world resetting between chapters, a camera trapping scroll, or content hidden
behind loading. Record continuity state and make the document useful without it.

## STR-02 — Cinematic chapters

### Purpose
Divide a long narrative into named chapters with transitions that preserve orientation and recovery.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use cinematic chapters when a sequence of ideas benefits from directed pacing and clear scene
boundaries. The trigger is a narrative arc with deliberate transitions, not a generic long page.

### Mechanism
Define chapters with stable entry, focal subject, transition, and exit states. Coordinate motion
from one owner while each chapter's content and completion state remains independently readable.
Map exact progress into a normalized local 0..1 timeline per chapter so responsive chapter spans do
not change state semantics; damping may shape presentation only and never rewrite the authoritative progress.

### Anti-use
Do not pin every section, reverse the reader unexpectedly, or use spectacle to cover weak content.
Avoid it on short utility tasks where direct navigation is faster.

### Required fallback
Render chapters in normal document flow with headings, controls, and static media intact. Reduced
motion removes choreography while preserving order, emphasis, and chapter links.

### Responsive and input behavior
Shorten or unpin chapters on narrow screens and expose a visible index when pacing is removed. Touch,
keyboard, and assistive technology must not depend on a wheel gesture.

### Lifecycle and performance downgrade
Use one scroll coordinator, scope observers to active chapters, and release triggers on teardown.
Reduce simultaneous motion and scene complexity before reducing text or interaction affordances.

### Verification
Test entry at each chapter, reverse navigation, reduced motion, keyboard, touch, narrow viewport,
load failure, and cleanup. Confirm the final chapter is reachable without every transition.

### Failure Modes
Failures include a pinned section that never releases, a transition that skips content, and multiple
timelines competing for scroll. Prefer ordinary flow until the scene contract is proven.
