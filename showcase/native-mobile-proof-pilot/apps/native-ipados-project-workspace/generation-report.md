# Native iPadOS generation report

- Generator ID: `terra-native-ipados-pilot-01`
- Artifact: Project Brief Workspace, native iPadOS SwiftUI application
- Route receipt: [`capability-activation.json`](capability-activation.json)
- Assurance: `PROVISIONAL`; `QUALIFIED_DELIVERY_FORBIDDEN`
- Source authority used: `knowledge/apple-swiftui-craft.md`, `knowledge/native-ipados-craft.md`, and `templates/workflows/native-ipados.md` after exact route activation.

## Route activation

```sh
node dist/cli.js knowledge activate showcase/native-mobile-proof-pilot/generator-packets/native-ipados-activation-request.json --dir . --json
```

Result: exit `0`; `routingDisposition: ROUTED`, `requestedSurface: native-ipados`,
`route: native-ipados`, and `artifact: native-ipados-application`. The exact JSON output is retained in `capability-activation.json`.

## Generated workspace

- `project.yml` is the XcodeGen source of truth for iPad-only, iOS 17+ app and test targets. Its scene capability is the nested `UIApplicationSceneManifest` dictionary, not a root-level flag.
- `Sources/ProjectBriefWorkspace/` has eight Swift files; largest is 191 lines.
- `Tests/ProjectBriefWorkspaceTests/ProjectModelsTests.swift` has 7 deterministic unit tests.
- `Tests/ProjectBriefWorkspaceUITests/ProjectBriefWorkspaceUITests.swift` has 5 UI tests covering `searching` selection/detail consistency and duplicate-title absence, `empty` recovery, `offline` recovery, responsive orientation preservation, and the native second-window path. Every UI launch uses an explicit test-only scene-storage reset before its requested visual state is applied.
- `.gitignore` excludes generated `ProjectBriefWorkspace.xcodeproj/`, `build/`, and `DerivedData/`. The XcodeGen-produced `Info.plist` is retained as an exact build input; the generated project remains ignored.

Implemented product paths: local sanitized brief search, list selection and detail, status changes, empty and offline recovery, adaptive `NavigationSplitView` collapse/expansion without selection mutation, independent `WindowGroup` scenes with `@SceneStorage`, keyboard shortcuts, an explicit `@FocusState` native focus ring, pointer hover plus non-hover context actions, semantic controls/colors, 44-point minimum action targets, Dynamic Type-capable text, and Reduce Motion/Transparency branches.

## Compile and test evidence

Exact verification command:

```sh
cd /Users/jang/orca/workspaces/ease-design/native-mobile-proof-pilot && xcodegen generate --spec showcase/native-mobile-proof-pilot/apps/native-ipados-project-workspace/project.yml --project showcase/native-mobile-proof-pilot/apps/native-ipados-project-workspace && xcodebuild -project showcase/native-mobile-proof-pilot/apps/native-ipados-project-workspace/ProjectBriefWorkspace.xcodeproj -scheme ProjectBriefWorkspace -destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M5),OS=26.5' test CODE_SIGNING_ALLOWED=NO
```

First compile result: exit `65`. XcodeGen generated the project; Swift compilation failed in `ProjectModels.swift` because `[String]` has no `localizedCaseInsensitiveContains` member. The downstream unit-test module import consequently could not resolve. No tests ran.

Prior complete compile result: exit `0`; the post-screenshot-repair exact command regenerated `ProjectBriefWorkspace.xcodeproj`, pinned destination was `iPad Pro 13-inch (M5), OS=26.5`, and `** TEST SUCCEEDED **`.

The first manifest-focused curation rerun proved two windows but exited `65` because the row query was ambiguous across them. The test was repaired to locate the initially-Commonplace window and tap its own DESIGN:OS Mobile row. A subsequent full rerun exited `65` with 9/10 tests because persisted `@SceneStorage` from the preceding empty-state launch left the offline scene filtered after retry. The app/test harness was repaired with the explicit `-ui-testing-reset-scene-state` launch contract; the empty → offline replay passed before the final gate.

Final compile result: exit `0`; after the explicit `WorkspaceWindow.Value` Codable and stale-scene pruning repairs, the exact command regenerated `ProjectBriefWorkspace.xcodeproj`, compiled all targets, and reported `** TEST SUCCEEDED **` on `iPad Pro 13-inch (M5), iOS 26.5`.

