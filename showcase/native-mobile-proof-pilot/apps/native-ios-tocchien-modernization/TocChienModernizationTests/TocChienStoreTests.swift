import Foundation
import Testing
@testable import TocChienModernization

struct TocChienStoreTests {
    @Test @MainActor func championFilteringIsCaseAndDiacriticInsensitive() throws {
        let store = TocChienStore(content: try content())
        store.championQuery = "do don"
        #expect(store.filteredChampions.map(\.id) == ["blitzcrank"])
    }

    @Test @MainActor func dictionaryFilteringMatchesTermsAndDefinitions() throws {
        let store = TocChienStore(content: try content())
        store.dictionaryQuery = "sat thuong"
        #expect(store.filteredDictionary.map(\.term) == ["ACE"])
    }

    @Test @MainActor func typedDetailRouteAdmitsOnlyKnownChampions() throws {
        let store = TocChienStore(content: try content())
        store.openChampion(id: "blitzcrank")
        #expect(store.championPath == [.detail(id: "blitzcrank")])
        store.openChampion(id: "unknown")
        #expect(store.championPath == [.detail(id: "blitzcrank")])
    }

    @Test @MainActor func sceneStoresKeepTabPathAndQueriesIndependent() throws {
        let first = TocChienStore(content: try content())
        let second = TocChienStore(content: try content())
        first.selectedTab = .dictionary
        first.dictionaryQuery = "ace"
        first.openChampion(id: "blitzcrank")
        #expect(second.selectedTab == .champions)
        #expect(second.dictionaryQuery.isEmpty)
        #expect(second.championPath.isEmpty)
    }

    private func content() throws -> TocChienContent {
        let champions = [Champion(id: "blitzcrank", legacyName: "BlitzCrank", role: "Đỡ đòn", difficulty: 1, damageType: "Magic", thumbAsset: "", previewAsset: "", subtitle: "", summary: "", historicalAsOf: "2021-05-04")]
        let dictionary = [DictionaryEntry(term: "ACE", definition: "Sát thương phép thuật")]
        return TocChienContent(champions: champions, dictionary: dictionary, metadata: ContentMetadata(historicalAsOf: "2021-05-04", historicalNotice: "Historical"))
    }
}
