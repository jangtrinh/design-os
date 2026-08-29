import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateNativeMobileProofManifest,
  verifyNativeMobileProofManifest,
} from "../scripts/native-mobile-proof/verify-proof-manifest.mjs";
import { copyCheckedProofTree, validManifest } from "./helpers/native-mobile-proof-fixtures.js";

describe("native mobile proof manifest contract", () => {
  it("accepts exactly two provisional arms with six explicit tiers", () => {
    expect(validateNativeMobileProofManifest(validManifest())).toEqual([]);
  });

  it("rejects duplicate or swapped arm identities and assurance escalation", () => {
    const duplicate = validManifest();
    duplicate.arms[1] = structuredClone(duplicate.arms[0]!);
    expect(validateNativeMobileProofManifest(duplicate)).toContain("arms must contain native-ios and native-ipados exactly once");
    const escalated = validManifest();
    escalated.assurance = "QUALIFIED";
    expect(validateNativeMobileProofManifest(escalated)).toContain("assurance must remain PROVISIONAL");
  });

  it("rejects PASS without evidence and forbidden broad claims", () => {
    const manifest = validManifest();
    manifest.arms[0]!.tiers[1]!.status = "PASS";
    manifest.arms[0]!.tiers[1]!.authorizedClaim = "The iOS arm is qualified and works on every device.";
    expect(validateNativeMobileProofManifest(manifest)).toEqual(expect.arrayContaining([
      "native-ios tier 2 PASS requires evidence",
      "native-ios tier 2 authorizedClaim exceeds its evidence tier",
    ]));
  });

  it("rejects physical-device and owner PASS without exact witnesses", () => {
    const manifest = validManifest();
    manifest.arms[0]!.tiers[3]!.status = "PASS";
    manifest.arms[0]!.tiers[5]!.status = "PASS";
    expect(validateNativeMobileProofManifest(manifest)).toEqual(expect.arrayContaining([
      "native-ios tier 4 PASS requires physical device evidence",
      "native-ios tier 6 PASS requires an explicit owner ACCEPT witness",
    ]));
  });

  it("verifies every brief and PASS artifact digest on disk", () => {
    const { manifest, root } = copyCheckedProofTree();
    expect(verifyNativeMobileProofManifest(manifest, root)).toEqual([]);
    const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios")!;
    writeFileSync(join(root, ios.brief.path), "tampered");
    expect(verifyNativeMobileProofManifest(manifest, root)).toContain(
      `native-ios brief digest mismatch: ${ios.brief.path}`,
    );
  });

  it("keeps the checked-in schema and manifest parseable", () => {
    expect(() => JSON.parse(readFileSync("schemas/native-mobile-proof-manifest.schema.json", "utf8"))).not.toThrow();
    expect(() => JSON.parse(readFileSync("showcase/native-mobile-proof-pilot/proof-manifest.json", "utf8"))).not.toThrow();
  });

  it("keeps schema parity for exact arm identities, tier IDs, and PASS evidence", () => {
    const schema = JSON.parse(readFileSync("schemas/native-mobile-proof-manifest.schema.json", "utf8")) as {
      properties: { arms: { allOf?: unknown[] } };
      $defs: {
        arm: { allOf?: unknown[]; properties: { tiers: { allOf?: unknown[] } } };
        tier: { allOf?: unknown[] };
      };
    };
    expect(schema.properties.arms.allOf).toHaveLength(2);
    expect(schema.$defs.arm.allOf).toHaveLength(2);
    expect(schema.$defs.arm.properties.tiers.allOf).toHaveLength(6);
    expect(schema.$defs.tier.allOf).toHaveLength(1);
  });

  it("enforces date-time, additionalProperties, and RFC 3339 calendar rules", () => {
    const malformed = validManifest() as unknown as Record<string, unknown>;
    malformed["generatedAt"] = "not-a-date";
    malformed["unexpected"] = true;
    expect(validateNativeMobileProofManifest(malformed)).toEqual(expect.arrayContaining([
      "generatedAt must be a date-time",
      "manifest has unexpected property: unexpected",
    ]));
    const offset = validManifest();
    offset.generatedAt = "2026-08-29T13:00:00+07:00";
    expect(validateNativeMobileProofManifest(offset)).not.toContain("generatedAt must be a date-time");
    const impossible = validManifest();
    impossible.generatedAt = "2026-02-31T00:00:00Z";
    expect(validateNativeMobileProofManifest(impossible)).toContain("generatedAt must be a date-time");
  });

  it("verifies the complete checked-in manifest in the regular test suite", () => {
    const manifest = JSON.parse(readFileSync("showcase/native-mobile-proof-pilot/proof-manifest.json", "utf8"));
    expect(verifyNativeMobileProofManifest(manifest, "showcase/native-mobile-proof-pilot")).toEqual([]);
  });

  it("keeps the proof-integrity command in pull-request CI", () => {
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain("run: npm run proof:native-mobile");
  });

  it("retains a clean-consumer Tier 1 receipt for each exact arm", () => {
    const report = JSON.parse(readFileSync(
      "showcase/native-mobile-proof-pilot/evidence/tier-01-routing.json", "utf8",
    )) as {
      cleanConsumer: { installedArtifacts: unknown[] };
      activations: Array<{ receipt: Record<string, unknown> }>;
      hostileCases: Array<{ result: { error: { code: string } } }>;
      focusedGate: { totalTests: number; passedTests: number; failedTests: number; success: boolean };
    };
    expect(report.cleanConsumer.installedArtifacts).toHaveLength(10);
    expect(report.activations.map(({ receipt }) => ({
      surface: receipt["requestedSurface"], route: receipt["route"], artifact: receipt["artifact"],
      assurance: receipt["assurance"], claimPolicy: receipt["claimPolicy"],
    }))).toEqual([
      { surface: "native-ios", route: "native-ios", artifact: "native-ios-application", assurance: "PROVISIONAL", claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN" },
      { surface: "native-ipados", route: "native-ipados", artifact: "native-ipados-application", assurance: "PROVISIONAL", claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN" },
    ]);
    expect(report.hostileCases[0]?.result.error.code).toBe("UNKNOWN_CAPABILITY");
    expect(report.focusedGate).toMatchObject({ success: true, failedTests: 0 });
    expect(report.focusedGate.passedTests).toBe(report.focusedGate.totalTests);
  });
});
