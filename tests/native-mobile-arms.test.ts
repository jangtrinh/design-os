import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";
import { SKILL_NAMES, WORKFLOW_VERBS } from "../src/adapters/templates.js";
import {
  expectedCapabilityPilotReceipt,
  parseCapabilityPilotReceipt,
  verifyCapabilityPilotReceipt,
} from "../src/core/capability-pilot-receipt.js";
import { run } from "../src/cli.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const activationFixture = (name: string): string => join(ROOT, "tests", "fixtures", "capability-activation", `${name}.json`);
const readRepositoryFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

const EXPECTED_PILOT_IDENTITIES = {
  "native-ios": {
    capabilityId: "native-ios",
    pilotId: "native-ios-pilot-01",
    surfaceCategory: "native-gallery-iphone",
    evidenceDisposition: "retained",
    ownerVerdict: "Pending owner-visible acceptance.",
    ownerDisposition: "pending-owner-review",
  },
  "native-ipados": {
    capabilityId: "native-ipados",
    pilotId: "native-ipados-pilot-01",
    surfaceCategory: "native-gallery-ipad-windowed",
    evidenceDisposition: "retained",
    ownerVerdict: "Pending owner-visible acceptance.",
    ownerDisposition: "pending-owner-review",
  },
} as const;

describe("native iOS and iPadOS arms", () => {
  it.each([
    ["native-ios", "native-ios-application", "native-ios-craft"],
    ["native-ipados", "native-ipados-application", "native-ipados-craft"],
  ])("routes %s only through its provisional native arm", (name, artifact, craft) => {
    const result = capture(["knowledge", "activate", activationFixture(`${name}-words`), "--json"]);
    expect(result.code).toBe(0);
    const receipt = JSON.parse(result.out).data as Record<string, unknown>;
    expect(receipt).toMatchObject({
      requestedSurface: name,
      routingDisposition: "ROUTED",
      assurance: "PROVISIONAL",
      claimPolicy: "QUALIFIED_DELIVERY_FORBIDDEN",
      route: name,
      artifact,
    });
    expect(receipt["selectedKnowledge"]).toEqual(expect.arrayContaining(["apple-swiftui-craft", craft]));
    expect(receipt["route"]).not.toBe("generate");
    expect(receipt["artifact"]).not.toBe("html");
  });

  it("registers independent pending-owner pilot identities", () => {
    for (const [capabilityId, identity] of Object.entries(EXPECTED_PILOT_IDENTITIES)) {
      const registered = expectedCapabilityPilotReceipt(capabilityId);
      expect(registered).toMatchObject(identity);
      expect(registered?.sourceEvidencePin).toMatch(
        new RegExp(`^knowledge/${capabilityId}/pilot-01-source-evidence\\.json#sha256:[a-f0-9]{64}$`),
      );
      const receipt = JSON.parse(readRepositoryFile(`knowledge/${capabilityId}/pilot-01-evidence.json`));
      expect(parseCapabilityPilotReceipt(receipt, registered!)).toMatchObject({ ok: true, receipt: identity });
    }
    expect(EXPECTED_PILOT_IDENTITIES["native-ios"].pilotId).not.toBe(EXPECTED_PILOT_IDENTITIES["native-ipados"].pilotId);
  });

  it("rejects cross-platform evidence and a forged accepted owner state", () => {
    const ios = expectedCapabilityPilotReceipt("native-ios");
    const ipad = expectedCapabilityPilotReceipt("native-ipados");
    expect(ios).not.toBeNull();
    expect(ipad).not.toBeNull();
    const iosReceipt = JSON.parse(readRepositoryFile("knowledge/native-ios/pilot-01-evidence.json"));
    expect(parseCapabilityPilotReceipt(iosReceipt, ipad!)).toMatchObject({ ok: false, code: "PILOT_RECEIPT_CAPABILITY" });
    expect(parseCapabilityPilotReceipt({
      ...iosReceipt,
      ownerVerdict: "Accepted",
      ownerDisposition: "accept",
    }, ios!)).toMatchObject({ ok: false, code: "PILOT_RECEIPT_IDENTITY" });
  });

  it("fails closed when source evidence is tampered or swapped between platforms", () => {
    const catalog = JSON.parse(readRepositoryFile("knowledge/capability-profiles.json")) as {
      profiles: Array<{ id: string; assuranceEvidence: string }>;
    };
    const iosPin = catalog.profiles.find((profile) => profile.id === "native-ios")?.assuranceEvidence;
    const ios = expectedCapabilityPilotReceipt("native-ios");
    const ipad = expectedCapabilityPilotReceipt("native-ipados");
    expect(iosPin).toBeDefined();
    expect(ios).not.toBeNull();
    expect(ipad).not.toBeNull();
    if (iosPin === undefined || ios === null || ipad === null) return;

    expect(verifyCapabilityPilotReceipt(join(ROOT, "knowledge"), iosPin, ios)).toMatchObject({ ok: true });
    expect(verifyCapabilityPilotReceipt(join(ROOT, "knowledge"), iosPin, {
      ...ios,
      sourceEvidencePin: `knowledge/native-ios/pilot-01-source-evidence.json#sha256:${"0".repeat(64)}`,
    })).toMatchObject({ ok: false, code: "PILOT_RECEIPT_DIGEST" });
    expect(verifyCapabilityPilotReceipt(join(ROOT, "knowledge"), iosPin, {
      ...ios,
      sourceEvidencePin: ipad.sourceEvidencePin,
    })).toMatchObject({ ok: false, code: "PILOT_SOURCE_EVIDENCE_IDENTITY" });
  });

  it("keeps the receipt schema generic while the registry owns exact identities", () => {
    const schema = JSON.parse(readRepositoryFile("schemas/capability-pilot-receipt.schema.json"));
    expect(schema.properties.capabilityId).toMatchObject({ type: "string", minLength: 1 });
    expect(schema.properties.capabilityId.const).toBeUndefined();
    expect(schema.properties.pilotId.const).toBeUndefined();
  });

  it.each(["native-ios", "native-ipados"])("installs %s workflow-only wrappers without a fake binary verb", (name) => {
    expect(WORKFLOW_VERBS).toContain(name);
    expect(SKILL_NAMES).toContain(`${name}-craft`);
    const artifacts = generateAntigravityAdapter({ cwd: "/tmp/design-os-mobile", templatesRoot: join(ROOT, "templates") });
    const workflow = artifacts.find((item) => item.absPath.endsWith(`/ui-${name}.md`));
    expect(workflow?.content).toContain(`templates/workflows/${name}.md`);
    expect(workflow?.content).toContain("ui knowledge activate");
    expect(workflow?.content).not.toContain(`ui ${name}`);
  });

  it("shares SwiftUI fundamentals but keeps platform craft overlays distinct", () => {
    const shared = readRepositoryFile("knowledge/apple-swiftui-craft.md");
    const ios = readRepositoryFile("knowledge/native-ios-craft.md");
    const ipad = readRepositoryFile("knowledge/native-ipados-craft.md");
    expect(shared).toContain("44 × 44 pt");
    expect(shared).toContain("manualWitnesses");
    expect(ios).toContain("software keyboard");
    expect(ios).toContain("NavigationStack");
    expect(ipad).toContain("resizable");
    expect(ipad).toContain("NavigationSplitView");
    expect(ipad).toContain("pointer");
    expect(ipad).toContain("hardware keyboard");
  });
});
