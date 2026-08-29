import SwiftUI

struct ChampionCatalogView: View {
    @Bindable var store: TocChienStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 10),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                HistoricalDataNotice(metadata: store.content.metadata)
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(store.filteredChampions) { champion in
                        NavigationLink(value: ChampionRoute.detail(id: champion.id)) {
                            ChampionCard(champion: champion)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("champion-card-\(champion.id)")
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .avoidingPersistentTabChrome(reservation: 24)
        .navigationTitle("Tướng")
        .navigationBarTitleDisplayMode(.inline)
        .stableNavigationChrome()
        .accessibilityIdentifier("screen-catalogue")
    }
}
