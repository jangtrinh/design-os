---
description: "Build a first-class native iPadOS workspace through resizable SwiftUI composition, split navigation, mixed input, and provisional evidence. Use when the requested artifact is an iPad or iPadOS application."
---

# Workflow: native iPadOS

`/ui:native-ipados "<intent>"` produces a native iPadOS application through its own execution arm. The
route is available with **PROVISIONAL** assurance; it must not be described as qualified platform
delivery.

## 0. Activate the exact artifact surface

Write `capability-activation-request.json` against `schemas/capability-activation.schema.json`. Preserve
the raw request, set `requestedSurface: "native-ipados"`, and quote the requested iPadOS artifact as
selection evidence.

```sh
ui knowledge activate capability-activation-request.json --json > capability-activation.json
```

Stop on non-zero. Proceed only when the receipt has every value below:

- `routingDisposition: "ROUTED"`;
- `assurance: "PROVISIONAL"`;
- `claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN"`;
- `requestedSurface: "native-ipados"`;
- `route: "native-ipados"`; and
- `artifact: "native-ipados-application"`.

Do not substitute iOS or web. Preserve the receipt beside the work.

## 1. Establish the workspace contract

Read `knowledge/apple-swiftui-craft.md` and `knowledge/native-ipados-craft.md`. Define column roles,
selection, collapse/expansion, scene ownership, window restoration, loading/empty/error paths, and
touch/pointer/keyboard outcomes before styling.

Use SwiftUI semantic controls and app-owned route/state data. Escalate to UIKit only for a documented
SwiftUI capability gap, with the smallest bridge and explicit accessibility ownership.

## 2. Build for a continuously resizable window

Use current container proposals rather than an iPad screenshot or regular-width assumption.
`NavigationSplitView` selection must survive narrow collapse and expansion. Keep one scroll owner per
interaction path, stable focus across columns, and essential actions available to touch as well as
pointer/keyboard. Do not copy macOS measurements or require hover for meaning.

The deterministic `ui` binary does not generate Swift, control simulators, alter permissions, sign,
publish, or judge visual quality.

## 3. Preserve evidence tiers

Collect deterministic build/test, rendered full-screen and windowed states, structural accessibility,
live VoiceOver/Full Keyboard Access/pointer where authorized, independent review, and owner acceptance
separately. `manualWitnesses` are requirements, not pass signals. Report the route as provisional and
keep `QUALIFIED_DELIVERY_FORBIDDEN` until a separate qualification decision changes assurance.
