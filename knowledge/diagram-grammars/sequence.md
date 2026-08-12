---
id: diagram-sequence
description: Native grammar for rendering sequence diagrams as accessible inline SVG — ordered participants, messages, replies, activations, and branch/loop frames over time.
when:
  - The brief describes named actors/participants exchanging messages or calls
  - The brief asks "who calls whom, in what order" or describes a request/response or handshake flow
  - The brief uses words like "sequence", "handshake", "request-response", "callback", "async job", "retries"
  - No stronger grammar (state machine for a single entity's states, flowchart for a decision tree) fits the described control flow better
---

# Sequence diagrams

Read `knowledge/diagram-craft.md` first — it owns selection process, the token system, the SVG accessibility baseline, and the metadata contract. This file only covers what's specific to sequence diagrams.

## Selection and decline

Select `diagram-sequence` when the brief is about **interaction over time between two or more named participants** and the point is ordering/causality of messages, not the internal states of one entity or a branching decision tree.

Decline when:
- There's only one participant, or no message exchange to order (→ flowchart, or no diagram)
- The brief describes states of a single entity transitioning on events (→ state diagram)
- Participant/message count blows the density budget even after splitting (see Density) — decline and say why rather than cramming

## Participant order

- Order left-to-right by first mention in the brief, unless the brief gives explicit spatial order (e.g., "client, gateway, service, database").
- Keep order stable across every message — never reorder mid-diagram to shorten an arrow.
- Keep natural pairs (e.g., client vs. server side) adjacent; put shared infrastructure between them.

## Time direction

Time runs strictly top to bottom. One row per message. Do not merge near-simultaneous messages onto one row — order them, and if the brief is ambiguous about which came first, pick the more likely order and flag the assumption in the critique.

## Messages and replies

- Draw each message as an arrow between two lifelines, y increasing downward.
- Label every arrow with the action, using the brief's own wording where possible.
- A reply is its own arrow pointing back to the caller — never collapse a call and its reply into one bidirectional arrow.

## Sync vs async

- Only distinguish sync/async if the brief actually states or implies it. If it's silent, draw every message the same way (solid line, filled arrowhead) — do not invent a convention.
- If the brief does distinguish it: solid line + filled head for sync calls, solid line + open head for async calls, dashed line for returns. State the convention once (legend or metadata), not per label.

## Branches, loops, conditions

- Represent a condition as a labeled frame spanning the participants involved; the condition text lives on the frame, not on the arrows inside it.
- Represent a loop the same way, labeled with the loop condition ("for each item", "until timeout").
- Do not nest frames more than two deep — split into separate diagrams instead of shrinking nested labels.

## Lifelines and activations

- Every participant gets one vertical lifeline spanning the diagram's full height.
- Activate a participant only while it's doing work in response to a received call; end the bar when it replies or hands off — never activate for the participant's entire lifetime.
- If the brief gives no basis for when work starts or ends, leave lifelines plain rather than guessing at activation spans.

## Connector and label rules

- Arrows connect lifeline to lifeline only, never to a label or empty space.
- Keep labels to a short verb phrase; put longer clarification in a caption, not wrapped on the arrow.
- Self-messages loop out and back to the same lifeline and are labeled like any other message.

## Density and split decisions

- Budget: ~6 participants and ~12 messages per diagram at standard width. Beyond that, split by phase ("setup" then "main flow") rather than shrinking type or letting arrows overlap.
- When splitting, keep participant order and tokens identical across the split diagrams so they read as one continuous story.
- If the brief can't split cleanly (e.g., one tangled retry loop touching every participant), decline and explain why instead of shipping an unreadable diagram.

## Tokens

Use the shared color/stroke/type-scale tokens from `knowledge/diagram-craft.md`. Sequence-specific additions:
- lifeline stroke is lighter weight than message-arrow stroke
- activation bars use the shared "active/working" fill, not a diagram-specific color
- branch/loop frame borders use the shared "grouping" stroke, dashed, distinct from message arrows

## Accessible inline SVG

- Render as inline `<svg>`, not `<img>`, so it's part of the DOM.
- `<title>` names the diagram; `<desc>` gives a one-sentence summary of the flow, start to end.
- Each arrow and its label share one `<g>` with an `aria-label` naming the message (e.g. "client requests token from auth service").
- DOM order must match visual time order (top-to-bottom, left-to-right) — never rely on CSS positioning alone for reading order.

## Metadata

Every rendered sequence diagram carries:
- `data-diagram-grammar="sequence"`
- `data-reading-order` — this diagram's position among the document's diagrams
- `data-focal-id` — id of the participant or message the surrounding prose is actually about, when the brief singles one out
- `data-source-kind="brief"`

## Critique

Before finalizing, check: does message order match causality in the brief, not just document order? Would a reader unfamiliar with the system understand every arrow's label on its own? Did sync/async marking or activation timing get invented rather than sourced from the brief? Flag any such assumption in the critique instead of silently guessing.

## Failure modes to avoid

- Turning the sequence into a flowchart by drawing decision diamonds instead of frames — keep the lifeline metaphor throughout.
- Arrows without a clear, single source and target lifeline.
- Activation bars on participants that never actually did work.
- Reordering participants mid-diagram to dodge arrow crossings — crossings are fine, broken causality is not.
- Borrowing a specific tool's icon set or chrome as "reference" — this grammar is native; copy no external prose or assets.
