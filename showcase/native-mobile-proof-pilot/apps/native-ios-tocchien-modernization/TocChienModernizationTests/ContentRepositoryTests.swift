import Foundation
import Testing
@testable import TocChienModernization

struct ContentRepositoryTests {
    private let championIDs = ["blitzcrank", "jinx", "lux", "miss-fortune", "zed", "ziggs"]
    private let terms = [
        "ACE", "AD (Attack Dame)", "ADC (Attack Dame Carry)", "AFK (Away From Keyboard)",
        "AoE (Area of Effect)", "AP (Ability Power)", "Backdoor", "Baron", "Blue Motes", "Bot",
        "Buff", "Carry", "CC (Crowd Control)", "CDR (Cooldown Reduction)", "Combo", "CS (Creep Score)",
        "Gank", "Jungle/Forest", "Lane", "Meta/Metagame", "Poro Points", "Snowball", "Tank (Tanker)", "Wild Cores"
    ]

    @Test func decodesOnlyTheLockedContentSets() throws {
        let content = try decode(championIDs, terms)
        #expect(content.champions.map(\.id) == championIDs)
        #expect(content.dictionary.map(\.term) == terms)
    }

    @Test func rejectsMissingDuplicateAndExtraChampions() throws {
        try expectFailure(Array(championIDs.dropLast()), terms)
        try expectFailure(championIDs + ["blitzcrank"], terms)
        try expectFailure(championIDs + ["unauthorized"], terms)
    }

    @Test func rejectsMissingDuplicateAndExtraDictionaryEntries() throws {
        try expectFailure(championIDs, Array(terms.dropLast()))
        try expectFailure(championIDs, terms + ["ACE"])
        try expectFailure(championIDs, terms + ["Unauthorised"])
    }

    @Test func rejectsMissingTypedAssets() throws {
        let data = fixtureData(championIDs, terms)
        do {
            _ = try LocalContentRepository.decode(
                championsData: data.champions,
                dictionaryData: data.dictionary,
                metadataData: data.metadata,
                assetExists: { $0 != .jinx }
            )
            Issue.record("expected unresolved asset failure")
        } catch {
            #expect(error.localizedDescription.contains("asset"))
        }
    }

    private func expectFailure(_ championIDs: [String], _ terms: [String]) throws {
        do {
            _ = try decode(championIDs, terms)
            Issue.record("expected local content validation failure")
        } catch {
            #expect(error.localizedDescription.contains("content"))
        }
    }

    private func decode(_ championIDs: [String], _ terms: [String]) throws -> TocChienContent {
        let data = fixtureData(championIDs, terms)
        return try LocalContentRepository.decode(
            championsData: data.champions,
            dictionaryData: data.dictionary,
            metadataData: data.metadata,
            assetExists: { _ in true }
        )
    }

    private func fixtureData(_ ids: [String], _ terms: [String]) -> (champions: Data, dictionary: Data, metadata: Data) {
        let champions = ids.map { id in
            let asset = ChampionAsset(championID: id)
            return Champion(id: id, legacyName: id, role: "Đỡ đòn", difficulty: 1, damageType: "Magic", thumbAsset: asset?.thumbName ?? "", previewAsset: asset?.previewName ?? "", subtitle: "", summary: "", historicalAsOf: "2021-05-04")
        }
        let dictionary = terms.map { DictionaryEntry(term: $0, definition: "Định nghĩa $0") }
        return (try! JSONEncoder().encode(champions), try! JSONEncoder().encode(dictionary), Data("{\"historicalAsOf\":\"2021-05-04\",\"historicalNotice\":\"Historical\"}".utf8))
    }
}
