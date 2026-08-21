import { describe, expect, it } from "vitest";

import { webTechniqueChecks } from "../src/core/knowledge-web-technique-check.js";

interface CatalogFixture { ledgerJson: string | null; ledgerParts: Record<string, string>; catalogJson: string | null; files: string[]; mdContents: Record<string, string>; skillNames: string[]; verbSkillRefs: Record<string, string[]>; }

const upstream = { repository: "https://github.com/MengTo/Skills.git", revision: "a".repeat(40), capturedAt: "2026-08-21T00:27:35Z", rootLicense: "MIT", rootLicenseEvidence: { path: "LICENSE", mode: "100644", gitObjectId: "d".repeat(40), byteCount: 1064, sha256: "e".repeat(64) } };
const ledger = JSON.stringify({ schemaVersion: 1, id: "mengto-web-techniques--202608", upstream, enumeration: {}, treeRecordCount: 0, blobRecordCount: 0, textArtifactCount: 0, duplicateBlobGroups: [], skillRecordCount: 1, categoryCounts: { core: 1, style: 0, vendor: 0, composite: 0 }, dispositionCounts: { adopted: 1, "covered-existing": 0, rejected: 0 }, parts: [] });
const parts = { "sources/mengto-web-techniques--202608/skills.json": JSON.stringify({ schemaVersion: 1, upstream, expected: {}, skills: [{ skill: "alpha", category: "core", disposition: "adopted", reason: "reuse", techniqueIds: ["MOT-01", "MOT-02"], existingKnowledgeRefs: [] }] }) };
const anatomy = (id: string) => [`## ${id} — Motion`, "### Purpose", "x", "### Trigger", "x", "### Mechanism", "x", "### Anti-use", "x", "### Required fallback", "x", "### Responsive and input behavior", "x", "### Lifecycle and performance downgrade", "x", "### Verification", "x", "### Failure Modes", "x"].join("\n");
const card = `${anatomy("MOT-01")}\n${anatomy("MOT-02")}`;
function fixture(): CatalogFixture {
  return {
    ledgerJson: ledger, ledgerParts: parts,
    catalogJson: JSON.stringify({ schemaVersion: 1, sourceLedger: "knowledge/sources/mengto-web-techniques--202608.json", techniques: [
      { id: "MOT-01", name: "Motion", taxonomy: "motion", card: "knowledge/web-techniques/semantic-motion.md", when: ["motion"], requires: [], handoffSkill: "gsap-motion", applicableWorkflows: ["generate", "refine"] },
      { id: "MOT-02", name: "Reveal", taxonomy: "motion", card: "knowledge/web-techniques/semantic-motion.md", when: ["reveal"], requires: [], handoffSkill: null, applicableWorkflows: [] },
    ] }) as string | null,
    files: ["sources/mengto-web-techniques--202608.json", "sources/mengto-web-techniques--202608/skills.json", "web-techniques/catalog.json", "web-techniques/semantic-motion.md"] as string[],
    mdContents: { "web-techniques/semantic-motion.md": card } as Record<string, string>,
    skillNames: ["gsap-motion"], verbSkillRefs: { generate: ["gsap-motion"], refine: ["gsap-motion"], redesign: [] },
  };
}
const ids = (input = fixture()) => webTechniqueChecks(input).map((finding) => finding.checkId);

describe("web-technique catalog checks", () => {
  it("accepts a complete catalog, ledger mapping, and card anatomy", () => expect(ids()).toEqual([]));
  it("reports adopted ledger mappings when Phase 3 catalog/cards are missing", () => {
    const input = fixture(); input.catalogJson = null; input.files = input.files.filter((path) => !path.startsWith("web-techniques/")); input.mdContents = {};
    expect(ids(input)).toContain("web-technique-catalog-missing");
  });
  it.each([
    ["orphan card", (x: ReturnType<typeof fixture>) => { x.mdContents["web-techniques/orphan.md"] = card; x.files.push("web-techniques/orphan.md"); }, "web-technique-card-orphan"],
    ["missing per-ID anatomy", (x: ReturnType<typeof fixture>) => { x.mdContents["web-techniques/semantic-motion.md"] = anatomy("MOT-01"); }, "web-technique-card-anatomy"],
    ["unknown ledger id", (x: ReturnType<typeof fixture>) => { x.catalogJson = x.catalogJson!.replace("MOT-01", "MOT-99"); }, "web-technique-ledger-id-missing"],
    ["unregistered handoff", (x: ReturnType<typeof fixture>) => { x.catalogJson = x.catalogJson!.replace("gsap-motion", "unknown-skill"); }, "web-technique-handoff-invalid"],
    ["unreachable workflow", (x: ReturnType<typeof fixture>) => { x.catalogJson = x.catalogJson!.replace("refine", "redesign"); }, "web-technique-workflow-invalid"],
  ])("fails %s", (_name, mutate, expected) => { const input = fixture(); mutate(input); expect(ids(input)).toContain(expected); });
  it("fails closed for an unexpected web-technique file", () => { const input = fixture(); input.files.push("web-techniques/nope.json"); expect(ids(input)).toContain("web-technique-path-invalid"); });
  it("rejects embedded binary payloads", () => { const input = fixture(); input.mdContents["web-techniques/semantic-motion.md"] += "\ndata:image/png;base64,AAAA"; expect(ids(input)).toContain("web-technique-embedded-payload"); });
  it("rejects undeclared technique sections inside a family card", () => { const input = fixture(); input.mdContents["web-techniques/semantic-motion.md"] += `\n${anatomy("MOT-99")}`; expect(ids(input)).toContain("web-technique-card-id-drift"); });
  it("rejects anatomy headings whose bodies are empty", () => { const input = fixture(); input.mdContents["web-techniques/semantic-motion.md"] = anatomy("MOT-01").replace(/\nx(?=\n###)/g, "") + `\n${anatomy("MOT-02")}`; expect(ids(input)).toContain("web-technique-card-anatomy"); });
  it("ignores technique anatomy inside fenced examples", () => { const input = fixture(); input.mdContents["web-techniques/semantic-motion.md"] = `\n\`\`\`md\n${card}\n\`\`\`\n`; expect(ids(input)).toContain("web-technique-card-anatomy"); });
  it("fails closed when web-technique files exist without a source ledger", () => { const input = fixture(); input.ledgerJson = null; expect(ids(input)).toContain("web-technique-source-ledger-missing"); });
  it("requires a reachable workflow when a handoff skill is set", () => { const input = fixture(); input.catalogJson = input.catalogJson!.replace('["generate","refine"]', "[]"); expect(ids(input)).toContain("web-technique-workflow-invalid"); });
});
