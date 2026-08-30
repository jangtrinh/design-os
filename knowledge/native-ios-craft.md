---
id: native-ios-craft
description: "iPhone-focused SwiftUI craft for compact composition, touch, software-keyboard safety, navigation, and provisional evidence."
when: [native-ios, iphone, swiftui, compact, touch, software-keyboard]
---

# Native iOS craft — compact composition without device guessing

## Entry boundary

Use only after activation returns `requestedSurface: native-ios`, route `native-ios`, artifact
`native-ios-application`, `PROVISIONAL`, and `QUALIFIED_DELIVERY_FORBIDDEN`. Read
`apple-swiftui-craft.md` first. Never substitute the iPadOS or web route.

## Compact-first composition

Prioritize one clear task and one readable hierarchy at a time. Compact-first does not mean one fixed
screen width: verify portrait, landscape, supported split presentations, accessibility text sizes,
safe-area changes, and keyboard-driven height loss.

Let proposals and content choose the layout. Avoid hard-coded screen bounds, model checks, or a
geometry reader used as a global layout engine. Preserve content state when a container adapts.

## Compact vertical budget and structural reflow

On iPhone, allocate the compact vertical budget after safe areas, navigation, persistent bottom chrome,
and any active keyboard reservation. Media may remain the dominant visual language without consuming
the opening surface: keep identity readable and the next meaningful section discoverable.

Collections and text-led lists should end the visible content region on complete rows or complete
content units. Keep those units clear of persistent chrome; a clipped next item is not a valid cue that
more content exists.

Accessibility-triggered reflow is structural, not a scaled-down copy of the default layout. When text
growth or reduced height makes the composition fail, change multi-column collections to one column,
stack side-by-side regions, rebalance media, and preserve semantic reading order. Do not recover space
by clipping primary content, shrinking text, or letting a hero dominate the task.

## Navigation and presentation

Use `NavigationStack` for hierarchical push navigation and value-based destinations. Use tabs only for
stable peer destinations, with a clear selected state and restored navigation per tab when the product
requires it. Keep route state as data owned by the app.

Use sheets, covers, confirmation dialogs, menus, and share surfaces according to task scope. A modal is
not a substitute for missing information architecture. Preserve the system dismissal and accessibility
behavior unless the task has a documented reason to constrain it.

## Touch, input, and the software keyboard

Touch is primary. Keep actions comfortably reachable, preserve system gesture expectations, and give
icon-only actions accessible names and 44 × 44 pt default hit regions.

When the software keyboard appears:

- keep the focused field and its validation/recovery path visible;
- define submit, next, previous, dismissal, and focus movement where the task needs them;
- avoid stacking an editor inside an outer scrolling owner;
- treat keyboard safe-area changes as layout input, not a one-off offset.

Support hardware keyboards where natural, but do not make keyboard shortcuts the only path. Verify
VoiceOver and Switch Control separately from touch success.

## Content and failure states

Write concise mobile labels without removing necessary meaning. Let primary content wrap before
compressing actions. Verify long localization, empty states, offline/error recovery, destructive
confirmation, loading cancellation, and interrupted edits.

## Current evidence boundary

`native-ios-pilot-01` retains strict iOS build-for-testing, iPhone 17 Pro simulator tests and launch,
rendered gallery evidence, and a passing structural accessibility subset. The unfiltered Xcode 26.5
accessibility audit remains failed. VoiceOver, real-device behavior, and owner-visible acceptance remain
pending, so this arm is not qualified.

## iOS review checklist

- Navigation history and selection survive rotation and state restoration requirements.
- Focused input, errors, and primary actions remain reachable above the software keyboard.
- Compact and accessibility layouts preserve reading order without clipping critical content.
- Touch targets, gestures, and destructive actions retain native feedback and alternatives.
- Handoff keeps simulator, accessibility, independent review, and owner evidence separate.

## Sources

- [Apple: Migrating to new navigation types](https://developer.apple.com/documentation/swiftui/migrating-to-new-navigation-types)
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
