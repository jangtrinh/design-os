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

  it("binds a Tier 3 PASS reviewer to retained zero-blocker curation", () => {
    const { manifest, root } = copyCheckedProofTree();
    const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!;
    ios.tiers[2]!.witnesses ??= {};
    ios.tiers[2]!.witnesses.independentReviewerId = "invented-reviewer";
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      "native-ios tier 3 reviewer is not backed by retained PASS curation",
    );
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

  it("verifies every exact screenshot path and digest in the capture ledger", () => {
    const { manifest, root } = copyCheckedProofTree();
    const capturePath = "evidence/tier-03-simulator-captures.json";
    const captureAbsolute = join(root, capturePath);
    const capture = JSON.parse(readFileSync(captureAbsolute, "utf8")) as {
      captures: Array<{ path: string; sha256: string }>;
    };
    const omitted = capture.captures.find(({ path }) => path.endsWith("native-ios-iphone-17-pro-results-light.png"))!;
    omitted.sha256 = "f".repeat(64);
    const captureDigest = writeJson(captureAbsolute, capture);
    replaceEvidenceDigest(manifest, capturePath, captureDigest);
    const curationPath = "evidence/tier-03-curation-round-04.json";
    const curationAbsolute = join(root, curationPath);
    const curation = JSON.parse(readFileSync(curationAbsolute, "utf8")) as { arms: Array<{ captureLedgerSha256: string }> };
    for (const arm of curation.arms) arm.captureLedgerSha256 = captureDigest;
    replaceEvidenceDigest(manifest, curationPath, writeJson(curationAbsolute, curation));
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      "native-ios tier 3 capture digest mismatch: screenshots/native-ios-iphone-17-pro-results-light.png",
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
});
