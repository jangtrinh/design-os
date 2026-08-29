import Foundation

struct Champion: Codable, Hashable, Identifiable {
    let id: String
    let legacyName: String
    let role: String
    let difficulty: Int
    let damageType: String
    let thumbAsset: String
    let previewAsset: String
    let subtitle: String
    let summary: String
    let historicalAsOf: String
}
