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

type ProofCopy = ReturnType<typeof copyCheckedProofTree>;
type VisualRef = "currentCuration" | "reviewReceipt" | "captureLedger";

function updateVisualRef(proof: ProofCopy, path: string, digest: string, key: VisualRef) {
  const tier3 = proof.manifest.arms.find((arm) => arm.capabilityId === "native-ios")!.tiers[2]!;
  tier3.witnesses!.visual![key]!.sha256 = digest;
  replaceEvidenceDigest(proof.manifest, path, digest);
}

function mutateJson(
  proof: ProofCopy,
  path: string,
  key: VisualRef,
  mutate: (document: Record<string, unknown>) => void,
) {
  const absolute = join(proof.root, path);
  const document = JSON.parse(readFileSync(absolute, "utf8")) as Record<string, unknown>;
  mutate(document);
  updateVisualRef(proof, path, writeJson(absolute, document), key);
}

function mutateCaptureLedger(proof: ProofCopy, capturePath: string, receiptPath: string, curationPath: string, mutate: (document: Record<string, unknown>) => void) {
  const captureAbsolute = join(proof.root, capturePath);
  const capture = JSON.parse(readFileSync(captureAbsolute, "utf8")) as Record<string, unknown>;
  mutate(capture);
  const captureDigest = writeJson(captureAbsolute, capture);

  const receiptAbsolute = join(proof.root, receiptPath);
  const receipt = JSON.parse(readFileSync(receiptAbsolute, "utf8")) as Record<string, unknown>;
  (receipt.inputHashes as Record<string, unknown>).captureLedgerSha256 = captureDigest;
  const receiptDigest = writeJson(receiptAbsolute, receipt);

  const curationAbsolute = join(proof.root, curationPath);
  const curation = JSON.parse(readFileSync(curationAbsolute, "utf8")) as Record<string, unknown>;
  curation.captureLedgerSha256 = captureDigest;
  curation.reviewReceiptSha256 = receiptDigest;
  const curationDigest = writeJson(curationAbsolute, curation);

  updateVisualRef(proof, capturePath, captureDigest, "captureLedger");
  updateVisualRef(proof, receiptPath, receiptDigest, "reviewReceipt");
  updateVisualRef(proof, curationPath, curationDigest, "currentCuration");
}

function mutateReceipt(proof: ProofCopy, receiptPath: string, curationPath: string, mutate: (document: Record<string, unknown>) => void) {
  const receiptAbsolute = join(proof.root, receiptPath);
  const receipt = JSON.parse(readFileSync(receiptAbsolute, "utf8")) as Record<string, unknown>;
  mutate(receipt);
  const receiptDigest = writeJson(receiptAbsolute, receipt);

  const curationAbsolute = join(proof.root, curationPath);
  const curation = JSON.parse(readFileSync(curationAbsolute, "utf8")) as Record<string, unknown>;
  curation.reviewReceiptSha256 = receiptDigest;
  const curationDigest = writeJson(curationAbsolute, curation);

  updateVisualRef(proof, receiptPath, receiptDigest, "reviewReceipt");
  updateVisualRef(proof, curationPath, curationDigest, "currentCuration");
}

