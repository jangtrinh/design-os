import Combine
import Foundation

@MainActor
final class DictionarySearchStore: ObservableObject {
    @Published private(set) var state: DictionarySearchState

    let initialQuery: String
    let initialDetailIdentifier: String?
    let isLaunchScenario: Bool
    let resetsRestoration: Bool

    private let completionDelayNanoseconds: UInt64
    private var searchGeneration = 0

    init(
        launchConfiguration: LaunchConfiguration = .current,
        completionDelayNanoseconds: UInt64 = 350_000_000
    ) {
        let visualState = launchConfiguration.visualState
        let query = launchConfiguration.query ?? visualState?.defaultQuery ?? ""

        initialQuery = query
        initialDetailIdentifier = visualState == .detail
            ? DictionaryEntry.localEntries.first(where: { $0.matches(query) })?.id ?? "keen"
            : nil
        isLaunchScenario = visualState != nil
        resetsRestoration = launchConfiguration.resetsRestoration
        self.completionDelayNanoseconds = completionDelayNanoseconds
        state = Self.initialState(for: visualState, query: query)
    }

    func updateDraftQuery(_ query: String) {
        guard query != state.query else { return }
        searchGeneration += 1
        state = .ready
    }

    func submit(query: String) {
        beginSearch(query: query)
        scheduleCompletion()
    }

    func retry() {
        let retryQuery = state.query.isEmpty ? initialQuery : state.query
        beginSearch(query: retryQuery)
        scheduleCompletion()
    }

    func restore(query: String) {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else { return }
        let matches = DictionaryEntry.localEntries.filter { $0.matches(trimmedQuery) }
        state = matches.isEmpty
            ? .noResults(query: trimmedQuery)
            : .results(query: trimmedQuery, entries: matches)
    }

    func beginSearch(query: String) {
        searchGeneration += 1
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        state = trimmedQuery.isEmpty ? .emptyQuery : .loading(query: trimmedQuery)
    }

    func finishSearch() {
        guard case let .loading(query) = state else { return }
        let matches = DictionaryEntry.localEntries.filter { $0.matches(query) }
        state = matches.isEmpty
            ? .noResults(query: query)
            : .results(query: query, entries: matches)
    }

    private func scheduleCompletion() {
        guard case .loading = state else { return }
        let generation = searchGeneration

        Task { [weak self] in
            try? await Task.sleep(nanoseconds: self?.completionDelayNanoseconds ?? 0)
            guard !Task.isCancelled, self?.searchGeneration == generation else { return }
            self?.finishSearch()
        }
    }

    private static func initialState(
        for visualState: LaunchVisualState?,
        query: String
    ) -> DictionarySearchState {
        switch visualState {
        case .loading:
            return .loading(query: query)
        case .results, .detail:
            let matches = DictionaryEntry.localEntries.filter { $0.matches(query) }
            return .results(query: query, entries: matches)
        case .empty:
            return .emptyQuery
        case .offline:
            return .offline(query: query)
        case .ready, .none:
            return .ready
        }
    }
}
