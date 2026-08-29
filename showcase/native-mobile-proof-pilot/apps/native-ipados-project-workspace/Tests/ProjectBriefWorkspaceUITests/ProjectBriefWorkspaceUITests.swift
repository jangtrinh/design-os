import XCTest

final class ProjectBriefWorkspaceUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-ui-testing-reset-scene-state"]
    }

    func testSearchingVisualStateSelectsTheMatchingDetailWithoutDuplicateNavigationTitle() {
        app.launchArguments += ["-ui-testing-state", "searching"]
        app.launch()

        XCTAssertTrue(element("workspace-state").waitForExistence(timeout: 3))
        XCTAssertTrue(element("project-row-design-os-mobile").exists)
        XCTAssertTrue(element("detail-title").firstMatch.label.contains("DESIGN:OS Mobile"))
        XCTAssertFalse(app.navigationBars["Commonplace"].exists)
    }

    func testEmptyVisualStateCanRecoverByClearingSearch() {
        app.launchArguments += ["-ui-testing-state", "empty"]
        app.launch()

        XCTAssertTrue(element("empty-search").waitForExistence(timeout: 3))
        app.buttons["Clear search"].tap()
        XCTAssertTrue(element("project-row-commonplace").waitForExistence(timeout: 3))
    }

    func testOfflineVisualStateRecoversWithoutNetwork() {
        app.launchArguments += ["-ui-testing-state", "offline"]
        app.launch()

        XCTAssertTrue(element("retry-connection").waitForExistence(timeout: 3))
        element("retry-connection").tap()
        XCTAssertFalse(element("retry-connection").exists)
        XCTAssertTrue(element("project-row-commonplace").waitForExistence(timeout: 3))
    }

    func testOrientationTransitionPreservesSelectedDetail() {
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        app.launchArguments += ["-ui-testing-state", "selection"]
        app.launch()

        XCTAssertTrue(element("project-row-design-os-mobile").waitForExistence(timeout: 3))
        element("project-row-omniact").tap()
        XCTAssertTrue(detailTitleContains("OmniAct"))

        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(waitForLandscapeWindow())
        XCTAssertTrue(detailTitleContains("OmniAct"))

        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(waitForPortraitWindow())
        XCTAssertTrue(detailTitleContains("OmniAct"))
        attachScreenshot(named: "selection-preserved-through-responsive-transition")
    }

    func testOpeningSecondWindowCreatesIndependentSceneState() {
        app.launch()

        XCTAssertTrue(element("project-row-omniact").waitForExistence(timeout: 3))
        element("project-row-omniact").tap()
        XCTAssertTrue(detailTitleContains("OmniAct"))
        XCTAssertTrue(element("open-second-window").waitForExistence(timeout: 3))
        element("open-second-window").tap()

        XCTAssertTrue(waitForSceneValue(containing: "Connected scenes: 2"))
        XCTAssertTrue(waitForSceneValue(containing: "Selected brief: Commonplace"))
        XCTAssertTrue(waitUntil {
            self.window(withSceneValueContaining: "Selected brief: Commonplace") != nil
        })
        guard let independentWindow = window(withSceneValueContaining: "Selected brief: Commonplace") else {
            XCTFail("The independent window did not expose its initial selection")
            return
        }
        let independentDesignRow = independentWindow.descendants(matching: .any)["project-row-design-os-mobile"]
        XCTAssertTrue(independentDesignRow.waitForExistence(timeout: 3))
        independentDesignRow.tap()

        XCTAssertTrue(waitUntil {
            self.scene(in: independentWindow).valueDescription.contains("Selected brief: DESIGN:OS Mobile")
        })
        XCTAssertTrue(waitUntil {
            self.window(withSceneValueContaining: "Selected brief: OmniAct") != nil
        })
        XCTAssertTrue(waitForSceneValue(containing: "Connected scenes: 2"))
        XCTAssertTrue(waitForSceneValue(containing: "Scene selections:"))
        XCTAssertTrue(waitForSceneValue(containing: "OmniAct"))
        XCTAssertTrue(waitForSceneValue(containing: "DESIGN:OS Mobile"))
        attachScreenshot(named: "second-independent-scene-proven")
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }

    private func detailTitleContains(_ expectedTitle: String) -> Bool {
        element("detail-title").firstMatch.waitForExistence(timeout: 3)
            && element("detail-title").firstMatch.label.contains(expectedTitle)
    }

    private func waitForSceneValue(containing expectedValue: String) -> Bool {
        waitUntil {
            self.sceneValues().contains { $0.contains(expectedValue) }
        }
    }

    private func waitForLandscapeWindow() -> Bool {
        waitUntil {
            let frame = self.app.windows.firstMatch.frame
            return frame.width > frame.height
        }
    }

    private func waitForPortraitWindow() -> Bool {
        waitUntil {
            let frame = self.app.windows.firstMatch.frame
            return frame.height > frame.width
        }
    }

    private func waitUntil(
        timeout: TimeInterval = 5,
        condition: @escaping () -> Bool
    ) -> Bool {
        let expectation = expectation(for: NSPredicate(block: { _, _ in condition() }), evaluatedWith: nil)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }

    private func sceneValues() -> [String] {
        let scenes = app.otherElements.matching(identifier: "workspace-scene")
        return (0 ..< scenes.count).compactMap { scenes.element(boundBy: $0).value as? String }
    }

    private func scene(in window: XCUIElement) -> XCUIElement {
        window.descendants(matching: .any)["workspace-scene"]
    }

    private func window(withSceneValueContaining expectedValue: String) -> XCUIElement? {
        let windows = app.windows
        return (0 ..< windows.count)
            .map { windows.element(boundBy: $0) }
            .first { scene(in: $0).valueDescription.contains(expectedValue) }
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private extension XCUIElement {
    var valueDescription: String {
        value as? String ?? ""
    }
}
