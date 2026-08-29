import XCTest

@MainActor
final class TocChienLayoutUITests: XCTestCase {
    func testLargeDensityKeepsFourCatalogueCardsAndBoundedDetailHeroVisible() {
        let app = launch()
        let window = app.windows.firstMatch
        let firstCard = app.buttons["champion-card-blitzcrank"]
        for id in ["blitzcrank", "jinx", "lux", "miss-fortune"] {
            XCTAssertTrue(app.buttons["champion-card-\(id)"].isHittable)
        }
        XCTAssertLessThan(firstCard.frame.width, window.frame.width * 0.75)
        app.buttons["champion-card-miss-fortune"].tap()
        let hero = app.otherElements["champion-detail-hero"]
        XCTAssertLessThanOrEqual(hero.frame.height, app.windows.firstMatch.frame.height * 0.33)
        XCTAssertTrue(app.staticTexts["Chi tiết lịch sử"].isHittable)
        attach(app)
    }

    func testAccessibilityXXXLKeepsPrimaryContentReachable() {
        let app = launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        let window = app.windows.firstMatch
        let firstCard = app.buttons["champion-card-blitzcrank"]
        XCTAssertTrue(firstCard.isHittable)
        XCTAssertGreaterThanOrEqual(firstCard.frame.width, window.frame.width * 0.75)
        app.tabBars.buttons["Từ điển"].tap()
        XCTAssertTrue(app.searchFields.firstMatch.isHittable)
        attach(app)
    }

    private func launch(_ arguments: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-reset-state"] + arguments
        app.launch()
        return app
    }

    private func attach(_ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways
        add(attachment)
    }

}
