import SwiftUI

struct GameDictionaryView: View {
    @Bindable var store: TocChienStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        List {
            Section {
                HistoricalDataNotice(metadata: store.content.metadata)
            }
            ForEach(store.filteredDictionary) { entry in
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.term)
                        .font(.subheadline.weight(.semibold))
                    Text(entry.definition)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
                        .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
                }
                .padding(.vertical, 2)
                .accessibilityIdentifier("dictionary-row-\(entry.id)")
            }
        }
        .listStyle(.plain)
        .avoidingPersistentTabChrome(reservation: 76)
        .navigationTitle("Từ điển Tốc Chiến")
        .navigationBarTitleDisplayMode(.inline)
        .stableNavigationChrome()
        .searchable(text: $store.dictionaryQuery, prompt: "Tìm thuật ngữ hoặc định nghĩa")
        .overlay {
            if store.filteredDictionary.isEmpty {
                ContentUnavailableView("Không có thuật ngữ phù hợp", systemImage: "magnifyingglass")
            }
        }
        .accessibilityIdentifier("screen-dictionary")
    }
}

private enum PersistentTabChromeAvoidance {
    static let reservation: CGFloat = 104
}

extension View {
    func avoidingPersistentTabChrome(reservation: CGFloat = PersistentTabChromeAvoidance.reservation) -> some View {
        safeAreaInset(edge: .bottom, spacing: 0) {
            Rectangle()
                .fill(.background)
                .frame(height: reservation)
                .accessibilityHidden(true)
                .allowsHitTesting(false)
        }
        .scrollEdgeEffectStyle(.hard, for: .bottom)
    }

    func stableNavigationChrome() -> some View {
        toolbarBackground(.background, for: .navigationBar)
            .toolbarBackgroundVisibility(.visible, for: .navigationBar)
    }
}
