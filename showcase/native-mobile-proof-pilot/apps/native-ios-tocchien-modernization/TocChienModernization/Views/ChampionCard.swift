import SwiftUI

struct ChampionCard: View {
    let champion: Champion

    var body: some View {
        let asset = ChampionAsset(championID: champion.id)
        VStack(alignment: .leading, spacing: 8) {
            if let asset {
                Image(asset.thumbName)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 82)
                    .clipShape(.rect(cornerRadius: 12))
                    .accessibilityHidden(true)
            }
            Text(champion.legacyName)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(1)
            Text(champion.role)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 142, alignment: .topLeading)
        .padding(12)
        .background(.quaternary, in: .rect(cornerRadius: 16))
        .contentShape(.rect)
    }
}
