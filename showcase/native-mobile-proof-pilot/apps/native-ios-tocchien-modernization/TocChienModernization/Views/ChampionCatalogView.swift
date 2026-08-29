import SwiftUI

struct ChampionCatalogView: View {
    @Bindable var store: TocChienStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 12),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HistoricalDataNotice(metadata: store.content.metadata)
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(store.filteredChampions) { champion in
                        NavigationLink(value: ChampionRoute.detail(id: champion.id)) {
                            ChampionCard(champion: champion)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("champion-card-\(champion.id)")
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .navigationTitle("Tướng")
        .accessibilityIdentifier("screen-catalogue")
    }
}
