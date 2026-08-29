import Foundation

struct DictionaryEntry: Identifiable, Hashable, Sendable {
    let term: String
    let pronunciation: String
    let definition: String
    let example: String

    var id: String {
        normalized(term).replacingOccurrences(of: " ", with: "-")
    }

    func matches(_ query: String) -> Bool {
        let normalizedQuery = normalized(query)
        guard !normalizedQuery.isEmpty else { return true }

        return [term, pronunciation, definition, example]
            .map(normalized)
            .contains { $0.contains(normalizedQuery) }
    }

    static let localEntries = [
        DictionaryEntry(
            term: "chỉnh chu",
            pronunciation: "chinh chu",
            definition: "Carefully finished; attentive to every detail.",
            example: "Một sản phẩm chỉnh chu tạo cảm giác đáng tin cậy."
        ),
        DictionaryEntry(
            term: "keen",
            pronunciation: "kiːn",
            definition: "Highly perceptive or strongly interested.",
            example: "She has a keen eye for spacing and rhythm."
        ),
        DictionaryEntry(
            term: "moat",
            pronunciation: "məʊt",
            definition: "A durable advantage that is difficult to copy.",
            example: "Craft quality becomes the product moat."
        )
    ]

    private func normalized(_ value: String) -> String {
        value.folding(
            options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
    }
}
