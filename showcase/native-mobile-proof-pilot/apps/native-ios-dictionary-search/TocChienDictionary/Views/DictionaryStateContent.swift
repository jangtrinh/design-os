import SwiftUI

struct DictionaryStateContent: View {
    let state: DictionarySearchState
    let onRetry: () -> Void

    var body: some View {
        Group {
            switch state {
            case .ready:
                ContentUnavailableView(
                    "Search the local dictionary",
                    systemImage: "text.magnifyingglass",
                    description: Text("Try a Vietnamese or English term such as chỉnh chu, keen, or moat.")
                )
            case .loading:
                VStack(spacing: 12) {
                    ProgressView()
                        .controlSize(.large)
                    Text("Loading local definitions…")
                        .font(.body)
                }
                .frame(maxWidth: .infinity, minHeight: 160)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Loading local definitions")
                .accessibilityIdentifier("dictionary-loading")
            case let .results(query, entries):
                results(query: query, entries: entries)
            case .emptyQuery:
                ContentUnavailableView(
                    "Start with a word",
                    systemImage: "character.cursor.ibeam",
                    description: Text("Enter a Vietnamese or English term before searching.")
                )
            case let .noResults(query):
                ContentUnavailableView(
                    "No local match for “\(query)”",
                    systemImage: "magnifyingglass",
                    description: Text("Check spelling or try another Vietnamese or English term.")
                )
            case .offline:
                offlineState
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func results(query: String, entries: [DictionaryEntry]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(query.isEmpty ? "Local entries" : "Matches for “\(query)”")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(entries) { entry in
                NavigationLink(value: entry.id) {
                    DictionaryResultRow(entry: entry)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(entry.term), \(entry.pronunciation)")
                .accessibilityHint("Opens the definition.")
                .accessibilityIdentifier("dictionary-result-\(entry.id)")
            }
        }
    }

    private var offlineState: some View {
        VStack(alignment: .leading, spacing: 16) {
            ContentUnavailableView(
                "Local lookup is unavailable",
                systemImage: "wifi.slash",
                description: Text("The dictionary could not load its local entries. Retry when ready.")
            )

            Button(action: onRetry) {
                Label("Retry local lookup", systemImage: "arrow.clockwise")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint("Attempts the local lookup again.")
            .accessibilityIdentifier("dictionary-retry")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
