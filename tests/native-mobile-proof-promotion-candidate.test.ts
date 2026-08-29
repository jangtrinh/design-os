import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { verifyPromotionCandidate } from "../scripts/native-mobile-proof/verify-promotion-candidate.mjs";
import { copyCheckedProofTree, writeJson } from "./helpers/native-mobile-proof-fixtures.js";

const generatedPath = "evidence/tier-02-generated-apps.json";

function mutateNativeIos(root: string, mutate: (entry: Record<string, unknown>) => void) {
  const path = join(root, generatedPath);
  const document = JSON.parse(readFileSync(path, "utf8")) as {
    arms: Array<Record<string, unknown>>;
  };
  const entry = document.arms.find((arm) => arm.capabilityId === "native-ios");
  if (!entry) throw new Error("native-ios generated evidence is absent");
  mutate(entry);
  writeJson(path, document);
}

describe("TocChien native iOS promotion candidate", () => {
  it("refuses to rerun after the exact subject has been promoted", () => {
    const proof = copyCheckedProofTree();
    expect(verifyPromotionCandidate(proof.root).findings).toEqual([
      "candidate gate must run before policy promotion",
      "candidate tier 2 generated evidence identity mismatch",
    ]);
  });

  it("replays the activation request and current catalog instead of trusting receipt digests", () => {
    const requestProof = copyCheckedProofTree();
    const requestPath = join(
      requestProof.root,
      "generator-packets/native-ios-tocchien-modernization-activation-request.json",
    );
    const request = JSON.parse(readFileSync(requestPath, "utf8")) as Record<string, unknown>;
    request.rawRequest = `${request.rawRequest as string} drift`;
    writeJson(requestPath, request);
    expect(verifyPromotionCandidate(requestProof.root).findings).toContain(
      "candidate activation receipt identity mismatch",
    );

    const receiptProof = copyCheckedProofTree();
    const receiptPath = join(
      receiptProof.root,
      "apps/native-ios-tocchien-modernization/activation-receipt.json",
    );
    const envelope = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      data: Record<string, unknown>;
    };
    envelope.data.catalogDigest = `sha256:${"0".repeat(64)}`;
    writeJson(receiptPath, envelope);
    expect(verifyPromotionCandidate(receiptProof.root).findings).toContain(
      "candidate activation receipt identity mismatch",
    );
  });

  it("rejects missing or extra controller harness declarations", () => {
    for (const mutate of [
      (entry: Record<string, unknown>) => { delete entry.controllerVerificationHarnessFiles; },
      (entry: Record<string, unknown>) => {
        const files = entry.controllerVerificationHarnessFiles as Array<Record<string, unknown>>;
        files.push({ ...files[0] });
      },
    ]) {
      const proof = copyCheckedProofTree();
      mutateNativeIos(proof.root, mutate);
      expect(verifyPromotionCandidate(proof.root).findings).toContain(
        "candidate tier 2 generated evidence identity mismatch",
      );
    }
  });

  it("rejects a production path disguised as verification harness", () => {
    const proof = copyCheckedProofTree();
    mutateNativeIos(proof.root, (entry) => {
      entry.controllerVerificationHarnessFiles = [{
        path: "TocChienModernization/Views/ChampionCatalogView.swift",
        sha256: "e6323d21c3b8af0f7bd4ce67789e866ca6d7c14a3254cd42fdbcde29f007eec5",
      }];
    });
    expect(verifyPromotionCandidate(proof.root).findings).toContain(
      "candidate tier 2 generated evidence identity mismatch",
    );
  });
});
