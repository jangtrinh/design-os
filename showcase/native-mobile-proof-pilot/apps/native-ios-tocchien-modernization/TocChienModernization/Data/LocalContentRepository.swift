import Foundation

struct TocChienContent: Hashable {
    let champions: [Champion]
    let dictionary: [DictionaryEntry]
    let metadata: ContentMetadata

    static let empty = TocChienContent(
        champions: [], dictionary: [], metadata: ContentMetadata(historicalAsOf: "", historicalNotice: "")
    )
}

enum LocalContentError: LocalizedError {
    case missingResource(String)
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case let .missingResource(name): "Local content resource is missing: \(name)."
        case let .invalid(reason): "Local content validation failed: \(reason)."
        }
    }
}

enum LocalContentRepository {
    static let championIDs = ["blitzcrank", "jinx", "lux", "miss-fortune", "zed", "ziggs"]
    static let dictionaryTerms = [
        "ACE", "AD (Attack Dame)", "ADC (Attack Dame Carry)", "AFK (Away From Keyboard)",
        "AoE (Area of Effect)", "AP (Ability Power)", "Backdoor", "Baron", "Blue Motes", "Bot",
        "Buff", "Carry", "CC (Crowd Control)", "CDR (Cooldown Reduction)", "Combo", "CS (Creep Score)",
        "Gank", "Jungle/Forest", "Lane", "Meta/Metagame", "Poro Points", "Snowball", "Tank (Tanker)", "Wild Cores"
    ]

    static func load(bundle: Bundle = .main) throws -> TocChienContent {
        try decode(
            championsData: try data(named: "champions", bundle: bundle),
            dictionaryData: try data(named: "dictionary", bundle: bundle),
            metadataData: try data(named: "content-metadata", bundle: bundle),
            assetExists: { $0.resolves(in: bundle) }
        )
    }

    static func decode(
        championsData: Data,
        dictionaryData: Data,
        metadataData: Data,
        assetExists: (ChampionAsset) -> Bool
    ) throws -> TocChienContent {
        let decoder = JSONDecoder()
        let champions = try decoder.decode([Champion].self, from: championsData)
        let dictionary = try decoder.decode([DictionaryEntry].self, from: dictionaryData)
        let metadata = try decoder.decode(ContentMetadata.self, from: metadataData)
        guard champions.map(\.id) == championIDs else { throw LocalContentError.invalid("champion set") }
        guard dictionary.map(\.term) == dictionaryTerms else { throw LocalContentError.invalid("dictionary set") }
        guard metadata.historicalAsOf == "2021-05-04", !metadata.historicalNotice.isEmpty else {
            throw LocalContentError.invalid("historical metadata")
        }
        for champion in champions {
            guard let asset = ChampionAsset(championID: champion.id),
                  asset.thumbName == champion.thumbAsset,
                  asset.previewName == champion.previewAsset,
                  assetExists(asset) else { throw LocalContentError.invalid("champion asset") }
        }
        return TocChienContent(champions: champions, dictionary: dictionary, metadata: metadata)
    }

    private static func data(named name: String, bundle: Bundle) throws -> Data {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw LocalContentError.missingResource(name)
        }
        return try Data(contentsOf: url)
    }
}
