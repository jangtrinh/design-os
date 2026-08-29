import Foundation

enum DictionarySearchState: Equatable {
    case ready
    case loading(query: String)
    case results(query: String, entries: [DictionaryEntry])
    case emptyQuery
    case noResults(query: String)
    case offline(query: String)

    var query: String {
        switch self {
        case .ready, .emptyQuery:
            return ""
        case let .loading(query), let .results(query, _), let .noResults(query), let .offline(query):
            return query
        }
    }
}
