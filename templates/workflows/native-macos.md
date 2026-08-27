---
description: "Build a first-class native macOS surface through SwiftUI-first composition and provisional, evidence-bounded delivery. Use when the requested artifact is a native macOS application or workspace."
---

# Workflow: native macOS

`/ui:native-macos "<intent>"` produces a native macOS surface through its own execution arm. It is
available now, but its platform assurance is **PROVISIONAL**: it may route and produce work, yet it
MUST NOT be described as qualified platform delivery.

## 0. Activate the requested artifact surface

Write `capability-activation-request.json` matching
`schemas/capability-activation.schema.json`. Preserve the raw request, use
`requestedSurface: "native-macos"`, and quote the requested native artifact as
`selectionEvidence`.

```sh
ui knowledge activate capability-activation-request.json --json > capability-activation.json
```

Stop on a non-zero command result. Proceed only when the saved receipt has all of:

- `routingDisposition: "ROUTED"`;
- `assurance: "PROVISIONAL"`;
- `claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN"`;
- `requestedSurface: "native-macos"`;
- `route: "native-macos"`; and
- `artifact: "native-macos-application"`.

Do not substitute another route when this check fails. Preserve the receipt beside the work as the
machine-readable statement of what was authorized and what remains forbidden.

## 1. Establish the native contract before styling

Read `knowledge/native-macos-craft.md`, then read only the specific project and product evidence
needed for the request. State the target window roles, primary task, content hierarchy, loading,
empty, error, and keyboard paths before selecting visual treatment.

Start with SwiftUI semantic structure: navigation, toolbar placement, selection, input, labels,
and system accessibility. Use AppKit only for a documented SwiftUI ownership gap; record the gap,
why SwiftUI cannot own it, and the narrowest bridge. Never use AppKit to force a geometry model or
recreate system chrome.

## 2. Build with bounded native layout ownership

- Give every flexible branch a finite proposal derived from the current window space.
- Keep reading columns content-led, clamp remaining allocation at zero or above, and state the
  editor's usable minimum for compact windows.
- Assign scrolling to one owner. An editor inside an outer scroll container is a layout failure,
  because focus, cursor reachability, and error recovery become untestable.
- Fit metadata and notices declaratively; do not copy a pilot dimension or breakpoint into a new
  product.

Implement with the host's normal native project tools. The deterministic `ui` binary does not
generate Swift, automate macOS, alter permissions, sign, notarize, or publish an application.

## 3. Collect evidence without escalating the claim

Run the project's deterministic build and test commands. Then separate evidence by what it proves:

1. deterministic source, build, and test checks;
2. rendered native-window capture at the supported window states;
3. keyboard, focus, selection, and accessibility-tree observation;
4. independent craft review; and
5. owner-visible acceptance.

Each later witness answers a different question. A green build does not prove rendered behavior,
accessibility, review quality, or owner acceptance. Do not collapse these layers into a qualified
platform claim, and do not invent a native artifact validator in this workflow.

## 4. Deliver with the receipt's boundary intact

Report the routed native artifact as provisional. Keep the activation receipt and its forbidden
claim policy with the handoff. A later held-out qualification may change **assurance** only; it does
not remove availability, replace the route, or rewrite this workflow into a different arm.