| Target | Tests | Result |
|---|---:|---|
| `ProjectBriefWorkspaceTests` | 7 | passed, 0 failures |
| `ProjectBriefWorkspaceUITests` | 5 | passed, 0 failures |
| Total | 12 | passed, 0 failures |

Final result bundle: `/Users/jang/Library/Developer/Xcode/DerivedData/ProjectBriefWorkspace-ffhrxvigyockjzeslsfdztzkqeij/Logs/Test/Test-ProjectBriefWorkspace-2026.08.29_13-17-31-+0700.xcresult`.

Built plist proof after the final generation:

```sh
/usr/libexec/PlistBuddy -c 'Print :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes' /Users/jang/Library/Developer/Xcode/DerivedData/ProjectBriefWorkspace-ffhrxvigyockjzeslsfdztzkqeij/Build/Products/Debug-iphonesimulator/ProjectBriefWorkspace.app/Info.plist
```

Result: `true`. A separate `Print :UIApplicationSupportsMultipleScenes` check failed as required, proving no root-level duplicate remains.

Final warning check: a subsequent `xcodebuild ... build CODE_SIGNING_ALLOWED=NO` exited `0` with no output matching either `ProjectBriefWorkspaceApp.swift:.*warning` or `will not be decoded`.

## Curation round 1: Tier 3 scene and responsive evidence

The curation blockers were addressed with real app interactions rather than launch-state banners.

- The orientation test selects OmniAct, rotates the live simulator portrait → landscape → portrait, asserts the detail still names OmniAct after each transition, and retains `selection-preserved-through-responsive-transition` as an `XCTAttachment` with `.keepAlways`.
- The app uses a primary `WindowGroup` plus a distinct value-typed independent `WindowGroup`; `openWindow(id:value:)` receives a unique Codable/Hashable value. The corrected XcodeGen manifest places `UIApplicationSupportsMultipleScenes` under `UIApplicationSceneManifest`, which the final built plist verifies as `true`.
- `WorkspaceSceneRegistry` uses only public `UIApplication.shared.connectedScenes` and each session's `persistentIdentifier` for the connected-scene diagnostic. A UIKit bridge binds each logical SwiftUI workspace to that public session ID; selections are keyed by session ID and pruned whenever the observed connected-session set changes.
- The second-window test selects OmniAct in the primary window, taps the real `open-second-window` control, waits for `Connected scenes: 2`, locates the newly opened Commonplace window through `app.windows`, taps its DESIGN:OS Mobile row, then confirms that window is DESIGN:OS Mobile while its sibling remains OmniAct. It retains `second-independent-scene-proven` with `.keepAlways` only after those assertions pass.
- The final result bundle contains both stable attachment titles: `second-independent-scene-proven` and `selection-preserved-through-responsive-transition`. Tier 3 is passed only for two connected simulator scenes, distinct scene-scoped selection, and responsive orientation preservation.

## Controller-captured runtime repair

The generator inspected only the allowed controller-captured screenshot `native-ipados-ipad-mini-searching-light.png`.

- Removed the automatic detail navigation title, retaining the custom semantic project header as the single visible project title.
- Reconciled the selected project whenever local search changes, so the visible filtered list and detail selection agree; a no-match search presents no stale detail.
- Shortened the Searching state-card copy to `Showing local results.` so it remains compact in a narrow iPad portrait sidebar.
- Preserved the existing accessibility and adaptive contracts, and replaced the duration-based state-change animation with semantic `.snappy`, still bypassed by Reduce Motion.
- Static SwiftUI self-check found no critical or high-risk pattern; the only animation call is the Reduce Motion-guarded `.snappy` transition.

## Same-run repair attempts

