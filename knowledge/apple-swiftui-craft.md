---
id: apple-swiftui-craft
description: "Shared SwiftUI craft for native iOS and iPadOS composition, semantic controls, adaptive layout, accessibility, and honest evidence."
when: [swiftui, ios, ipados, native-mobile, adaptive-layout, accessibility]
---

# Apple SwiftUI craft — shared mobile foundation

## Purpose

Use this packet after capability activation routes to `native-ios` or `native-ipados`. It owns the
shared craft floor; the platform overlay owns the differences. A shared SDK does not make iPhone and
iPad one delivery surface.

Authority order:

1. current Apple documentation, HIG, and live system behavior;
2. the product's content and interaction contract;
3. DESIGN:OS tokens, registry, and retained evidence;
4. SwiftUI implementation detail.

Figma measurements are evidence for one composition, not universal platform constants.

## Semantic structure before styling

Start from content roles, state, and user actions. Use native `Button`, `List`, `Form`, `TextField`,
`Searchable`, navigation, presentation, menus, and share surfaces when they own the required behavior.
Do not wrap or redraw a system control merely to standardize appearance.

Keep app architecture app-owned. DESIGN:OS may define semantic tokens, component intent, recipes, and
evidence requirements; it must not force one state-management framework, dependency graph, or global
navigation singleton.

Use SwiftUI for normal surface structure. A UIKit bridge is allowed only when a documented platform
capability is unavailable in SwiftUI. Record the missing capability, the smallest bridge, state
ownership, accessibility ownership, and the condition for deleting the bridge.

## Layout is proposal-driven

- Derive composition from the container's available space, safe areas, content, locale, and Dynamic
  Type. Device-model checks and copied screenshot breakpoints are not layout systems.
- Prefer native adaptive containers. Use `AnyLayout` only when changing container type needs to
  preserve subview identity and state.
- Give flexible content a finite proposal. Avoid nested scrolling owners for the same interaction path.
- Keep important controls reachable when text grows, the keyboard appears, orientation changes, or an
  iPad window becomes narrow.
- Do not hide content solely because a horizontal size class is compact. Compact width can occur on
  both iPhone and iPad.

## Controls, content, and type

Apple lists **44 × 44 pt** as the default iOS/iPadOS control size. Spacing between controls matters as
much as the target itself. Preserve the system hit region even when a glyph appears smaller.

Use semantic text styles so Dynamic Type, Bold Text, locale, and accessibility sizes participate in
layout. Do not freeze text height, truncate primary actions without a recovery path, or use color as the
only carrier of state. Let content establish hierarchy before materials, shadows, and decoration.

Every async or editable surface defines loading, empty, error, recovery, disabled, and destructive
paths where applicable. Error placement must remain visible with the software keyboard and the largest
supported text sizes.

## Accessibility ownership

Native semantics are the baseline, not proof of completion. Preserve meaningful labels, values, hints,
traits, grouping, reading order, focus order, and alternatives for gesture-only actions. Respect Reduce
Motion, Reduce Transparency, Increased Contrast, Differentiate Without Color, and VoiceOver.

`manualWitnesses` names required evidence that remains outstanding; presence in an activation receipt
never means the witness passed. Accessibility Inspector/tree output supplements live assistive-
technology use. It does not replace VoiceOver, Switch Control, Full Keyboard Access, or device testing.

## Evidence ladder

Keep these tiers separate in every handoff:

1. deterministic source, schema, build, and test checks;
2. simulator/device runtime and rendered states;
3. structural accessibility inspection;
4. live assistive technology and relevant hardware input;
5. independent craft review;
6. owner-visible acceptance.

The current iOS and iPadOS arms are `PROVISIONAL`. Their retained pilots prove a route exists and ran
on pinned simulator targets. They do not prove the failed full accessibility audit is resolved, owner
acceptance, real-device behavior, or qualified delivery. Preserve `QUALIFIED_DELIVERY_FORBIDDEN`.

## Shared review checklist

- Exact capability receipt matches the requested platform and artifact.
- Native controls retain system behavior; custom drawing has an explicit product reason.
- Layout survives supported width, height, orientation, keyboard, locale, and Dynamic Type changes.
- One owner controls each scroll, selection, focus, navigation, and presentation state.
- Loading, empty, error, and recovery paths remain reachable.
- Deterministic, rendered, accessibility, reviewer, and owner evidence are reported independently.

## Sources

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Apple: NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview)
