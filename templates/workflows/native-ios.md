---
description: "Build a first-class native iOS app through compact-first SwiftUI composition and provisional, evidence-bounded delivery. Use when the requested artifact is an iPhone or iOS application."
---

# Workflow: native iOS

`/ui:native-ios "<intent>"` produces a native iOS application through its own execution arm. The
route is available with **PROVISIONAL** assurance; it must not be described as qualified platform
delivery.

## 0. Activate the exact artifact surface

Write `capability-activation-request.json` against `schemas/capability-activation.schema.json`. Preserve
the raw request, set `requestedSurface: "native-ios"`, and quote the requested iOS artifact as selection
evidence.

```sh
ui knowledge activate capability-activation-request.json --json > capability-activation.json
```

Stop on non-zero. Proceed only when the receipt has every value below:

- `routingDisposition: "ROUTED"`;
- `assurance: "PROVISIONAL"`;
- `claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN"`;
- `requestedSurface: "native-ios"`;
- `route: "native-ios"`; and
- `artifact: "native-ios-application"`.

Do not substitute iPadOS or web. Preserve the receipt beside the work.

## 1. Establish the app contract

Read `knowledge/apple-swiftui-craft.md` and `knowledge/native-ios-craft.md`. Define the primary task,
content hierarchy, navigation ownership, loading/empty/error/recovery states, editable focus flow, and
supported orientation before styling.

Use SwiftUI semantic controls and app-owned route/state data. Escalate to UIKit only for a documented
SwiftUI capability gap, with the smallest bridge and explicit accessibility ownership.

## 2. Build compact-first, not screenshot-first

Use container proposals, safe areas, content, locale, Dynamic Type, and software-keyboard state. Keep
one scroll owner per interaction path. Verify primary actions and errors remain reachable at compact
height, landscape, and accessibility text sizes. Do not copy macOS measurements or device-model
breakpoints.

The deterministic `ui` binary does not generate Swift, control simulators, alter permissions, sign,
publish, or judge visual quality.

## 3. Preserve evidence tiers

Collect deterministic build/test, rendered simulator/device states, structural accessibility, live
VoiceOver/Switch Control where authorized, independent review, and owner acceptance separately.
`manualWitnesses` are requirements, not pass signals. Report the route as provisional and keep
`QUALIFIED_DELIVERY_FORBIDDEN` until a separate qualification decision changes assurance.
