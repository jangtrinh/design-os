import XCTest

final class TocChienDictionaryUITests: XCTestCase {
    func testReadyLaunchExposesSearchField() {
        let app = launch()

        XCTAssertTrue(app.textFields["dictionary-search-field"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["dictionary-search-submit"].exists)
    }

    func testLoadingVisualStateIsAddressableByLaunchArgument() {
        let app = launch(["-ui-state", "loading"])

        XCTAssertTrue(app.staticTexts["Loading local definitions…"].waitForExistence(timeout: 2))
    }

    func testEmptyVisualStateIsAddressableByLaunchArgument() {
        let app = launch(["-ui-state", "empty"])

        XCTAssertTrue(app.staticTexts["Start with a word"].waitForExistence(timeout: 2))
    }

    func testOfflineRetryTransitionsToLocalResults() {
        let app = launch(["-ui-state", "offline"])
        let retry = app.buttons["dictionary-retry"]

        XCTAssertTrue(retry.waitForExistence(timeout: 2))
        retry.tap()

        XCTAssertTrue(result(named: "dictionary-result-keen", in: app).waitForExistence(timeout: 3))
    }

    func testResultDetailAndBackPreserveTheQuery() {
        let app = launch(["-ui-state", "results", "-ui-query", "keen"])
        let result = result(named: "dictionary-result-keen", in: app)

        XCTAssertTrue(result.waitForExistence(timeout: 2))
        result.tap()
        XCTAssertTrue(app.navigationBars["keen"].waitForExistence(timeout: 2))

        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertEqual(app.textFields["dictionary-search-field"].value as? String, "keen")
    }

    func testLargestDynamicTypeCanReachAndActivateRetry() {
        let app = launch([
            "-ui-state", "offline",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        let retry = app.buttons["dictionary-retry"]

        XCTAssertTrue(retry.waitForExistence(timeout: 2))
        for _ in 0..<3 {
            if retry.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(retry.isHittable, "Retry must be reachable at the largest Dynamic Type size.")

        let scrollSettled = expectation(description: "AX retry scroll animation settles")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            scrollSettled.fulfill()
        }
        wait(for: [scrollSettled], timeout: 1)
        XCTAssertTrue(retry.isHittable, "Retry must remain reachable after scroll settling.")

        let witness = XCTAttachment(screenshot: app.screenshot())
        witness.name = "native-ios-offline-ax-retry-hittable"
        witness.lifetime = .keepAlways
        add(witness)

        retry.tap()
        XCTAssertTrue(result(named: "dictionary-result-keen", in: app).waitForExistence(timeout: 3))
    }

    func testLandscapeKeepsSearchAndResultReachable() {
        let app = launch(["-ui-state", "results", "-ui-query", "moat"])
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }

        XCTAssertTrue(app.textFields["dictionary-search-field"].waitForExistence(timeout: 3))
        XCTAssertTrue(result(named: "dictionary-result-moat", in: app).exists)
    }

    private func launch(_ arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-reset-state"] + arguments
        app.launch()
        return app
    }

    private func result(named identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier]
    }
}
