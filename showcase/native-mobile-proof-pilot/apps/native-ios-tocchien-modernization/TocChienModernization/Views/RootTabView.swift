import SwiftUI

struct RootTabView: View {
    @Bindable var store: TocChienStore

    var body: some View {
        TabView(selection: $store.selectedTab) {
            Tab("Tướng", systemImage: "person.3", value: TocChienTab.champions) {
                NavigationStack(path: $store.championPath) {
                    ChampionCatalogView(store: store)
                        .navigationDestination(for: ChampionRoute.self) { route in
                            if let champion = store.champion(for: route) {
                                ChampionDetailView(champion: champion, metadata: store.content.metadata)
                            } else {
                                ContentUnavailableView("Không tìm thấy tướng", systemImage: "questionmark.circle")
                            }
                        }
                }
            }
            Tab("Từ điển", systemImage: "magnifyingglass", value: TocChienTab.dictionary, role: .search) {
                NavigationStack {
                    GameDictionaryView(store: store)
                }
            }
        }
    }
}
