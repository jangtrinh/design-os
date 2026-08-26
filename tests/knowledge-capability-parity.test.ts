import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { capabilityChecks } from "../src/core/knowledge-capability-check.js";
import { SKILL_NAMES, WORKFLOW_VERBS } from "../src/adapters/templates.js";

const catalog = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  version: 2,
  profiles: [{
    id: "web-marketing", availability: "available", assurance: "qualified", acceptedInputKinds: ["words"],
    workflow: "generate", artifact: "html", requiredKnowledge: ["need-routing"],
    machineWitnesses: ["gate"], renderedWitnesses: ["1440px"],
    manualWitnesses: ["owner-visible-acceptance"],
    assuranceEvidence: "knowledge/qualified-delivery.md",
    ...overrides,
  }],
});

const input = (catalogJson: string) => ({
  catalogJson,
  knowledgeIndexJson: JSON.stringify({ version: 1, entries: [{ id: "need-routing" }] }),
  needRoutingMd: "## Surface activation table\n\n| Surface | Availability | Assurance | Candidate route |\n|---|---|---|---|\n| `web-marketing` | available | qualified | `generate` |\n",
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

  it("rejects an unavailable profile that carries a workflow", () => {
    const findings = capabilityChecks(input(catalog({
      availability: "unavailable", assurance: "unassessed", workflow: "generate", refusalCode: "CAPABILITY_UNQUALIFIED",
      action: "Stop", qualificationRequirements: ["pilot"], advisoryKnowledge: [],
      assuranceEvidence: "knowledge/native-macos/pilot-01-evidence.json#sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })));
    expect(findings.map((f) => f.checkId)).toContain("capability-catalog-bad");
  });

  it("rejects surface table status or route drift", () => {
    const mismatched = input(catalog());
    mismatched.needRoutingMd = mismatched.needRoutingMd.replace("available | qualified | `generate`", "unavailable | unassessed | none");
    const ids = capabilityChecks(mismatched).map((finding) => finding.checkId);
    expect(ids).toContain("capability-routing-availability-drift");
    expect(ids).toContain("capability-routing-assurance-drift");
    expect(ids).toContain("capability-routing-route-drift");
  });

  it("keeps retained native pilot evidence provisional rather than qualified", async () => {
    const catalog = JSON.parse(readFileSync(join(ROOT, "knowledge", "capability-profiles.json"), "utf8")) as {
      version: number;
      profiles: Array<Record<string, unknown>>;
    };
    const native = catalog.profiles.find((profile) => profile["id"] === "native-macos");
    expect(native).toBeDefined();
    if (native === undefined) return;

    expect(catalog["version"]).toBe(2);
    expect(native["availability"]).toBe("available");
    expect(native["assurance"]).toBe("provisional");
    expect(native["workflow"]).toBe("native-macos");
    expect(native["requiredKnowledge"]).toContain("native-macos-craft");
    const pin = native["assuranceEvidence"];
    expect(typeof pin).toBe("string");
    if (typeof pin !== "string") return;
    const { verifyCapabilityPilotReceipt } = await import("../src/core/capability-pilot-receipt.js");
    expect(verifyCapabilityPilotReceipt(join(ROOT, "knowledge"), pin, PILOT_EXPECTATION))
      .toMatchObject({ ok: true, receipt: PILOT_EXPECTATION });
  });

  it("indexes and documents the official provisional native workflow and craft skill", () => {
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
    expect(readdirSync(join(ROOT, "templates", "workflows"))).toContain("native-macos.md");
    expect(readdirSync(join(ROOT, "templates", "skills"))).toContain("native-macos-craft.md");
    expect(WORKFLOW_VERBS).toContain("native-macos");
    expect(SKILL_NAMES).toContain("native-macos-craft");
  });
});
