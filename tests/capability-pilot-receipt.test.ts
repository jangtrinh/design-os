import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RECEIPT = {
  kind: "design-os.capability-pilot-receipt",
  version: 1,
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
};
const EXPECTED = {
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
};
const temporaryRoots: string[] = [];

const sha256 = (bytes: string | Uint8Array): string =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const temporaryKnowledgeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "capability-pilot-receipt-"));
  temporaryRoots.push(root);
  return root;
};
const writeReceipt = (root: string, raw: string): string => {
  const dir = join(root, "native-macos");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "pilot-01-evidence.json");
  writeFileSync(file, raw, "utf8");
  return file;
};
const pilotReceiptApi = () => import("../src/core/capability-pilot-receipt.js");

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("capability pilot receipt", () => {
  it("declares the exact retained native pilot receipt schema", () => {
    const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "capability-pilot-receipt.schema.json"), "utf8")) as {
      properties: Record<string, { const: unknown }>;
    };
    for (const [key, value] of Object.entries(RECEIPT)) expect(schema.properties[key]?.const).toBe(value);
  });

  it("accepts the exact retained native pilot fields", async () => {
    const { parseCapabilityPilotReceipt } = await pilotReceiptApi();
    expect(parseCapabilityPilotReceipt(RECEIPT, EXPECTED)).toMatchObject({ ok: true, receipt: RECEIPT });
  });

  it("exposes native pilot-01 as the only registered production identity", async () => {
    const { expectedCapabilityPilotReceipt } = await pilotReceiptApi();
    expect(expectedCapabilityPilotReceipt("native-macos")).toEqual(EXPECTED);
    expect(expectedCapabilityPilotReceipt("unregistered-native")).toBeNull();
  });

  it.each([
    ["kind", { ...RECEIPT, kind: "unknown" }, "PILOT_RECEIPT_KIND"],
    ["version", { ...RECEIPT, version: 2 }, "PILOT_RECEIPT_VERSION"],
    ["capability", { ...RECEIPT, capabilityId: "web-marketing" }, "PILOT_RECEIPT_CAPABILITY"],
  ])("fails closed on an invalid %s", async (_field, value, code) => {
    const { parseCapabilityPilotReceipt } = await pilotReceiptApi();
    expect(parseCapabilityPilotReceipt(value, EXPECTED)).toMatchObject({ ok: false, code });
  });

  it("fails closed on a duplicate pilot ID", async () => {
    const { parseCapabilityPilotReceipt } = await pilotReceiptApi();
    expect(parseCapabilityPilotReceipt(RECEIPT, EXPECTED, new Set([RECEIPT.pilotId])))
      .toMatchObject({ ok: false, code: "PILOT_RECEIPT_DUPLICATE" });
  });

  it("rejects receipt traversal and a symlink outside knowledge", async () => {
    const { verifyCapabilityPilotReceipt } = await pilotReceiptApi();
    const knowledgeRoot = temporaryKnowledgeRoot();
    const outsideRoot = temporaryKnowledgeRoot();
    const outside = join(outsideRoot, "outside.json");
    writeFileSync(outside, JSON.stringify(RECEIPT), "utf8");
    symlinkSync(outside, join(knowledgeRoot, "outside.json"));

    expect(verifyCapabilityPilotReceipt(knowledgeRoot,
      `knowledge/../outside.json#${"sha256:" + "0".repeat(64)}`, EXPECTED))
      .toMatchObject({ ok: false, code: "PILOT_RECEIPT_PATH" });
    expect(verifyCapabilityPilotReceipt(knowledgeRoot,
      `knowledge/outside.json#${sha256(readFileSync(outside))}`, EXPECTED))
      .toMatchObject({ ok: false, code: "PILOT_RECEIPT_PATH" });
  });

  it("checks the SHA-256 of the exact stored receipt bytes", async () => {
    const { verifyCapabilityPilotReceipt } = await pilotReceiptApi();
    const knowledgeRoot = temporaryKnowledgeRoot();
    const raw = `${JSON.stringify(RECEIPT, null, 2)}\n`;
    const file = writeReceipt(knowledgeRoot, raw);
    const pin = `knowledge/native-macos/pilot-01-evidence.json#${sha256(raw)}`;

    expect(verifyCapabilityPilotReceipt(knowledgeRoot, pin, EXPECTED)).toMatchObject({ ok: true, receipt: RECEIPT });
    writeFileSync(file, `${raw}\n`, "utf8");
    expect(verifyCapabilityPilotReceipt(knowledgeRoot, pin, EXPECTED))
      .toMatchObject({ ok: false, code: "PILOT_RECEIPT_DIGEST" });
  });
});
