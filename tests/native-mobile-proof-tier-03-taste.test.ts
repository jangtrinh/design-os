import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateNativeMobileProofManifest,
  verifyNativeMobileProofManifest,
} from "../scripts/native-mobile-proof/verify-proof-manifest.mjs";
import {
  copyCheckedProofTree,
  replaceEvidenceDigest,
  validManifest,
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

describe("native mobile Tier 3 v2 taste contract", () => {
  it("migrates the checked-in proof to v2 with explicit legacy visual state", () => {
    const manifest = JSON.parse(readFileSync("showcase/native-mobile-proof-pilot/proof-manifest.json", "utf8"));
    expect(manifest.version).toBe(2);

    const ios = manifest.arms.find((arm: { capabilityId: string }) => arm.capabilityId === "native-ios");
    const ipad = manifest.arms.find((arm: { capabilityId: string }) => arm.capabilityId === "native-ipados");
    expect(ios.tiers[2]).toMatchObject({
      status: "PASS",
      witnesses: { behaviorDisposition: "PASS", visualDisposition: "PASS" },
    });
    expect(ipad.tiers[2]).toMatchObject({
      status: "PENDING",
      witnesses: { behaviorDisposition: "PASS", visualDisposition: "UNASSESSED" },
    });
  });

  it("rejects an aggregate PASS when behavior passes but visual craft is unassessed", () => {
    const manifest = validManifest();
    const tier3 = manifest.arms[0]!.tiers[2]!;
    tier3.status = "PASS";
    tier3.witnesses = {
      generatorId: "generator",
      behaviorDisposition: "PASS",
      visualDisposition: "UNASSESSED",
      behavior: {},
      visual: { reason: "No v2 independent taste curation exists." },
    };

    expect(validateNativeMobileProofManifest(manifest)).toContain(
      "native-ios tier 3 aggregate status must be PENDING",
    );
  });

  it("does not treat retained v1 curation as a v2 visual PASS witness", () => {
    const { manifest, root } = copyCheckedProofTree();
    const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!;
    const tier3 = ios.tiers[2]!;
    const legacyCuration = "evidence/tier-03-curation-round-04.json";
    tier3.witnesses = {
      ...tier3.witnesses,
      behaviorDisposition: "PASS",
      visualDisposition: "PASS",
      behavior: {},
      visual: {
        currentCuration: {
          path: legacyCuration,
          sha256: createHash("sha256").update(readFileSync(join(root, legacyCuration))).digest("hex"),
        },
      },
    };

    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      "native-ios tier 3 visual evidence requires a v2 current curation",
    );
  });

  it("accepts one receipt-bound v2 visual review only when every threshold and capture is exact", () => {
    const { manifest, root } = copyCheckedProofTree();
    installPassingV2VisualEvidence(manifest, root);
    expect(verifyNativeMobileProofManifest(manifest, root).filter(
      (finding) => !finding.includes("state, claim, evidence, or witness contract mismatch"),
    )).toEqual([]);
  });

  it("rejects below-threshold scores, invalid N/A evidence, auto-fail gaps, and stress substitutions", () => {
    const threshold = copyCheckedProofTree();
    const thresholdPaths = installPassingV2VisualEvidence(threshold.manifest, threshold.root);
    const curationPath = join(threshold.root, thresholdPaths.curationPath);
    const curation = JSON.parse(readFileSync(curationPath, "utf8"));
    curation.screenReviews[0].axes.Layout.score = 7;
    updateVisualRef(threshold.manifest, thresholdPaths.curationPath, writeJson(curationPath, curation), "currentCuration");
    expect(verifyNativeMobileProofManifest(threshold.manifest, threshold.root)).toContain(
      "native-ios tier 3 catalog-screen Layout is below threshold",
    );

    const notApplicable = copyCheckedProofTree();
    const notApplicablePaths = installPassingV2VisualEvidence(notApplicable.manifest, notApplicable.root);
    const notApplicablePath = join(notApplicable.root, notApplicablePaths.curationPath);
    const notApplicableCuration = JSON.parse(readFileSync(notApplicablePath, "utf8"));
    notApplicableCuration.screenReviews[0].axes.Motion = { disposition: "NOT_APPLICABLE" };
    updateVisualRef(notApplicable.manifest, notApplicablePaths.curationPath, writeJson(notApplicablePath, notApplicableCuration), "currentCuration");
    expect(verifyNativeMobileProofManifest(notApplicable.manifest, notApplicable.root)).toContain(
      "native-ios tier 3 catalog-screen Motion NOT_APPLICABLE requires rationale",
    );

    for (const mutateAutoFails of [
      (autoFails: Record<string, boolean>) => delete autoFails["below-fold-density"],
      (autoFails: Record<string, boolean>) => { autoFails["below-fold-density"] = true; },
      (autoFails: Record<string, boolean>) => { autoFails["unknown-condition"] = false; },
    ]) {
      const autoFail = copyCheckedProofTree();
      const autoFailPaths = installPassingV2VisualEvidence(autoFail.manifest, autoFail.root);
      const autoFailPath = join(autoFail.root, autoFailPaths.curationPath);
      const autoFailCuration = JSON.parse(readFileSync(autoFailPath, "utf8"));
      mutateAutoFails(autoFailCuration.autoFails);
      updateVisualRef(autoFail.manifest, autoFailPaths.curationPath, writeJson(autoFailPath, autoFailCuration), "currentCuration");
      expect(verifyNativeMobileProofManifest(autoFail.manifest, autoFail.root)).toContain(
        "native-ios tier 3 v2 curation auto-fails are incomplete or triggered",
      );
    }

    const stress = copyCheckedProofTree();
    const stressPaths = installPassingV2VisualEvidence(stress.manifest, stress.root);
    const stressCapture = JSON.parse(readFileSync(join(stress.root, stressPaths.capturePath), "utf8"));
    const stressCurationPath = join(stress.root, stressPaths.curationPath);
    const stressCuration = JSON.parse(readFileSync(stressCurationPath, "utf8"));
    stressCuration.screenReviews[0].normalCaptureHashes.light = stressCapture.captures.find((capture: { captureClass: string }) => capture.captureClass === "stress").sha256;
    updateVisualRef(stress.manifest, stressPaths.curationPath, writeJson(stressCurationPath, stressCuration), "currentCuration");
    expect(verifyNativeMobileProofManifest(stress.manifest, stress.root)).toContain(
      "native-ios tier 3 catalog-screen must bind both normal light and dark hashes",
    );
  });

});