1. Fixed the local search predicate to test each sanitized string, not the enclosing array.
2. Removed a spaced `PRODUCT_NAME` that changed the app module name and broke `@testable import ProjectBriefWorkspace`.
3. Removed stale explicit `TEST_HOST` and `BUNDLE_LOADER` values so XcodeGen derives the app test host.
4. Replaced unsupported optional `@SceneStorage` selection with persisted non-optional storage plus an optional list-selection binding projection.
5. Repaired UI-test queries after the first runtime pass: use accessible descendant identifiers and labels instead of assuming SwiftUI container element types.
6. A subsequent UI runner timed out loading Accessibility before any test when the pinned iPad simulator was shut down. Booted `128BCB39-C380-4C13-AD6C-E033AB5DF4C2` and waited for `simctl bootstatus`; no app source changed for this environment repair.
7. Repaired three remaining UI assertions after SwiftUI propagated a `ContentUnavailableView` identifier to its child controls and did not surface a toolbar identifier as expected. The test run passed all 10 tests.
8. Added explicit `@FocusState` handling and a native focus-ring overlay to make keyboard focus visible on project rows, then reran the full pinned gate. It passed all 10 tests.
9. Repaired controller-captured narrow-iPad search behavior: removed duplicate title hierarchy, reconciled filtered selection, compacted Searching copy, and added UI coverage. The first exact post-repair run compiled but exited `65` because the new test queried two accessible `detail-title` elements (combined header and child).
10. Narrowed that assertion to the first matching semantic title. The next exact post-repair run exited `0` with all 10 tests passing.
11. Replaced the second-window visual-launch assertion with a test that taps `open-second-window`, added an explicit orientation-preservation assertion, and retained the responsive attachment. The orientation assertion passed.
12. Added a value-typed `WindowGroup`, scene-lifecycle registry, and semantic scene count so the test could prove a second native scene rather than infer it from a banner. The two-scene assertion still timed out in XCTest.
13. Added a root-level XcodeGen `UIApplicationSupportsMultipleScenes` property. It produced `true`, but UIKit still logged that the app did not support multiple scenes because the key was in the wrong plist location.
14. Split the default primary group from a dedicated independent value-typed group and reran the exact gate. The runtime app/test build succeeded, orientation proof passed, and the required independent-scene assertion continued to fail. It remains enabled as Tier 3 evidence.
15. Moved the property to `UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes`, regenerated, built, and verified the final app bundle with `PlistBuddy`: nested value `true`, root-level key absent.
16. Repaired the now-real two-window test by scoping the DESIGN:OS Mobile tap to the independent Commonplace window and asserting its sibling still selects OmniAct. The focused native scene test passed and retained its attachment.
17. Repaired suite launch isolation rather than weakening its offline assertion: the test-only reset flag clears persisted scene storage before a visual state is applied. The empty → offline replay passed, then the exact full gate passed 11/11.
18. Replaced `let id = UUID()` in `WorkspaceWindow.Value` with a stored `let id: UUID` and `init(id: UUID = UUID())`, so synthesized Codable decoding can restore the encoded ID. The final exact full gate passed 11/11 and the ProjectBriefWorkspaceApp Codable warning text was absent.
19. Added a pure `WorkspaceSceneRegistry.prunedSelections(_:keepingSessionIDs:)` operation and a RED/green XCTest: the initial passthrough implementation failed with the closed DESIGN:OS Mobile session retained (exit `65`, result `Test-ProjectBriefWorkspace-2026.08.29_13-15-52-+0700.xcresult`); filtering by observed IDs then passed (exit `0`, result `Test-ProjectBriefWorkspace-2026.08.29_13-17-07-+0700.xcresult`). Runtime wiring now maps each workspace to its public `UIWindowScene.session.persistentIdentifier`, removes closed selections on refresh or disappearance, and the final exact full gate passed 12/12.

One malformed intermediate XcodeGen `--project` path exited `1` before generation completed; it created no project output and changed no source. It was corrected before the next verification attempt.

## Scope and declaration

Only `showcase/native-mobile-proof-pilot/apps/native-ipados-project-workspace/**` was created or changed. The requested worktree `.project-agent.md` was absent; it was not created. Generated `.xcodeproj` files remain ignored, and `project.yml` remains the source of truth.

Declaration: **No controller edited Swift.** All Swift files listed above were generated and self-repaired solely by `terra-native-ipados-pilot-01` in the owned app directory.

## Known limitations

- This is deterministic source/build/test and simulator evidence only. It does not prove physical iPad behavior, VoiceOver, Full Keyboard Access, hardware keyboard/pointer, live resize transitions, background restoration across a real relaunch, independent craft review, or owner-visible acceptance.
- The controller-captured screenshot informed this repair, but the final gate remains automated simulator evidence rather than a new manual visual/assistive-technology witness.
- The iOS 26.5 simulator emitted environment warnings about duplicated accessibility loader classes and debugger-version snapshots; the final exact process still completed with exit `0` and 12/12 tests passed.
- Tier 3 proof is limited to two connected simulator scenes, distinct scene-scoped state, and responsive orientation. Stage Manager/live resize, hardware keyboard/pointer, Full Keyboard Access, VoiceOver, and physical-iPad proof remain Tier 5 and unclaimed.
- The activation receipt remains provisional. Do not represent this as qualified platform delivery.
