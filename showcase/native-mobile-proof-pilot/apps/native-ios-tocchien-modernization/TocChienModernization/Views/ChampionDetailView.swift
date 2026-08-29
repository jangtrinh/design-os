import SwiftUI

struct ChampionDetailView: View {
    let champion: Champion
    let metadata: ContentMetadata

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let asset = ChampionAsset(championID: champion.id) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .fill(.quaternary)
                        Image(asset.previewName)
                            .resizable()
                            .scaledToFit()
                            .frame(height: 190)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 190)
                    .clipShape(.rect(cornerRadius: 20))
                    .accessibilityElement(children: .ignore)
                    .accessibilityIdentifier("champion-detail-hero")
                    .accessibilityLabel("Ảnh minh họa \(champion.legacyName)")
                }
                VStack(alignment: .leading, spacing: 8) {
                    Text(champion.legacyName)
                        .font(.largeTitle.weight(.bold))
                        .accessibilityIdentifier("champion-name-\(champion.id)")
                    Text(champion.subtitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.tint)
                    Text(champion.role + " · " + champion.damageType)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Divider()
                Text("Chi tiết lịch sử")
                    .font(.title3.weight(.semibold))
                Text(champion.summary)
                    .font(.body)
                HistoricalDataNotice(metadata: metadata)
            }
            .padding(16)
        }
        .navigationTitle("Chi tiết tướng")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen-detail")
    }
}
