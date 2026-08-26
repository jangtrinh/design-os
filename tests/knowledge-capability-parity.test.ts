import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { capabilityChecks } from "../src/core/knowledge-capability-check.js";

const catalog = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  version: 1,
  profiles: [{
    id: "web-marketing", status: "qualified", acceptedInputKinds: ["words"],
    workflow: "generate", artifact: "html", requiredKnowledge: ["need-routing"],
    machineWitnesses: ["gate"], renderedWitnesses: ["1440px"],
    manualWitnesses: ["owner-visible-acceptance"],
    qualificationEvidence: "knowledge/qualified-delivery.md",
    ...overrides,
  }],
});

const input = (catalogJson: string) => ({
  catalogJson,
  knowledgeIndexJson: JSON.stringify({ version: 1, entries: [{ id: "need-routing" }] }),
  needRoutingMd: "## Surface activation table\n\n| Surface | Status | Route |\n|---|---|---|\n| `web-marketing` | qualified | `generate` |\n",
  workflowVerbs: ["generate"],
  commandNames: ["gate"],
  repoFiles: ["knowledge/qualified-delivery.md"],
});
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PILOT_EXPECTATION = {
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
};

describe("capability catalog parity", () => {
  it("accepts a profile joined to routing, workflow, knowledge, witness and evidence", () => {
    expect(capabilityChecks(input(catalog()))).toEqual([]);
  });

  it("rejects unknown workflow, knowledge and witness references", () => {
    const findings = capabilityChecks(input(catalog({
      workflow: "native", requiredKnowledge: ["ghost"], machineWitnesses: ["swift-build"],
    })));
    expect(findings.map((f) => f.checkId)).toEqual(expect.arrayContaining([
      "capability-workflow-unknown", "capability-knowledge-unknown", "capability-witness-unknown",
    ]));
  });

  it("rejects an unqualified profile that carries a workflow", () => {
    const findings = capabilityChecks(input(catalog({
      status: "unqualified", workflow: "generate", refusalCode: "CAPABILITY_UNQUALIFIED",
      action: "Stop", qualificationRequirements: ["pilot"], advisoryKnowledge: [],
      qualificationEvidence: "knowledge/native-macos/pilot-01-evidence.json#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })));
    expect(findings.map((f) => f.checkId)).toContain("capability-catalog-bad");
  });

  it("rejects surface table status or route drift", () => {
    const mismatched = input(catalog());
    mismatched.needRoutingMd = mismatched.needRoutingMd.replace("qualified | `generate`", "unqualified | none");
    const ids = capabilityChecks(mismatched).map((finding) => finding.checkId);
    expect(ids).toContain("capability-routing-status-drift");
    expect(ids).toContain("capability-routing-route-drift");
  });

  it("keeps retained native pilot evidence advisory rather than qualifying a route", async () => {
    const catalog = JSON.parse(readFileSync(join(ROOT, "knowledge", "capability-profiles.json"), "utf8")) as {
      profiles: Array<Record<string, unknown>>;
    };
    const native = catalog.profiles.find((profile) => profile["id"] === "native-macos");
    expect(native).toBeDefined();
    if (native === undefined) return;

    expect(native["status"]).toBe("unqualified");
    expect(native["workflow"]).toBeNull();
    expect(native["advisoryKnowledge"]).toContain("native-macos-craft");
    const pin = native["qualificationEvidence"];
    expect(typeof pin).toBe("string");
    if (typeof pin !== "string") return;
    const { verifyCapabilityPilotReceipt } = await import("../src/core/capability-pilot-receipt.js");
    expect(verifyCapabilityPilotReceipt(join(ROOT, "knowledge"), pin, PILOT_EXPECTATION))
      .toMatchObject({ ok: true, receipt: PILOT_EXPECTATION });
  });

  it("indexes and documents native advisory knowledge without a native template, workflow or adapter", () => {
    expect(existsSync(join(ROOT, "knowledge", "native-macos-craft.md"))).toBe(true);
    const index = JSON.parse(readFileSync(join(ROOT, "knowledge", "index.json"), "utf8")) as {
      entries: Array<{ id: string; path: string }>;
    };
    expect(index.entries).toContainEqual({
      id: "native-macos-craft",
      path: "knowledge/native-macos-craft.md",
      description: expect.any(String),
      when: expect.any(Array),
    });
    expect(readFileSync(join(ROOT, "knowledge", "README.md"), "utf8")).toContain("`native-macos-craft.md`");
    const nativeTemplates = ["workflows", "skills"].flatMap((directory) =>
      readdirSync(join(ROOT, "templates", directory)).filter((name) => /native|macos/i.test(name)),
    );
    expect(nativeTemplates).toEqual([]);
    expect(readdirSync(join(ROOT, "src", "adapters")).filter((name) => /native|macos/i.test(name))).toEqual([]);
  });
});
