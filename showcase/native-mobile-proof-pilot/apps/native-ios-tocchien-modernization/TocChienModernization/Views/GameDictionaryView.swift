import SwiftUI

struct GameDictionaryView: View {
    @Bindable var store: TocChienStore

    var body: some View {
        List {
            Section {
                HistoricalDataNotice(metadata: store.content.metadata)
            }
            ForEach(store.filteredDictionary) { entry in
                VStack(alignment: .leading, spacing: 6) {
                    Text(entry.term)
                        .font(.headline)
                    Text(entry.definition)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                .padding(.vertical, 4)
                .accessibilityIdentifier("dictionary-row-\(entry.id)")
            }
        }
        .listStyle(.plain)
        .navigationTitle("Từ điển Tốc Chiến")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $store.dictionaryQuery, prompt: "Tìm thuật ngữ hoặc định nghĩa")
        .overlay {
            if store.filteredDictionary.isEmpty {
                ContentUnavailableView("Không có thuật ngữ phù hợp", systemImage: "magnifyingglass")
            }
        }
        .accessibilityIdentifier("screen-dictionary")
    }
}
