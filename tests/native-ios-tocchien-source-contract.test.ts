import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = "showcase/native-mobile-proof-pilot/apps/native-ios-tocchien-modernization";
const productionRoot = join(appRoot, "TocChienModernization");
const requiredProductionFiles = [
  "TocChienModernizationApp.swift", "App/TocChienSceneView.swift", "Data/LocalContentRepository.swift",
  "Models/Champion.swift", "Models/ChampionAsset.swift", "Models/ChampionRoute.swift", "Models/DictionaryEntry.swift",
  "State/TocChienStore.swift", "Views/ChampionCard.swift", "Views/ChampionCatalogView.swift",
  "Views/ChampionDetailView.swift", "Views/GameDictionaryView.swift", "Views/HistoricalDataNotice.swift", "Views/RootTabView.swift",
];

function swiftFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? swiftFiles(path) : path.endsWith(".swift") ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");

describe("TocChien native iOS source contract", () => {
  it("locks the iOS 26 Swift 6 iPhone-only project and test bundles", () => {
    const project = read(join(appRoot, "project.yml"));
    expect(project).toContain('SWIFT_VERSION: "6.0"');
    expect(project).toContain('IPHONEOS_DEPLOYMENT_TARGET: "26.0"');
    expect(project).toContain('TARGETED_DEVICE_FAMILY: "1"');
    expect(project).toContain("TocChienModernizationTests");
    expect(project).toContain("TocChienModernizationUITests");
    expect(project).not.toMatch(/packages:|packageDependencies|SwiftData|WebView/);
  });

  it("contains only the planned production boundary and keeps every Swift file below 200 lines", () => {
    for (const relativePath of requiredProductionFiles) expect(read(join(productionRoot, relativePath))).not.toHaveLength(0);
    for (const path of swiftFiles(appRoot)) expect(read(path).split("\n").length).toBeLessThan(200);
  });

  it("uses one per-scene observable store with typed Tướng navigation", () => {
    const scene = read(join(productionRoot, "App/TocChienSceneView.swift"));
    const store = read(join(productionRoot, "State/TocChienStore.swift"));
    const route = read(join(productionRoot, "Models/ChampionRoute.swift"));
    expect(scene.match(/TocChienStore\(/g)).toHaveLength(1);
    expect(store).toContain("@Observable");
    expect(store).toContain("@MainActor");
    expect(store).not.toMatch(/static\s+.*TocChienStore|shared\s*=\s*TocChienStore/);
    expect(route).toContain("case detail(id: String)");
    expect(read(join(productionRoot, "Views/ChampionCatalogView.swift"))).toContain("NavigationLink(value: ChampionRoute.detail");
  });

  it("uses exactly two native tabs, one typed detail screen, and one native dictionary search surface", () => {
    const tabs = read(join(productionRoot, "Views/RootTabView.swift"));
    const dictionary = read(join(productionRoot, "Views/GameDictionaryView.swift"));
    expect(tabs.match(/\bTab\(/g)).toHaveLength(2);
    expect(tabs).toContain('"Tướng"');
    expect(tabs).toContain('"Từ điển"');
    expect(tabs).toContain("role: .search");
    expect(dictionary.match(/\.searchable\(/g)).toHaveLength(1);
    expect(dictionary).not.toContain("TextField(");
  });

  it("keeps local historical content and asset mapping fail-closed", () => {
    const repository = read(join(productionRoot, "Data/LocalContentRepository.swift"));
    const assets = read(join(productionRoot, "Models/ChampionAsset.swift"));
    const notice = read(join(productionRoot, "Views/HistoricalDataNotice.swift"));
    expect(repository).toMatch(/duplicate|unexpected|missing/i);
    expect(assets.match(/case\s+(blitzcrank|jinx|lux|missFortune|zed|ziggs)/g)).toHaveLength(6);
    expect(notice).toContain("historical-data-notice");
    expect(repository).not.toMatch(/URLSession|https?:\/\/|WKWebView|WebView|SwiftData/);
  });

  it("keeps all deterministic behavior tests inside the candidate project", () => {
    expect(read(join(appRoot, "TocChienModernizationTests/ContentRepositoryTests.swift")).match(/@Test/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read(join(appRoot, "TocChienModernizationTests/TocChienStoreTests.swift")).match(/@Test/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read(join(appRoot, "TocChienModernizationUITests/TocChienBehaviorUITests.swift")).match(/func test/g)?.length).toBeGreaterThanOrEqual(6);
    expect(read(join(appRoot, "TocChienModernizationUITests/TocChienLayoutUITests.swift")).match(/func test/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
