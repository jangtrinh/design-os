import { describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

const fixture = (name: string): string =>
  `${process.cwd()}/tests/fixtures/capability-activation/${name}.json`;

function mutableKnowledgeCopy(prefix: string): { dir: string; catalog: { profiles: Array<Record<string, unknown>> } } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cpSync(join(process.cwd(), "knowledge"), join(dir, "knowledge"), { recursive: true });
  const catalog = JSON.parse(readFileSync(join(dir, "knowledge", "capability-profiles.json"), "utf8")) as {
    profiles: Array<Record<string, unknown>>;
  };
  return { dir, catalog };
}

describe("ui knowledge activate", () => {
  it("routes native macOS provisionally with a forbidden qualified-delivery claim", () => {
    const result = capture(["knowledge", "activate", fixture("native-macos-words"), "--json"]);
    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.out);
    expect(envelope.data.version).toBe(2);
    expect(envelope.data.routingDisposition).toBe("ROUTED");
    expect(envelope.data.assurance).toBe("PROVISIONAL");
    expect(envelope.data.claimPolicy).toBe("QUALIFIED_DELIVERY_FORBIDDEN");
    expect(envelope.data.route).toBe("native-macos");
    expect(envelope.data.artifact).not.toBe("html");
    expect(envelope.data.selectedKnowledge).toContain("native-macos-craft");
    expect(envelope.data.action).not.toContain("generate");
  });

  it("refuses provisional activation when its registered evidence policy is changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "activate-bad-assurance-"));
    const knowledgeDir = join(dir, "knowledge");
    const receiptDir = join(knowledgeDir, "native-macos");
    mkdirSync(receiptDir, { recursive: true });

    const catalog = JSON.parse(readFileSync(join(process.cwd(), "knowledge", "capability-profiles.json"), "utf8"));
    const native = catalog.profiles.find((profile: { id: string }) => profile.id === "native-macos");
    native.assuranceEvidence = `knowledge/native-macos/pilot-01-evidence.json#sha256:${"a".repeat(64)}`;
    writeFileSync(join(knowledgeDir, "capability-profiles.json"), JSON.stringify(catalog));
    writeFileSync(
      join(receiptDir, "pilot-01-evidence.json"),
      readFileSync(join(process.cwd(), "knowledge", "native-macos", "pilot-01-evidence.json")),
    );

    const result = capture([
      "knowledge", "activate", fixture("native-macos-words"), "--dir", dir, "--json",
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).error).toMatchObject({ code: "BAD_CATALOG" });
    expect(JSON.parse(result.out).error.message).toContain("CAPABILITY_PROFILE_POLICY");
  });

  it("rejects duplicate capability profiles before first-match activation", () => {
    const { dir, catalog } = mutableKnowledgeCopy("activate-duplicate-profile-");
    const native = catalog.profiles.find((profile) => profile["id"] === "native-ios");
    expect(native).toBeDefined();
    catalog.profiles.push(structuredClone(native!));
    writeFileSync(join(dir, "knowledge", "capability-profiles.json"), JSON.stringify(catalog));

    const result = capture(["knowledge", "activate", fixture("native-ios-words"), "--dir", dir, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).error).toMatchObject({ code: "BAD_CATALOG" });
    expect(JSON.parse(result.out).error.message).toContain("CAPABILITY_PROFILE_DUPLICATE");
  });

  it.each([
    ["acceptedInputKinds", ["words"]],
    ["workflow", "generate"],
    ["artifact", "html"],
    ["requiredKnowledge", ["need-routing"]],
    ["machineWitnesses", ["owner-accepted"]],
    ["renderedWitnesses", ["real-device-approved"]],
    ["manualWitnesses", ["owner-accepted"]],
    ["action", "Qualified delivery is approved."],
  ])("rejects provisional profile policy drift in %s", (field, value) => {
    const { dir, catalog } = mutableKnowledgeCopy(`activate-policy-${field}-`);
    const native = catalog.profiles.find((profile) => profile["id"] === "native-ios");
    expect(native).toBeDefined();
    native![field] = value;
    writeFileSync(join(dir, "knowledge", "capability-profiles.json"), JSON.stringify(catalog));

    const result = capture(["knowledge", "activate", fixture("native-ios-words"), "--dir", dir, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).error).toMatchObject({ code: "BAD_CATALOG" });
    expect(JSON.parse(result.out).error.message).toContain("CAPABILITY_PROFILE_POLICY");
  });

  it.each(["native-macos", "native-ios", "native-ipados"])(
    "rejects assurance escalation for registered %s",
    (capabilityId) => {
      const { dir, catalog } = mutableKnowledgeCopy(`activate-assurance-${capabilityId}-`);
      const native = catalog.profiles.find((profile) => profile["id"] === capabilityId);
      expect(native).toBeDefined();
      native!["assurance"] = "qualified";
      writeFileSync(join(dir, "knowledge", "capability-profiles.json"), JSON.stringify(catalog));

      const result = capture([
        "knowledge", "activate", fixture(`${capabilityId}-words`), "--dir", dir, "--json",
      ]);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.out).error).toMatchObject({ code: "BAD_CATALOG" });
      expect(JSON.parse(result.out).error.message).toContain("CAPABILITY_PROFILE_POLICY");
      expect(result.out).not.toContain("QUALIFIED_DELIVERY_ALLOWED");
    },
  );

  it.each(["web-marketing-words", "marketing-for-native-app"])(
    "qualifies %s as marketing HTML",
    (name) => {
      const result = capture(["knowledge", "activate", fixture(name), "--json"]);
      expect(result.code).toBe(0);
      const envelope = JSON.parse(result.out);
      expect(envelope.data.version).toBe(2);
      expect(envelope.data.routingDisposition).toBe("ROUTED");
      expect(envelope.data.assurance).toBe("QUALIFIED");
      expect(envelope.data.claimPolicy).toBe("QUALIFIED_DELIVERY_ALLOWED");
      expect(envelope.data.route).toBe("generate");
      expect(envelope.data.artifact).toBe("html");
      expect(envelope.data.requestDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(envelope.data.catalogDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    },
  );

  it("rejects an unknown surface with the supported profile list", () => {
    const result = capture(["knowledge", "activate", fixture("web-marketing-words"), "--json"]);
    const request = JSON.parse(readFileSync(fixture("web-marketing-words"), "utf8"));
    request.requestedSurface = "native-visionos";
    const dir = mkdtempSync(join(tmpdir(), "activate-"));
    const file = join(dir, "request.json"); writeFileSync(file, JSON.stringify(request));
    const unknown = capture(["knowledge", "activate", file, "--json"]);
    expect(result.code).toBe(0);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.out).error.code).toBe("UNKNOWN_CAPABILITY");
    expect(JSON.parse(unknown.out).data.supportedProfiles).toContain("native-macos");
    expect(JSON.parse(unknown.out).data.supportedProfiles).toContain("native-ios");
    expect(JSON.parse(unknown.out).data.supportedProfiles).toContain("native-ipados");
  });
});
