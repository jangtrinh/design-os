import SwiftUI

struct ChampionCard: View {
    let champion: Champion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let asset = ChampionAsset(championID: champion.id)
        GeometryReader { geometry in
            ZStack(alignment: .bottomLeading) {
                if let asset {
                    Image(asset.thumbName)
                        .resizable()
                        .scaledToFill()
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .clipped()
                        .accessibilityHidden(true)
                }
                LinearGradient(
                    colors: [.clear, .black.opacity(0.82)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                VStack(alignment: .leading, spacing: 2) {
                    Text(champion.legacyName)
                        .font(.headline)
                        .foregroundStyle(.white)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
                    Text(champion.role)
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .fixedSize(horizontal: false, vertical: dynamicTypeSize.isAccessibilitySize)
                }
                .padding(12)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .clipShape(.rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(.white.opacity(0.12), lineWidth: 0.5)
        }
        .contentShape(.rect)
    }
}
