import UIKit

enum ChampionAsset: String, CaseIterable {
    case blitzcrank
    case jinx
    case lux
    case missFortune = "miss-fortune"
    case zed
    case ziggs

    init?(championID: String) {
        self.init(rawValue: championID)
    }

    var thumbName: String {
        switch self {
        case .blitzcrank: "blitzcrank_champthumb"
        case .jinx: "jinx_champthumb"
        case .lux: "lux_champthumb"
        case .missFortune: "missfortune_champthumb"
        case .zed: "zed_champthumb"
        case .ziggs: "ziggs_champthumb"
        }
    }

    var previewName: String {
        switch self {
        case .blitzcrank: "champion_overview_blitzcrank"
        case .jinx: "champion_overview_jinx_zombieslay"
        case .lux: "champion_overview_lux_spellthief"
        case .missFortune: "champion_overview_ms"
        case .zed: "champion_overview_zed_deathsworn"
        case .ziggs: "champion_overview_ziggs"
        }
    }

    func resolves(in bundle: Bundle) -> Bool {
        UIImage(named: thumbName, in: bundle, compatibleWith: nil) != nil
            && UIImage(named: previewName, in: bundle, compatibleWith: nil) != nil
    }
}
