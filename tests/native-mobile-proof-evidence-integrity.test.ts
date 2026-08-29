import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyNativeMobileProofManifest } from "../scripts/native-mobile-proof/verify-proof-manifest.mjs";
import {
  copyCheckedProofTree,
  replaceEvidenceDigest,
  writeJson,
} from "./helpers/native-mobile-proof-fixtures.js";

describe("native mobile proof evidence integrity", () => {
  it("rejects brief and generated-evidence identity swaps", () => {
    const { manifest, root } = copyCheckedProofTree();
    const [ios, ipad] = manifest.arms;
    [ios!.brief, ipad!.brief] = [ipad!.brief, ios!.brief];
    [ios!.tiers[1], ipad!.tiers[1]] = [ipad!.tiers[1]!, ios!.tiers[1]!];
    expect(verifyNativeMobileProofManifest(manifest, root)).toEqual(expect.arrayContaining([
      "native-ios brief identity mismatch",
      "native-ipados brief identity mismatch",
      "native-ios tier 2 generated evidence identity mismatch",
      "native-ipados tier 2 generated evidence identity mismatch",
    ]));
  });

  it("uses only the current v2 curation for the promoted Tier 3 visual decision", () => {
    const { manifest, root } = copyCheckedProofTree();
    const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!;
    const tier3 = ios.tiers[2]!;
    expect(tier3).toMatchObject({
      status: "PASS",
      witnesses: { behaviorDisposition: "PASS", visualDisposition: "PASS" },
    });
    expect(tier3.evidence.map(({ path }) => path)).not.toContain("evidence/tier-03-curation-round-04.json");
    expect(tier3.evidence.map(({ path }) => path)).toContain("evidence/tier-03-curation-tocchien-v2.json");
    expect(verifyNativeMobileProofManifest(manifest, root)).toEqual([]);
  });

  it("requires the Tier 2 ledger to contain each exact arm once", () => {
    const { manifest, root } = copyCheckedProofTree();
    const evidencePath = "evidence/tier-02-generated-apps.json";
    const absolute = join(root, evidencePath);
    const run = JSON.parse(readFileSync(absolute, "utf8")) as { arms: unknown[] };
    run.arms.push(structuredClone(run.arms[0]));
    replaceEvidenceDigest(manifest, evidencePath, writeJson(absolute, run));
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios tier 2 generated evidence identity mismatch");
  });

  it("rejects missing, extra, or production-path controller harness declarations", () => {
    const mutations = [
      (entry: Record<string, unknown>) => { delete entry.controllerVerificationHarnessFiles; },
      (entry: Record<string, unknown>) => {
        const files = entry.controllerVerificationHarnessFiles as Array<Record<string, unknown>>;
        files.push({ ...files[0] });
      },
      (entry: Record<string, unknown>) => {
        entry.controllerVerificationHarnessFiles = [{
          path: "TocChienModernization/Views/ChampionCatalogView.swift",
          sha256: "e6323d21c3b8af0f7bd4ce67789e866ca6d7c14a3254cd42fdbcde29f007eec5",
        }];
      },
    ];
    for (const mutate of mutations) {
      const { manifest, root } = copyCheckedProofTree();
      const evidencePath = "evidence/tier-02-generated-apps.json";
      const absolute = join(root, evidencePath);
      const run = JSON.parse(readFileSync(absolute, "utf8")) as { arms: Array<Record<string, unknown>> };
      mutate(run.arms.find((arm) => arm.capabilityId === "native-ios")!);
      replaceEvidenceDigest(manifest, evidencePath, writeJson(absolute, run));
      expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
        "native-ios tier 2 generated evidence identity mismatch",
      );
    }
  });

  it("verifies every exact screenshot path and digest in the capture ledger", () => {
    const { manifest, root } = copyCheckedProofTree();
    const capturePath = "evidence/tier-03-simulator-captures.json";
    const captureAbsolute = join(root, capturePath);
    const capture = JSON.parse(readFileSync(captureAbsolute, "utf8")) as {
      captures: Array<{ path: string; sha256: string }>;
    };
    const omitted = capture.captures.find(({ path }) => path.endsWith("native-ios-tocchien-iphone-17-pro-champion-detail-dark-large.png"))!;
    omitted.sha256 = "f".repeat(64);
    const captureDigest = writeJson(captureAbsolute, capture);
    replaceEvidenceDigest(manifest, capturePath, captureDigest);
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      "native-ios tier 3 capture digest mismatch: screenshots/native-ios-tocchien-iphone-17-pro-champion-detail-dark-large.png",
    );
  });

  it("binds the routing base and Tier 1 activation semantics", () => {
    const forgedBase = copyCheckedProofTree();
    forgedBase.manifest.routingBaseGitSha = "f".repeat(40);
    expect(verifyNativeMobileProofManifest(forgedBase.manifest, forgedBase.root)).toContain("routing base commit identity mismatch");

    const forgedReceipt = copyCheckedProofTree();
    const routingPath = "evidence/tier-01-routing.json";
    const absolute = join(forgedReceipt.root, routingPath);
    const routing = JSON.parse(readFileSync(absolute, "utf8")) as {
      activations: Array<{ request: { requestedSurface: string }; receipt: { route: string } }>;
    };
    routing.activations.find(({ request }) => request.requestedSurface === "native-ios")!.receipt.route = "native-ipados";
    replaceEvidenceDigest(forgedReceipt.manifest, routingPath, writeJson(absolute, routing));
    expect(verifyNativeMobileProofManifest(forgedReceipt.manifest, forgedReceipt.root)).toContain("tier 1 routing evidence identity mismatch");
  });

  it("reports malformed arms without throwing during subject verification", () => {
    const { manifest, root } = copyCheckedProofTree();
    (manifest as unknown as { arms: Array<{ tiers: null }> }).arms[0]!.tiers = null;
    expect(() => verifyNativeMobileProofManifest(manifest, root)).not.toThrow();
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain("native-ios must contain tiers 1 through 6 exactly once");
  });

  it("rejects simulator evidence as a physical or owner PASS witness", () => {
    const { manifest, root } = copyCheckedProofTree();
    const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!;
    const noDeviceEvidence = ios.tiers[3]!.evidence;
    ios.tiers[3] = { ...ios.tiers[3]!, status: "PASS", evidence: noDeviceEvidence, witnesses: { physicalDevice: "iPhone Simulator" } };
    ios.tiers[5] = {
      ...ios.tiers[5]!,
      status: "PASS",
      evidence: noDeviceEvidence,
      witnesses: { ownerDisposition: "ACCEPT", sourceTreeSha256: ios.tiers[1]!.witnesses?.sourceTreeSha256 },
    };
    expect(verifyNativeMobileProofManifest(manifest, root)).toEqual(expect.arrayContaining([
      "native-ios tier 4 physical witness is not backed by retained device evidence",
      "native-ios tier 6 owner ACCEPT is not bound to the exact source artifact",
    ]));
  });

  it("rejects drift from every policy-owned tier state and authorized claim", () => {
    const mutations: Array<{
      armId: "native-ios" | "native-ipados";
      tierId: number;
      mutate: (tier: { status: string; authorizedClaim: string }) => void;
    }> = [
      { armId: "native-ios", tierId: 6, mutate: (tier) => { tier.status = "PENDING"; } },
      { armId: "native-ios", tierId: 2, mutate: (tier) => { tier.status = "PENDING"; } },
      { armId: "native-ios", tierId: 4, mutate: (tier) => { tier.status = "PENDING"; } },
      { armId: "native-ipados", tierId: 6, mutate: (tier) => { tier.status = "NOT RUN"; } },
      {
        armId: "native-ios",
        tierId: 4,
        mutate: (tier) => { tier.authorizedClaim = "Physical iPhone and VoiceOver are verified."; },
      },
    ];
    for (const { armId, tierId, mutate } of mutations) {
      const { manifest, root } = copyCheckedProofTree();
      const tier = manifest.arms.find((arm) => arm.capabilityId === armId)!.tiers.find((item) => item.id === tierId)!;
      mutate(tier);
      expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
        `${armId} tier ${tierId} state, claim, evidence, or witness contract mismatch`,
      );
    }
  });

  it("binds owner ACCEPT to the exact subject, Tier 3 refs, and paired screen captures", () => {
    interface OwnerRecord {
      recordedAt: string;
      statement: { verbatim: string };
      subject: { sourceTreeSha256: string };
      tier3Evidence: { curation: { sha256: string } };
      screenVerdicts: Array<{
        screenId: string;
        disposition: string;
        normalCaptures: Array<{ appearance: string; sha256: string }>;
      }>;
      excludedClaims: string[];
    }
    const mutations: Array<(record: OwnerRecord) => void> = [
      (record) => { record.screenVerdicts.pop(); },
      (record) => { record.screenVerdicts.push(structuredClone(record.screenVerdicts[0]!)); },
      (record) => { record.screenVerdicts[0]!.disposition = "REJECT"; },
      (record) => { record.screenVerdicts[0]!.normalCaptures[0]!.appearance = "dark"; },
      (record) => { record.subject.sourceTreeSha256 = "f".repeat(64); },
      (record) => { record.tier3Evidence.curation.sha256 = "f".repeat(64); },
      (record) => { record.screenVerdicts[0]!.normalCaptures[0]!.sha256 = "f".repeat(64); },
      (record) => { record.statement.verbatim = "looks fine"; },
      (record) => { record.excludedClaims.pop(); },
      (record) => { record.recordedAt = "2000-01-01T00:00:00Z"; },
    ];
    for (const mutate of mutations) {
      const { manifest, root } = copyCheckedProofTree();
      const ownerPath = "evidence/tier-06-owner-verdict-tocchien-v1.json";
      const ownerAbsolute = join(root, ownerPath);
      const record = JSON.parse(readFileSync(ownerAbsolute, "utf8")) as OwnerRecord;
      mutate(record);
      const digest = writeJson(ownerAbsolute, record);
      replaceEvidenceDigest(manifest, ownerPath, digest);
      const tier6 = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!.tiers[5]!;
      const witnesses = tier6.witnesses as typeof tier6.witnesses & { ownerVerdict: { sha256: string } };
      witnesses.ownerVerdict.sha256 = digest;
      expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
        "native-ios tier 6 owner ACCEPT is not bound to the exact source artifact",
      );
    }
  });
});
