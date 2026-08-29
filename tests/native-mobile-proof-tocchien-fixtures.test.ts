import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = "showcase/native-mobile-proof-pilot/apps/native-ios-tocchien-modernization";
const contentRoot = join(appRoot, "Resources/Content");
const legacyCommit = "8d095f576cf41b8d6af4cb4186b4db8ffaa89c4b";
const historicalNotice = "Dữ liệu lịch sử từ bản hướng dẫn Tốc Chiến (2021), không phải dữ liệu trực tiếp.";
const championIds = ["blitzcrank", "jinx", "lux", "miss-fortune", "zed", "ziggs"];
const championAssets: Record<string, [string, string]> = {
  blitzcrank: ["blitzcrank_champthumb", "champion_overview_blitzcrank"],
  jinx: ["jinx_champthumb", "champion_overview_jinx_zombieslay"],
  lux: ["lux_champthumb", "champion_overview_lux_spellthief"],
  "miss-fortune": ["missfortune_champthumb", "champion_overview_ms"],
  zed: ["zed_champthumb", "champion_overview_zed_deathsworn"],
  ziggs: ["ziggs_champthumb", "champion_overview_ziggs"],
};
const dictionaryTerms = [
  "ACE", "AD (Attack Dame)", "ADC (Attack Dame Carry)", "AFK (Away From Keyboard)",
  "AoE (Area of Effect)", "AP (Ability Power)", "Backdoor", "Baron", "Blue Motes", "Bot",
  "Buff", "Carry", "CC (Crowd Control)", "CDR (Cooldown Reduction)", "Combo", "CS (Creep Score)",
  "Gank", "Jungle/Forest", "Lane", "Meta/Metagame", "Poro Points", "Snowball", "Tank (Tanker)",
  "Wild Cores",
];

type Champion = { id: string; thumbAsset: string; previewAsset: string; historicalAsOf: string };
type DictionaryEntry = { term: string; definition: string; sourceAnchor: { line: number } };
type Provenance = {
  legacy: { commit: string; committedAt: string; extraction: string };
  ownerAuthorization: string;
  importedFiles: Array<{ sourcePath: string; destinationPath: string; blobOid: string; byteCount: number; sha256: string }>;
  fixtureFiles: Array<{ path: string; sha256: string }>;
};

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

function fixtureProblems(champions: Champion[], dictionary: DictionaryEntry[]) {
  const problems: string[] = [];
  if (champions.map(({ id }) => id).join("|") !== championIds.join("|")) problems.push("champion allowlist/order");
  if (dictionary.map(({ term }) => term).join("|") !== dictionaryTerms.join("|")) problems.push("dictionary allowlist/order");
  if (new Set(champions.map(({ id }) => id)).size !== champions.length) problems.push("duplicate champion");
  if (new Set(dictionary.map(({ term }) => term)).size !== dictionary.length) problems.push("duplicate dictionary term");
  if (champions.some(({ id, thumbAsset, previewAsset }) => {
    const pair = championAssets[id];
    return !pair || pair[0] !== thumbAsset || pair[1] !== previewAsset;
  })) problems.push("asset pair");
  return problems;
}

describe("TocChien candidate fixtures", () => {
  it("freezes the exact six champions and 24 historical terms", () => {
    const champions = readJson<Champion[]>(join(contentRoot, "champions.json"));
    const dictionary = readJson<DictionaryEntry[]>(join(contentRoot, "dictionary.json"));
    expect(fixtureProblems(champions, dictionary)).toEqual([]);
    expect(champions.every((champion) => champion.historicalAsOf === "2021-05-04")).toBe(true);
    expect(dictionary.every((entry) => entry.definition.length > 0 && entry.sourceAnchor.line > 0)).toBe(true);
  });

  it("owns the historical disclosure once and binds it into the frozen brief/request", () => {
    const metadata = readJson<{ historicalNotice: string; historicalAsOf: string }>(join(contentRoot, "content-metadata.json"));
    const briefPath = "showcase/native-mobile-proof-pilot/briefs/native-ios-tocchien-modernization.json";
    const brief = readJson<{ content: { historicalNotice: string; championCount: number; dictionaryCount: number } }>(briefPath);
    const request = readJson<{ brief: { path: string; sha256: string } }>(
      "showcase/native-mobile-proof-pilot/generator-packets/native-ios-tocchien-modernization-activation-request.json",
    );
    expect(metadata).toMatchObject({ historicalNotice, historicalAsOf: "2021-05-04" });
    expect(brief.content).toMatchObject({ historicalNotice, championCount: 6, dictionaryCount: 24 });
    expect(request.brief).toEqual({ path: briefPath, sha256: sha256(briefPath) });
  });

  it("binds every imported asset to the pinned legacy object rather than checkout bytes", () => {
    const provenance = readJson<Provenance>(join(contentRoot, "content-provenance.json"));
    expect(provenance.legacy).toMatchObject({
      commit: legacyCommit, committedAt: "2021-05-04T16:03:35+07:00", extraction: "git show/git archive",
    });
    expect(provenance.ownerAuthorization).toContain("selected 24 text entries and 12 imagesets");
    expect(provenance.importedFiles).toHaveLength(24);
    for (const file of provenance.importedFiles) {
      expect(file.blobOid).toMatch(/^[0-9a-f]{40}$/);
      expect(file.byteCount).toBeGreaterThan(0);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(sha256(join(appRoot, file.destinationPath))).toBe(file.sha256);
    }
    for (const fixture of provenance.fixtureFiles) expect(sha256(join(appRoot, fixture.path))).toBe(fixture.sha256);
  });

  it("rejects omitted or substituted authorized content", () => {
    const champions = readJson<Champion[]>(join(contentRoot, "champions.json"));
    const dictionary = readJson<DictionaryEntry[]>(join(contentRoot, "dictionary.json"));
    expect(fixtureProblems(champions.slice(0, -1), dictionary)).toContain("champion allowlist/order");
    expect(fixtureProblems(champions, [...dictionary, dictionary[0]!])).toEqual(expect.arrayContaining([
      "dictionary allowlist/order", "duplicate dictionary term",
    ]));
    expect(fixtureProblems([{ ...champions[0]!, previewAsset: "renamed-preview" }, ...champions.slice(1)], dictionary)).toContain("asset pair");
  });

  it("retains the old subject only as content-addressed owner rejection", () => {
    const rejection = readJson<{
      decision: string; sourceTreeSha256: string; screenshots: Array<{ path: string; sha256: string }>; reasonCodes: string[];
    }>("showcase/native-mobile-proof-pilot/evidence/negative-calibration/native-ios-dictionary-search-owner-rejection.json");
    expect(rejection.decision).toBe("REJECT");
    expect(rejection.sourceTreeSha256).toBe("8628f50502cec85e5d5f07a12f6e9714ee7876fe0b564eaf2b15c9cd96d612f5");
    expect(rejection.reasonCodes).toEqual(["DUPLICATE_SEARCH_SURFACE", "VISUAL_TASTE_BELOW_BAR"]);
    expect(rejection.screenshots).toHaveLength(4);
    for (const screenshot of rejection.screenshots) expect(sha256(join("showcase/native-mobile-proof-pilot", screenshot.path))).toBe(screenshot.sha256);
  });

  it("does not bring forbidden legacy directories into the candidate", () => {
    for (const forbidden of ["Video Thumb", "Nangskill", "Packages", "Shared"]) {
      expect(existsSync(join(appRoot, "Resources", forbidden))).toBe(false);
    }
  });
});
