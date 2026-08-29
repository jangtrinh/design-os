import XCTest

@MainActor
final class TocChienLayoutUITests: XCTestCase {
    func testLargeDensityKeepsFourCatalogueCardsAndBoundedDetailHeroVisible() {
        let app = launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryLarge"])
        let window = app.windows.firstMatch
        let firstCard = app.buttons["champion-card-blitzcrank"]
        for id in ["blitzcrank", "jinx", "lux", "miss-fortune"] {
            XCTAssertTrue(app.buttons["champion-card-\(id)"].isHittable)
        }
        XCTAssertLessThan(firstCard.frame.width, window.frame.width * 0.75)
        XCTAssertEqual(firstCard.frame.height, firstCard.frame.width, accuracy: 1)
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(app.buttons["champion-card-ziggs"].isHittable)
        XCTAssertLessThanOrEqual(
            app.buttons["champion-card-ziggs"].frame.maxY,
            tabBar.frame.minY - 8
        )
        app.buttons["champion-card-miss-fortune"].tap()
        let hero = app.otherElements["champion-detail-hero"]
        XCTAssertLessThanOrEqual(hero.frame.height, app.windows.firstMatch.frame.height * 0.27)
        XCTAssertTrue(app.staticTexts["Chi tiết lịch sử"].isHittable)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.buttons["Từ điển"].tap()
        let searchField = app.searchFields.firstMatch
        let abilityPower = dictionaryRow("AP (Ability Power)", in: app)
        XCTAssertTrue(searchField.isHittable)
        XCTAssertTrue(abilityPower.exists)
        XCTAssertFalse(abilityPower.frame.intersects(searchField.frame))
        XCTAssertLessThanOrEqual(abilityPower.frame.maxY, searchField.frame.minY)
        let areaOfEffect = app.staticTexts["Chiêu thức diện rộng, khả năng đánh lan."]
        XCTAssertTrue(areaOfEffect.isHittable)
        XCTAssertLessThanOrEqual(areaOfEffect.frame.maxY, searchField.frame.minY)
        attach(app)
    }

    func testAccessibilityXXXLKeepsPrimaryContentReachable() {
        let app = launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        let window = app.windows.firstMatch
        let firstCard = app.buttons["champion-card-blitzcrank"]
        let notice = app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", "historical-data-notice"))
            .firstMatch
        XCTAssertEqual(
            notice.label,
            "Dữ liệu lịch sử. Dữ liệu lịch sử từ bản hướng dẫn Tốc Chiến (2021), không phải dữ liệu trực tiếp."
        )
        XCTAssertGreaterThanOrEqual(firstCard.frame.width, window.frame.width * 0.75)
        let tabBar = app.tabBars.firstMatch
        let catalogue = app.scrollViews["screen-catalogue"]
        XCTAssertTrue(catalogue.exists)
        scrollUntilFullyVisible(firstCard, in: catalogue, above: tabBar)
        firstCard.tap()
        XCTAssertFalse(tabBar.exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        scrollUntilFullyVisible(
            app.buttons["champion-card-ziggs"],
            in: catalogue,
            above: tabBar,
            maximumSwipes: 8
        )
        app.tabBars.buttons["Từ điển"].tap()
        let dictionary = app.collectionViews.firstMatch
        XCTAssertTrue(dictionary.exists)
        let searchField = app.searchFields.firstMatch
        let aceTerm = app.staticTexts["ACE"]
        let aceDefinition = app.staticTexts["có ý nghĩa là Quét Sạch."]
        XCTAssertTrue(searchField.isHittable)
        scrollUntilFullyVisible([aceTerm, aceDefinition], in: dictionary, above: searchField)
        attach(app)
        scrollUntilReachable(app.staticTexts["Wild Cores"], in: dictionary, above: searchField)
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

    private func dictionaryRow(_ term: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "identifier == %@", "dictionary-row-\(term)"))
            .firstMatch
    }

    private func scrollUntilFullyVisible(
        _ element: XCUIElement,
        in scrollContainer: XCUIElement,
        above persistentChrome: XCUIElement,
        gap: CGFloat = 8,
        maximumSwipes: Int = 4
    ) {
        scrollUntilFullyVisible([element], in: scrollContainer, above: persistentChrome, gap: gap, maximumSwipes: maximumSwipes)
    }

    private func scrollUntilFullyVisible(
        _ elements: [XCUIElement],
        in scrollContainer: XCUIElement,
        above persistentChrome: XCUIElement,
        gap: CGFloat = 8,
        maximumSwipes: Int = 4
    ) {
        for attempt in 0...maximumSwipes {
            if elements.allSatisfy({ isFullyVisible($0, in: scrollContainer, above: persistentChrome, gap: gap) }) {
                return
            }
            guard attempt < maximumSwipes else { break }
            let start = scrollContainer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.68))
            let end = scrollContainer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42))
            start.press(forDuration: 0.05, thenDragTo: end)
        }
        XCTFail("Content did not become fully visible above persistent chrome after \(maximumSwipes) swipes")
    }

    private func isFullyVisible(
        _ element: XCUIElement,
        in scrollContainer: XCUIElement,
        above persistentChrome: XCUIElement,
        gap: CGFloat
    ) -> Bool {
        element.exists
            && element.isHittable
            && element.frame.minY >= scrollContainer.frame.minY
            && element.frame.maxY <= persistentChrome.frame.minY - gap
    }

    private func scrollUntilReachable(
        _ element: XCUIElement,
        in scrollContainer: XCUIElement,
        above persistentChrome: XCUIElement,
        maximumSwipes: Int = 24
    ) {
        for attempt in 0...maximumSwipes {
            if element.exists && element.isHittable && !element.frame.intersects(persistentChrome.frame) {
                return
            }
            guard attempt < maximumSwipes else { break }
            scrollContainer.swipeUp(velocity: .fast)
        }
        XCTFail("Final content did not become reachable after \(maximumSwipes) swipes")
    }

}
