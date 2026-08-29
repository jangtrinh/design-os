import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type MutableManifest, writeJson } from "./native-mobile-proof-fixtures.js";

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const pngHeaderFixture = (width: number, height: number, label: string): Buffer => {
  const header = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return Buffer.concat([header, Buffer.from(label)]);
};
const autoFails = [
  "duplicate-screen-title",
  "duplicate-search-surface",
  "wrong-or-missing-authorized-asset",
  "missing-historical-notice",
  "normal-large-clipping-or-overlap",
  "excessive-chrome-or-padding",
  "below-fold-density",
  "oversized-detail-hero",
  "placeholder-or-generic-scaffold",
  "below-axis-threshold",
];

export interface V2VisualFixture {
  capturePath: string;
  curationPath: string;
  receiptPath: string;
}

export function installPassingV2VisualEvidence(
  manifest: MutableManifest,
  root: string,
  capabilityId: "native-ios" | "native-ipados" = "native-ios",
  options: { includeStress?: boolean } = {},
): V2VisualFixture {
  const arm = manifest.arms.find((item) => item.capabilityId === capabilityId)!;
  const tier3 = arm.tiers.find((item) => item.id === 3)!;
  const policyGeneratorId = tier3.witnesses!.generatorId!;
  const subject = tier3.witnesses!.behavior!.subject!;
  const screens = [
    { screenId: "catalog-screen", kind: "catalog", aboveFold: { completeRows: 2 } },
    { screenId: "detail-screen", kind: "detail", aboveFold: { completeRows: 1, heroHeightPoints: 90, nextSectionStartYPoints: 280 } },
    { screenId: "dictionary-screen", kind: "dictionary", aboveFold: { completeRows: 4, chromeHeightPoints: 120 } },
  ];
  const screenshotDirectory = join(root, "evidence", "screenshots");
  mkdirSync(screenshotDirectory, { recursive: true });
  const capture = (screenId: string, captureClass: "normal" | "stress", appearance: string, device: string) => {
    const path = `screenshots/v2-${capabilityId}-${screenId}-${captureClass}-${appearance}.png`;
    const image = pngHeaderFixture(1206, 2622, `${capabilityId}|${screenId}|${captureClass}|${appearance}|${device}`);
    writeFileSync(join(root, "evidence", path), image);
    return {
      capabilityId,
      screenId,
      captureClass,
      device,
      runtime: "iOS 26.5",
      udid: `${device}-${screenId}-${appearance}`,
      appearance,
      contentSize: captureClass === "normal" ? "large" : "accessibility-extra-extra-extra-large",
      path,
      sha256: sha256(image),
      pixels: { width: 1206, height: 2622 },
      sourceTreeSha256: subject.sourceTreeSha256!,
      launchArguments: ["-proof-state", screenId],
    };
  };
  const normal = screens.flatMap(({ screenId }) => [
    capture(screenId, "normal", "light", "iPhone 17e"),
    capture(screenId, "normal", "dark", "iPhone 17 Pro"),
  ]);
  const stress = options.includeStress === false ? [] : screens.map(({ screenId, kind }) => ({
    ...capture(screenId, "stress", "dark", "iPhone 17 Pro"),
    ...(kind === "detail" ? { captureState: "top-of-scroll" } : {
      captureState: "representative-content-fully-visible",
      scrollTargetId: kind === "catalog" ? "champion-card-blitzcrank" : "dictionary-row-ACE",
      lowerBoundaryId: kind === "catalog" ? "tab-bar" : "search-field",
      minimumGapPoints: 8,
      targetFrameIntersectsChrome: false,
      targetFramePoints: { minX: 16, minY: 220, maxX: 374, maxY: 620 },
      lowerBoundaryFramePoints: { minX: 0, minY: 660, maxX: 390, maxY: 844 },
    }),
  }));
  const capturePath = "evidence/tier-03-v2-test-captures.json";
  const captureDocument = {
    kind: "design-os.native-mobile-simulator-capture-evidence",
    version: 2,
    subjects: [subject],
    captures: [...normal, ...stress],
    pointSpaceGeometry: {
      coordinateSpace: "points",
      screens: screens.map((screen) => ({
        screenId: screen.screenId,
        kind: screen.kind,
        viewport: { widthPoints: 390, heightPoints: 844 },
        aboveFold: screen.aboveFold,
      })),
    },
  };
  const captureSha256 = writeJson(join(root, capturePath), captureDocument);
  const receiptPath = "evidence/tier-03-v2-test-receipt.json";
  const receipt = {
    kind: "design-os.native-mobile-tier-03-review-receipt",
    version: 2,
    createdAt: "2026-08-29T12:00:00Z",
    subject,
    controller: { role: "controller", sessionId: "controller-session", workerId: "controller-worker" },
    generator: { id: policyGeneratorId, sessionId: "generator-session", workerId: "generator-worker" },
    reviewer: { role: "independent-curator", sessionId: "review-session", workerId: "review-worker" },
    inputHashes: {
      tasteRubricSha256: sha256(readFileSync("knowledge/taste-rubric.md")),
      briefSha256: subject.briefSha256,
      sourceTreeSha256: subject.sourceTreeSha256,
      captureLedgerSha256: captureSha256,
    },
    normalCapturePaths: normal.map((entry) => entry.path),
    stressCapturePaths: stress.map((entry) => entry.path),
  };
  const receiptSha256 = writeJson(join(root, receiptPath), receipt);
  const curationPath = "evidence/tier-03-v2-test-curation.json";
  const curation = {
    kind: "design-os.native-mobile-tier-03-visual-curation",
    version: 2,
    capabilityId,
    subject,
    captureLedgerSha256: captureSha256,
    reviewReceiptSha256: receiptSha256,
    reviewer: { sessionId: "review-session", workerId: "review-worker" },
    blockers: [],
    autoFails: Object.fromEntries(autoFails.map((name) => [name, false])),
    screenReviews: screens.map(({ screenId }) => ({
      screenId,
      normalCaptureHashes: {
        light: normal.find((entry) => entry.screenId === screenId && entry.appearance === "light")!.sha256,
        dark: normal.find((entry) => entry.screenId === screenId && entry.appearance === "dark")!.sha256,
      },
      appearanceObservations: { light: "Hierarchy remains legible.", dark: "Contrast remains legible." },
      axes: {
        Layout: { score: 8, evidence: "The measured viewport preserves two complete catalogue rows." },
        Typography: { score: 8, evidence: "The title and body roles remain distinct in both appearances." },
        Spacing: { score: 8, evidence: "The measured chrome and row density stay inside the brief bounds." },
        Consistency: { score: 8, evidence: "The three screens reuse the same navigation and surface system." },
        Motion: { score: 7, evidence: "The typed push transition preserves navigation causality." },
        Iconography: { score: 7, evidence: "The visible symbols use one coherent platform set." },
        "Depth-Surface": { score: 7, evidence: "Light and dark surfaces retain the intended elevation hierarchy." },
      },
    })),
    stressObservations: stress.map((entry) => ({ capturePath: entry.path, observation: "Stress inspection found no blocker." })),
  };
  const curationSha256 = writeJson(join(root, curationPath), curation);
  const refs = {
    currentCuration: { path: curationPath, sha256: curationSha256 },
    reviewReceipt: { path: receiptPath, sha256: receiptSha256 },
    captureLedger: { path: capturePath, sha256: captureSha256 },
  };
  tier3.status = "PASS";
  tier3.evidence.push(...Object.values(refs));
  tier3.witnesses!.visualDisposition = "PASS";
  tier3.witnesses!.visual = refs;
  const tier6 = arm.tiers.find((item) => item.id === 6)!;
  tier6.status = "PENDING";
  tier6.authorizedClaim = "No owner-acceptance claim is authorized for substituted Tier 3 fixtures.";
  tier6.environment = "Owner review not performed for substituted Tier 3 fixtures";
  tier6.evidence = [];
  delete tier6.witnesses;
  return { capturePath, curationPath, receiptPath };
}
