---
id: native-macos-craft
description: "SwiftUI-first advisory craft for bounded native macOS composition, evidence, and escalation."
when: [native-macos, swiftui, macos, desktop, composition, writing-column, finite-proposal]
---

# Native macOS craft — advisory composition and evidence

## Purpose

Guide a native macOS composition toward idiomatic SwiftUI structure and honest evidence without
claiming a delivery workflow or promoting one pilot into a platform default.

## Mental Model

A macOS screen is a set of native semantic roles receiving finite space, not a painted desktop
mockup. Establish the content hierarchy and the space each role may consume before adding any
surface treatment. This preserves focus, selection, keyboard behavior, accessibility, and window
adaptation that the platform already owns.

## When to Use / When NOT

**Use** this guidance for a SwiftUI-first native macOS surface after activation has refused a
native generation route and returned this advisory knowledge ID. Apply it to composition, bounded
editor allocation, native controls, and the evidence needed for a later held-out pilot.

**Do NOT** treat this file as a workflow, a template, an adapter, or permission to generate a
native application. Do NOT copy a pilot's dimensions, gaps, captures, or source into another
product: those values describe one evidence context and would turn a local observation into a
false Apple-wide rule.

## Content

### SwiftUI owns the normal surface

ALLOWED: start with SwiftUI semantic structure such as navigation, toolbar placement, text input,
selection, labels, and system-provided accessibility. Let native controls retain their normal
focus, selection, scrolling, keyboard, and accessibility behavior.

NOT ALLOWED: paint title bars, toolbars, search, selection rows, or other system chrome in order
to reproduce an appearance. Recreating ownership in custom drawing discards the platform behavior
that makes the interface recognizably macOS.

AppKit is an escalation boundary for a documented ownership gap that declarative SwiftUI cannot
express. It is not a general layout engine, a geometry-enforcement layer, or evidence that a
prototype measurement applies universally.

### Compose before styling

ALLOWED: decide the reading order, title and summary capacity, metadata behavior, error placement,
editor ownership, and compact fallback before choosing decorative treatment. Keep transient notice
content in a semantic container whose role is clear against the note canvas.

NOT ALLOWED: begin with cards, glass, shadow, or custom colors and then force content into them.
That reverses the dependency: decoration becomes a constraint that hides hierarchy and consumes
space needed by the writing task.

### Give flexible children a finite proposal

ALLOWED: use a finite detail allocation when a branch needs to divide remaining window space.
Subtract local insets from the available proposal, clamp the result at zero or above, give the
writing column a content-led maximum, and let the editor take the remaining finite height with its
own scroll behavior. Keep the editor's usable minimum explicit and verify the error branch stays
reachable at the supported compact window.

NOT ALLOWED: put the editor inside an outer scroll container or rely on an unbounded proposal.
An unbounded parent lets a text editor report its content height, so the window loses the one
scrolling owner and compact error states can grow past the visible surface.

ALLOWED: adapt native metadata and notice anatomy from available space using declarative fitting
or equivalent constraints. Preserve reading order and control access in every fitting candidate.

NOT ALLOWED: encode a magic width breakpoint or reuse a prototype's numeric values as a macOS
standard. A breakpoint that is not derived from the current content and proposal fails as soon as
localization, type size, window size, or toolbar context changes.

### Evidence has an order

Evidence progresses from deterministic source, test, and build checks; to live interaction and
accessibility observation; to a clean captured surface; to independent taste review; to the
owner-visible verdict. Each later layer answers a question the earlier layer cannot answer, so a
green build cannot substitute for accessibility, a capture cannot substitute for review, and a
review cannot substitute for the owner's decision.

The retained `native-macos-pilot-01` receipt records one accepted-with-reservation outcome. It
binds evidence identity only. Native macOS remains unqualified with no route until a distinct
held-out pilot has the required evidence and an explicit owner decision without that reservation.

## Failure Modes

- **Pilot values become defaults.** A copied measurement looks precise but is tied to a different
  hierarchy or window contract; derive the new allocation from the current finite proposal.
- **A visual shell replaces native behavior.** Custom chrome may look aligned in a capture while
  losing keyboard focus, selection, and accessibility semantics; preserve the native role instead.
- **The editor has two scrolling owners.** The cursor or error notice becomes unreachable in a
  compact window; keep scrolling with the editor inside the finite allocation.
- **A receipt is mistaken for qualification.** The record says retained evidence and a reserved
  verdict, not a delivery authorization; preserve the activation refusal and stop action.
