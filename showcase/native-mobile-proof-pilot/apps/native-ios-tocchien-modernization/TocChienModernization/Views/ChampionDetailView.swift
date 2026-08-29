import SwiftUI

struct ChampionDetailView: View {
    let champion: Champion
    let metadata: ContentMetadata

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let asset = ChampionAsset(championID: champion.id) {
                    GeometryReader { geometry in
                        ZStack(alignment: .bottomLeading) {
                            Image(asset.thumbName)
                                .resizable()
                                .scaledToFill()
                                .frame(width: geometry.size.width, height: geometry.size.height)
                                .clipped()
                                .accessibilityHidden(true)
                            LinearGradient(
                                colors: [.black.opacity(0.06), .black.opacity(0.88)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            Image(asset.previewName)
                                .resizable()
                                .scaledToFit()
                                .frame(width: geometry.size.width * 0.58, height: geometry.size.height - 8)
                                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                                .accessibilityHidden(true)
                            Color.clear
                                .frame(width: geometry.size.width, height: geometry.size.height)
                                .accessibilityElement(children: .ignore)
                                .accessibilityIdentifier("champion-detail-hero")
                                .accessibilityLabel("Ảnh minh họa \(champion.legacyName)")
                            VStack(alignment: .leading, spacing: 2) {
                                Text(champion.legacyName)
                                    .font(.title2.weight(.bold))
                                    .foregroundStyle(.white)
                                    .accessibilityIdentifier("champion-name-\(champion.id)")
                                Text(champion.subtitle)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.86))
                            }
                            .padding(14)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 216)
                    .clipShape(.rect(cornerRadius: 18))
                }
                Text(champion.role + " · " + champion.damageType)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Divider()
                Text("Chi tiết lịch sử")
                    .font(.headline)
                Text(champion.summary)
                    .font(.callout)
                HistoricalDataNotice(metadata: metadata)
            }
            .padding(14)
        }
        .navigationTitle("Chi tiết tướng")
        .navigationBarTitleDisplayMode(.inline)
        .stableNavigationChrome()
        .toolbar(.hidden, for: .tabBar)
        .accessibilityIdentifier("screen-detail")
    }
}
