import XCTest
@testable import TocChienDictionary

@MainActor
final class DictionarySearchStoreTests: XCTestCase {
    func testEmptySubmissionShowsGuidance() {
        let store = makeStore()

        store.beginSearch(query: "   ")

        XCTAssertEqual(store.state, .emptyQuery)
    }

    func testSearchFindsVietnameseEntryWithoutDiacritics() {
        let store = makeStore()

        store.beginSearch(query: "chinh chu")
        store.finishSearch()

        XCTAssertEqual(resultTerms(in: store.state), ["chỉnh chu"])
    }

    func testSearchFindsEnglishEntry() {
        let store = makeStore()

        store.beginSearch(query: "keen")
        store.finishSearch()

        XCTAssertEqual(resultTerms(in: store.state), ["keen"])
    }

    func testSearchShowsNoResultsForUnknownTerm() {
        let store = makeStore()

        store.beginSearch(query: "unfindable")
        store.finishSearch()

        XCTAssertEqual(store.state, .noResults(query: "unfindable"))
    }

    func testOfflineLaunchCanRetryIntoLocalResults() {
        let store = makeStore(arguments: ["-ui-state", "offline"])

        XCTAssertEqual(store.state, .offline(query: "keen"))
        store.beginSearch(query: "keen")
        store.finishSearch()

        XCTAssertEqual(resultTerms(in: store.state), ["keen"])
    }

    func testDetailLaunchRestoresTheKeenRoute() {
        let store = makeStore(arguments: ["-ui-state", "detail"])

        XCTAssertEqual(store.initialQuery, "keen")
        XCTAssertEqual(store.initialDetailIdentifier, "keen")
        XCTAssertEqual(resultTerms(in: store.state), ["keen"])
    }

    func testRestoreRebuildsTheSavedQueryResults() {
        let store = makeStore()

        store.restore(query: "moat")

        XCTAssertEqual(resultTerms(in: store.state), ["moat"])
    }

    private func makeStore(arguments: [String] = []) -> DictionarySearchStore {
        DictionarySearchStore(
            launchConfiguration: LaunchConfiguration(arguments: arguments),
            completionDelayNanoseconds: 0
        )
    }

    private func resultTerms(in state: DictionarySearchState) -> [String] {
        guard case let .results(_, entries) = state else { return [] }
        return entries.map(\.term)
    }
}
