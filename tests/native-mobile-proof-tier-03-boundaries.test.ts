import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyNativeMobileProofManifest } from "../scripts/native-mobile-proof/verify-proof-manifest.mjs";
import {
  copyCheckedProofTree,
  replaceEvidenceDigest,
  writeJson,
} from "./helpers/native-mobile-proof-fixtures.js";
import { installPassingV2VisualEvidence } from "./helpers/native-mobile-proof-v2-fixtures.js";

function updateVisualRef(
  manifest: ReturnType<typeof copyCheckedProofTree>["manifest"],
  path: string,
  digest: string,
  key: "currentCuration" | "reviewReceipt" | "captureLedger",
) {
  const tier3 = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!.tiers[2]!;
  tier3.witnesses!.visual![key]!.sha256 = digest;
  replaceEvidenceDigest(manifest, path, digest);
}

interface MutableScreenCuration {
  screenReviews: Array<{
    appearanceObservations: Record<string, string>;
    axes: Record<string, { disposition?: string; evidence?: string; rationale?: string; score?: number }>;
  }>;
}

describe("native mobile Tier 3 v2 identity and threshold boundaries", () => {
  it("accepts an explicitly normal-only visual scope without AX stress captures", () => {
    const proof = copyCheckedProofTree();
    installPassingV2VisualEvidence(proof.manifest, proof.root, "native-ios", { includeStress: false });
    expect(verifyNativeMobileProofManifest(proof.manifest, proof.root).filter(
      (finding) => !finding.includes("state, claim, evidence, or witness contract mismatch"),
    )).toEqual([]);
  });

  it("rejects absent independence and invalid point-space geometry", () => {
    const receipt = copyCheckedProofTree();
    const receiptPaths = installPassingV2VisualEvidence(receipt.manifest, receipt.root);
    const receiptPath = join(receipt.root, receiptPaths.receiptPath);
    const receiptDocument = JSON.parse(readFileSync(receiptPath, "utf8"));
    receiptDocument.reviewer.sessionId = receiptDocument.generator.sessionId;
    updateVisualRef(receipt.manifest, receiptPaths.receiptPath, writeJson(receiptPath, receiptDocument), "reviewReceipt");
    expect(verifyNativeMobileProofManifest(receipt.manifest, receipt.root)).toContain("native-ios tier 3 v2 receipt reuses generator identity");

    const geometry = copyCheckedProofTree();
    const geometryPaths = installPassingV2VisualEvidence(geometry.manifest, geometry.root);
    const geometryPath = join(geometry.root, geometryPaths.capturePath);
    const ledger = JSON.parse(readFileSync(geometryPath, "utf8"));
    ledger.pointSpaceGeometry.coordinateSpace = "pixels";
    updateVisualRef(geometry.manifest, geometryPaths.capturePath, writeJson(geometryPath, ledger), "captureLedger");
    expect(verifyNativeMobileProofManifest(geometry.manifest, geometry.root)).toContain("native-ios tier 3 point-space geometry is required");
  });

  it("requires immutable receipt, appearance hashes, and exact capture sets", () => {
    const receipt = copyCheckedProofTree();
    const receiptPaths = installPassingV2VisualEvidence(receipt.manifest, receipt.root);
    const receiptPath = join(receipt.root, receiptPaths.receiptPath);
    const receiptDocument = JSON.parse(readFileSync(receiptPath, "utf8"));
    receiptDocument.inputHashes.sourceTreeSha256 = "f".repeat(64);
    updateVisualRef(receipt.manifest, receiptPaths.receiptPath, writeJson(receiptPath, receiptDocument), "reviewReceipt");
    expect(verifyNativeMobileProofManifest(receipt.manifest, receipt.root)).toContain("native-ios tier 3 v2 receipt input hashes are not immutable");

    const paired = copyCheckedProofTree();
    const pairedPaths = installPassingV2VisualEvidence(paired.manifest, paired.root);
    const curationPath = join(paired.root, pairedPaths.curationPath);
    const curation = JSON.parse(readFileSync(curationPath, "utf8"));
    delete curation.screenReviews[0].normalCaptureHashes.dark;
    updateVisualRef(paired.manifest, pairedPaths.curationPath, writeJson(curationPath, curation), "currentCuration");
    expect(verifyNativeMobileProofManifest(paired.manifest, paired.root)).toContain("native-ios tier 3 catalog-screen must bind both normal light and dark hashes");

    const sets = copyCheckedProofTree();
    const setPaths = installPassingV2VisualEvidence(sets.manifest, sets.root);
    const capturePath = join(sets.root, setPaths.capturePath);
    const captureLedger = JSON.parse(readFileSync(capturePath, "utf8"));
    captureLedger.captures.pop();
    captureLedger.captures.find((capture: { captureClass: string }) => capture.captureClass === "stress").screenId = "catalog-screen";
    updateVisualRef(sets.manifest, setPaths.capturePath, writeJson(capturePath, captureLedger), "captureLedger");
    const findings = verifyNativeMobileProofManifest(sets.manifest, sets.root);
    expect(findings).toContain("native-ios tier 3 v2 capture ledger has invalid normal/stress set");
    expect(findings).toContain("native-ios tier 3 v2 stress captures must cover each normal screen exactly once");
  });

  it("rejects reviewer reuse of the controller identity", () => {
    const proof = copyCheckedProofTree();
    const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
    const receiptPath = join(proof.root, paths.receiptPath);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.reviewer.sessionId = receipt.controller.sessionId;
    updateVisualRef(proof.manifest, paths.receiptPath, writeJson(receiptPath, receipt), "reviewReceipt");
    expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain("native-ios tier 3 v2 receipt reuses controller identity");
  });

  it("rejects unbounded, unsupported, missing, and strict-axis N/A scores", () => {
    const mutations = [
      { mutate: (value: MutableScreenCuration) => { value.screenReviews[0]!.axes.Layout!.score = 11; }, finding: "native-ios tier 3 catalog-screen Layout score must be an integer from 0 to 10" },
      { mutate: (value: MutableScreenCuration) => { value.screenReviews[0]!.axes.Layout!.evidence = ""; }, finding: "native-ios tier 3 catalog-screen Layout requires score evidence" },
      { mutate: (value: MutableScreenCuration) => { value.screenReviews[0]!.axes.Unknown = { score: 10, evidence: "unsupported" }; }, finding: "native-ios tier 3 catalog-screen axes must match the exact rubric" },
      { mutate: (value: MutableScreenCuration) => { value.screenReviews[0]!.axes.Layout = { disposition: "NOT_APPLICABLE", rationale: "no layout" }; }, finding: "native-ios tier 3 catalog-screen Layout cannot be NOT_APPLICABLE" },
      { mutate: (value: MutableScreenCuration) => { value.screenReviews[0]!.appearanceObservations.light = ""; }, finding: "native-ios tier 3 catalog-screen requires non-empty light and dark observations" },
    ];
    for (const { mutate, finding } of mutations) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      const curationPath = join(proof.root, paths.curationPath);
      const curation = JSON.parse(readFileSync(curationPath, "utf8"));
      mutate(curation);
      updateVisualRef(proof.manifest, paths.curationPath, writeJson(curationPath, curation), "currentCuration");
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(finding);
    }
  });

  it("binds schema digest refs and exact content-size classes", () => {
    const schema = JSON.parse(readFileSync("schemas/native-mobile-proof-manifest.schema.json", "utf8"));
    expect(schema.$defs.tier3Witnesses.properties.visual).toEqual({ $ref: "#/$defs/tier3Visual" });
    expect(schema.$defs.tier3Visual.properties.currentCuration).toEqual({ $ref: "#/$defs/digestRef" });

    for (const captureClass of ["normal", "stress"] as const) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      const capturePath = join(proof.root, paths.capturePath);
      const ledger = JSON.parse(readFileSync(capturePath, "utf8"));
      const capture = ledger.captures.find((entry: { captureClass: string }) => entry.captureClass === captureClass);
      capture.contentSize = captureClass === "normal" ? "medium" : "large";
      updateVisualRef(proof.manifest, paths.capturePath, writeJson(capturePath, ledger), "captureLedger");
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(`native-ios tier 3 v2 ${captureClass} captures require the exact content-size class`);
    }
  });
});
