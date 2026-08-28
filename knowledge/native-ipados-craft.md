---
id: native-ipados-craft
description: "iPadOS SwiftUI craft for resizable windows, split navigation, mixed input, focus, scenes, and provisional evidence."
when: [native-ipados, ipad, swiftui, resizable-window, split-navigation, pointer, keyboard]
---

# Native iPadOS craft — resizable, multi-input workspaces

## Entry boundary

Use only after activation returns `requestedSurface: native-ipados`, route `native-ipados`, artifact
`native-ipados-application`, `PROVISIONAL`, and `QUALIFIED_DELIVERY_FORBIDDEN`. Read
`apple-swiftui-craft.md` first. Never infer iPadOS from regular width or substitute the iOS/web route.

## Design for a window, not a device screenshot

An iPad app can run full screen, beside another app, or in a resizable window. Treat width and height as
continuous inputs. Keep the primary task coherent when the window narrows, expands, changes orientation,
or returns from the background. Do not assume a large canvas is always present.

Use the larger display to elevate content, not to inflate empty space or permanently expose every
secondary action. Minimize modal detours where an in-context column or inspector better preserves the
workspace.

## Navigation and column behavior

Use `NavigationSplitView` for two- or three-column information architecture when the content warrants
it. Model selection explicitly and preserve it as columns collapse and expand. SwiftUI can collapse a
split view into a stack at narrow widths; size class is an environment signal, not device identity.

For every column define:

- its semantic role and empty selection state;
- minimum useful content, flexible preference, and overflow behavior;
- the preferred compact column and back-navigation result;
- selection restoration after scene or window changes.

Do not hard-code one sidebar width from a screenshot. Let content, locale, Dynamic Type, and the current
window proposal determine whether secondary detail stays visible.

## Mixed input and focus

Touch remains primary, while pointer and hardware keyboard are first-class iPadOS inputs. Standard
controls should keep their native hover, focus, selection, context menu, drag/drop, and command behavior.
Do not hide meaning behind hover.

Define keyboard commands for frequent, reversible workspace actions where useful. Preserve a visible,
logical focus order across sidebar, content, detail, toolbar, sheets, and inspectors. Full Keyboard
Access, pointer precision, and focus groups require live verification; compilation does not prove them.

Support Apple Pencil only when the product task benefits from precision, drawing, or handwriting. It is
an additional input path, not a replacement for touch or accessibility actions.

## Scenes and state

Decide whether multiple windows are part of the product contract. If they are, keep document, selection,
navigation, and presentation state scoped to the correct scene. Save recoverable context when the app
moves between active, background, and restored states.

Avoid process-wide singleton state that makes two windows overwrite each other's selection or route.
DESIGN:OS does not mandate an architecture framework; the app must make ownership explicit.

## Current evidence boundary

`native-ipados-pilot-01` retains the shared iOS gallery scheme built and launched on an iPad Pro 13-inch
simulator, logical tests, rendered iPad states, and a passing structural accessibility subset. It does
not represent a separate iPad binary target. The unfiltered Xcode 26.5 accessibility audit remains
failed. VoiceOver, Full Keyboard Access, hardware keyboard/pointer, resizable-window transitions,
real-device behavior, and owner-visible acceptance remain pending.

## iPadOS review checklist

- Full-screen and narrow/resizable window states preserve the primary task and recovery paths.
- Split-view selection, preferred compact column, and back navigation remain stable through collapse.
- Pointer, keyboard, touch, and accessibility actions reach the same essential outcomes.
- Focus and reading order stay coherent across columns, toolbars, sheets, and inspectors.
- Scene-scoped state does not leak between windows.
- Handoff names all live hardware, accessibility, and owner witnesses still pending.

## Sources

- [Apple HIG: Designing for iPadOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados)
- [Apple HIG: Multitasking](https://developer.apple.com/design/human-interface-guidelines/multitasking)
- [Apple HIG: Pointing devices](https://developer.apple.com/design/human-interface-guidelines/pointing-devices)
- [Apple: NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview)
