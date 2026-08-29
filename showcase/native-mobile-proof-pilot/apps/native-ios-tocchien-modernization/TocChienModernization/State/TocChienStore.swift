import Foundation
import Observation

enum TocChienTab: Hashable {
    case champions
    case dictionary
}

@MainActor
@Observable
final class TocChienStore {
    var selectedTab: TocChienTab = .champions
    var championPath: [ChampionRoute] = []
    var championQuery = ""
    var dictionaryQuery = ""
    private(set) var content: TocChienContent
    private(set) var contentError: String?

    init() {
        do {
            content = try LocalContentRepository.load()
            contentError = nil
        } catch {
            content = .empty
            contentError = error.localizedDescription
        }
    }

    init(content: TocChienContent) {
        self.content = content
        contentError = nil
    }

    var filteredChampions: [Champion] {
        content.champions.filter { matches(championQuery, values: [$0.legacyName, $0.role, $0.subtitle]) }
    }

    var filteredDictionary: [DictionaryEntry] {
        content.dictionary.filter { matches(dictionaryQuery, values: [$0.term, $0.definition]) }
    }

    func openChampion(id: String) {
        guard content.champions.contains(where: { $0.id == id }) else { return }
        championPath.append(.detail(id: id))
    }

    func champion(for route: ChampionRoute) -> Champion? {
        guard case let .detail(id) = route else { return nil }
        return content.champions.first(where: { $0.id == id })
    }

    private func matches(_ query: String, values: [String]) -> Bool {
        let needle = normalize(query)
        return needle.isEmpty || values.contains { normalize($0).contains(needle) }
    }

    private func normalize(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .lowercased()
            .replacingOccurrences(of: "đ", with: "d")
    }
}
