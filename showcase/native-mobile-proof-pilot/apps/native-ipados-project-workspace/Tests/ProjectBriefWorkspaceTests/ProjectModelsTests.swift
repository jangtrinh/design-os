import XCTest
@testable import ProjectBriefWorkspace

final class ProjectModelsTests: XCTestCase {
    func testFilteringMatchesSanitizedLocalContentCaseInsensitively() {
        XCTAssertEqual(ProjectCatalog.filtered(BriefProject.sample, searchText: "native").map(\.id), ["design-os-mobile"])
        XCTAssertEqual(ProjectCatalog.filtered(BriefProject.sample, searchText: "JANG").map(\.id), [BriefProject.commonplaceID])
    }

    func testFilteringWithBlankSearchPreservesAllProjectsInOrder() {
        XCTAssertEqual(ProjectCatalog.filtered(BriefProject.sample, searchText: "  ").map(\.name), ["Commonplace", "DESIGN:OS Mobile", "OmniAct"])
    }

    func testLaunchConfigurationRecognizesEachVisualState() {
        for state in WorkspaceVisualState.allCases {
            let configuration = WorkspaceLaunchConfiguration.parse(arguments: ["App", "-ui-testing-state", state.rawValue])
            XCTAssertEqual(configuration.visualState, state)
        }
    }

    func testLaunchConfigurationFallsBackToReadyForUnknownState() {
        let configuration = WorkspaceLaunchConfiguration.parse(arguments: ["App", "-ui-testing-state", "unexpected"])
        XCTAssertEqual(configuration.visualState, .ready)
    }

    func testLaunchConfigurationEnablesExplicitSceneStateReset() {
        let configuration = WorkspaceLaunchConfiguration.parse(
            arguments: ["App", "-ui-testing-reset-scene-state"]
        )
        XCTAssertTrue(configuration.resetsSceneState)
        XCTAssertEqual(configuration.visualState, .ready)
    }

    func testPrunedSceneSelectionsRetainsOnlyConnectedSessions() {
        let liveSessionID = "live-session"
        let selections = [
            liveSessionID: "OmniAct",
            "closed-session": "DESIGN:OS Mobile"
        ]

        XCTAssertEqual(
            WorkspaceSceneRegistry.prunedSelections(
                selections,
                keepingSessionIDs: [liveSessionID]
            ),
            [liveSessionID: "OmniAct"]
        )
    }

    func testStatusCycleIsReversibleAndDeterministic() {
        XCTAssertEqual(ProjectStatus.inReview.next, .active)
        XCTAssertEqual(ProjectStatus.active.next, .draft)
        XCTAssertEqual(ProjectStatus.draft.next, .inReview)
    }
}
