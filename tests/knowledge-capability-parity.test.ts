import { describe, expect, it } from "vitest";

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
});
