import XCTest

@MainActor
final class TocChienBehaviorUITests: XCTestCase {
    private let championIDs = ["blitzcrank", "jinx", "lux", "miss-fortune", "zed", "ziggs"]

    func testExactlyTwoTabs() {
        let app = launch()
        XCTAssertEqual(app.tabBars.buttons.count, 2)
        XCTAssertTrue(app.tabBars.buttons["Tướng"].exists)
        XCTAssertTrue(app.tabBars.buttons["Từ điển"].exists)
    }

    func testCatalogueExposesTheSixAuthorizedChampions() {
        let app = launch()
        XCTAssertTrue(app.scrollViews["screen-catalogue"].waitForExistence(timeout: 2))
        for id in championIDs { XCTAssertTrue(app.buttons["champion-card-\(id)"].exists) }
    }

    func testEachChampionPushesTheMatchingDetailAndReturns() {
        let app = launch()
        for id in championIDs {
            app.buttons["champion-card-\(id)"].tap()
            XCTAssertTrue(app.scrollViews["screen-detail"].waitForExistence(timeout: 2))
            XCTAssertTrue(app.staticTexts[id].exists || app.staticTexts.matching(identifier: "champion-name-\(id)").firstMatch.exists)
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
    }

    func testDictionaryStartsWith24RowsAndOneNativeSearchSurface() {
        let app = launch(["-ui-screen", "dictionary"])
        XCTAssertEqual(app.searchFields.count, 1)
        XCTAssertLessThanOrEqual(historicalNotice(in: app).frame.minY, 160)
        for term in ["ACE", "AD (Attack Dame)", "ADC (Attack Dame Carry)", "AFK (Away From Keyboard)"] {
            XCTAssertTrue(dictionaryRow(term, in: app).isHittable)
        }
        XCTAssertEqual(allRowIDs(in: app).count, 24)
    }

    func testDictionarySearchFiltersAndRecoversFromNoResults() {
        let app = launch(["-ui-screen", "dictionary"])
        let field = app.searchFields.firstMatch
        field.tap()
        field.typeText("Snowball")
        XCTAssertEqual(visibleRowIDs(in: app).count, 1)
        field.tap()
        field.typeText("ZZZ")
        XCTAssertTrue(app.staticTexts["Không có thuật ngữ phù hợp"].exists)
        field.tap()
        app.buttons["Clear text"].tap()
        XCTAssertEqual(allRowIDs(in: app).count, 24)
    }

    func testHistoricalNoticeExistsOnAllThreeScreens() {
        let app = launch()
        XCTAssertEqual(historicalNoticeCount(in: app), 1)
        app.buttons["champion-card-miss-fortune"].tap()
        XCTAssertEqual(historicalNoticeCount(in: app), 1)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.buttons["Từ điển"].tap()
        XCTAssertEqual(historicalNoticeCount(in: app), 1)
    }

    private func launch(_ arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-reset-state"] + arguments
        app.launch()
        return app
    }

    private func rows(in app: XCUIApplication) -> XCUIElementQuery {
        app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "dictionary-row-"))
    }

    private func historicalNoticeCount(in app: XCUIApplication) -> Int {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", "historical-data-notice"))
            .count
    }

    private func historicalNotice(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", "historical-data-notice"))
            .firstMatch
    }

    private func dictionaryRow(_ term: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", "dictionary-row-\(term)"))
            .firstMatch
    }

    private func visibleRowIDs(in app: XCUIApplication) -> Set<String> {
        Set(rows(in: app).allElementsBoundByIndex.map(\.identifier).filter { !$0.isEmpty })
    }

    private func allRowIDs(in app: XCUIApplication) -> Set<String> {
        var identifiers = Set<String>()
        let list = app.collectionViews.firstMatch
        for _ in 0..<12 {
            identifiers.formUnion(visibleRowIDs(in: app))
            if identifiers.count == 24 { return identifiers }
            list.swipeUp()
        }
        return identifiers
    }
}