describe("native mobile Tier 3 v2 adversarial integrity", () => {
  it("rejects empty simulator identity and forged declared PNG dimensions", () => {
    for (const { mutation, finding } of [
      { mutation: (capture: Record<string, unknown>) => { capture.device = ""; }, finding: "native-ios tier 3 v2 normal capture metadata is incomplete" },
      { mutation: (capture: Record<string, unknown>) => { capture.runtime = "   "; }, finding: "native-ios tier 3 v2 normal capture metadata is incomplete" },
      { mutation: (capture: Record<string, unknown>) => { capture.udid = ""; }, finding: "native-ios tier 3 v2 normal capture metadata is incomplete" },
      { mutation: (capture: Record<string, unknown>) => { capture.pixels = { width: 1, height: 1 }; }, finding: "native-ios tier 3 v2 capture pixel metadata mismatch: screenshots/v2-native-ios-catalog-screen-normal-light.png" },
    ]) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      mutateCaptureLedger(proof, paths.capturePath, paths.receiptPath, paths.curationPath, (document) => {
        const captures = document.captures as Array<Record<string, unknown>>;
        mutation(captures[0]!);
      });
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(finding);
    }
  });

  it("rejects negative point geometry and an unbound extra subject", () => {
    const mutations: Array<{ mutate: (document: Record<string, unknown>) => void; finding: string }> = [
      { mutate: (document) => {
        const geometry = document.pointSpaceGeometry as { screens: Array<{ kind: string; aboveFold: Record<string, number> }> };
        geometry.screens.find((screen) => screen.kind === "detail")!.aboveFold.heroHeightPoints = -1;
      }, finding: "native-ios tier 3 detail violates above-fold hero or next-section bounds" },
      { mutate: (document) => {
        const geometry = document.pointSpaceGeometry as { screens: Array<{ kind: string; aboveFold: Record<string, number> }> };
        geometry.screens.find((screen) => screen.kind === "dictionary")!.aboveFold.chromeHeightPoints = -1;
      }, finding: "native-ios tier 3 dictionary violates chrome or above-fold row bounds" },
      { mutate: (document) => {
        const subjects = document.subjects as Array<Record<string, unknown>>;
        subjects.push({ ...subjects[0], capabilityId: "native-ipados" });
      }, finding: "native-ios tier 3 v2 capture ledger subjects must match captured capabilities exactly" },
    ];
    for (const { mutate, finding } of mutations) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      mutateCaptureLedger(proof, paths.capturePath, paths.receiptPath, paths.curationPath, mutate);
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(finding);
    }
  });

  it("requires non-empty distinct controller, generator, and reviewer identities", () => {
    const mutations: Array<{ mutate: (document: Record<string, unknown>) => void; finding: string }> = [
      { mutate: (document) => { (document.generator as Record<string, unknown>).sessionId = ""; }, finding: "native-ios tier 3 v2 receipt lacks controller or independent reviewer identity" },
      { mutate: (document) => { (document.generator as Record<string, unknown>).workerId = "   "; }, finding: "native-ios tier 3 v2 receipt lacks controller or independent reviewer identity" },
      { mutate: (document) => {
        const controller = document.controller as Record<string, unknown>;
        const generator = document.generator as Record<string, unknown>;
        generator.sessionId = controller.sessionId;
      }, finding: "native-ios tier 3 v2 receipt reuses generator identity for controller verification" },
    ];
    for (const { mutate, finding } of mutations) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      mutateReceipt(proof, paths.receiptPath, paths.curationPath, mutate);
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(finding);
    }
  });

  it("rejects unknown dispositions and whitespace-only review evidence", () => {
    const mutations: Array<{ mutate: (document: Record<string, unknown>) => void; finding: string }> = [
      { mutate: (document) => {
        const review = (document.screenReviews as Array<Record<string, unknown>>)[0]!;
        const axes = review.axes as Record<string, Record<string, unknown>>;
        axes.Motion!.disposition = "UNKNOWN";
      }, finding: "native-ios tier 3 catalog-screen Motion has an invalid scored result" },
      { mutate: (document) => {
        const review = (document.screenReviews as Array<Record<string, unknown>>)[0]!;
        const axes = review.axes as Record<string, Record<string, unknown>>;
        axes.Layout!.evidence = "   ";
      }, finding: "native-ios tier 3 catalog-screen Layout requires score evidence" },
      { mutate: (document) => {
        const review = (document.screenReviews as Array<Record<string, unknown>>)[0]!;
        const observations = review.appearanceObservations as Record<string, string>;
        observations.dark = "   ";
      }, finding: "native-ios tier 3 catalog-screen requires non-empty light and dark observations" },
    ];
    for (const { mutate, finding } of mutations) {
      const proof = copyCheckedProofTree();
      const paths = installPassingV2VisualEvidence(proof.manifest, proof.root);
      mutateJson(proof, paths.curationPath, "currentCuration", mutate);
      expect(verifyNativeMobileProofManifest(proof.manifest, proof.root)).toContain(finding);
    }
  });
});
