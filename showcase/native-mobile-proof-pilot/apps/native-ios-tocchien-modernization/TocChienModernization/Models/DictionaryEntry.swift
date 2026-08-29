import Foundation

struct DictionaryEntry: Codable, Hashable, Identifiable {
    let term: String
    let definition: String

    var id: String { term }
}

struct ContentMetadata: Codable, Hashable {
    let historicalAsOf: String
    let historicalNotice: String
}
