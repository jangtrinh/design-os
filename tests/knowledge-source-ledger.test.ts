import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { sourceLedgerChecks } from "../src/core/knowledge-source-ledger-check.js";

interface LedgerFixture { manifestJson: string | null; parts: Record<string, string>; files: string[]; }

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const revision = "a".repeat(40);
const upstream = { repository: "https://github.com/MengTo/Skills.git", revision, capturedAt: "2026-08-21T00:27:35Z", rootLicense: "MIT", rootLicenseEvidence: { path: "LICENSE", mode: "100644", gitObjectId: "d".repeat(40), byteCount: 1064, sha256: "e".repeat(64) } };
const tree = JSON.stringify({ schemaVersion: 1, kind: "tree", records: [
  { path: "agent-skills/web-design/README.md", mode: "100644", objectType: "blob", gitObjectId: "f".repeat(40), byteCount: 1, sha256: "f".repeat(64), artifactClass: "root-support", ownerSkill: null, inspectionStatus: "statically-inspected", adoptability: "not-adoptable", thirdPartyMarker: false, licenseEvidence: "repository-support-only", legalDisposition: "metadata-only-quarantine", disposition: "rejected", techniqueIds: [], existingKnowledgeRefs: [], reason: "Root support metadata only" },
  { path: "agent-skills/web-design/alpha/SKILL.md", mode: "100644", objectType: "blob", gitObjectId: "c".repeat(40), byteCount: 1, sha256: "b".repeat(64), artifactClass: "skill", ownerSkill: "alpha", inspectionStatus: "statically-inspected", adoptability: "idea-only", thirdPartyMarker: false, licenseEvidence: "repository-root-MIT", legalDisposition: "idea-only-independent-rewrite", disposition: "adopted", techniqueIds: ["MOT-01"], existingKnowledgeRefs: [], reason: "Reusable mechanism." },
] });
const skills = JSON.stringify({ schemaVersion: 1, upstream, expected: {
  skillRecordCount: 1, categoryCounts: { core: 1, style: 0, vendor: 0, composite: 0 },
  dispositionCounts: { adopted: 1, "covered-existing": 0, rejected: 0 },
}, skills: [{ skill: "alpha", category: "core", disposition: "adopted", reason: "Reusable mechanism.", techniqueIds: ["MOT-01"], existingKnowledgeRefs: [] }] });

function fixture(): LedgerFixture {
  const parts: Record<string, string> = {
    "sources/mengto-web-techniques--202608/tree.json": tree,
    "sources/mengto-web-techniques--202608/skills.json": skills,
  };
  return {
    manifestJson: JSON.stringify({
      schemaVersion: 1, id: "mengto-web-techniques--202608", upstream, enumeration: {},
      treeRecordCount: 2, blobRecordCount: 2, textArtifactCount: 1, duplicateBlobGroups: [],
      skillRecordCount: 1, categoryCounts: { core: 1, style: 0, vendor: 0, composite: 0 },
      dispositionCounts: { adopted: 1, "covered-existing": 0, rejected: 0 },
      parts: [
        { kind: "tree", path: "mengto-web-techniques--202608/tree.json", sha256: sha(tree), recordCount: 2 },
        { kind: "skills", path: "mengto-web-techniques--202608/skills.json", sha256: sha(skills), recordCount: 1 },
      ],
    }),
    parts,
    files: ["sources/mengto-web-techniques--202608.json", ...Object.keys(parts), "motion-craft.md"],
  };
}

function replacePart(input: ReturnType<typeof fixture>, path: string, value: string): void {
  input.parts[path] = value;
  const manifest = JSON.parse(input.manifestJson ?? "{}");
  const part = manifest.parts.find((entry: { path: string }) => `sources/${entry.path}` === path);
  part.sha256 = sha(value);
  input.manifestJson = JSON.stringify(manifest);
}

const ids = (input = fixture()) => sourceLedgerChecks(input).map((finding) => finding.checkId);

describe("source-ledger checks", () => {
  it("accepts a complete, byte-fenced, sorted synthetic ledger", () => {
    expect(sourceLedgerChecks(fixture())).toEqual([]);
  });

  it.each([
    ["unknown manifest key", (x: ReturnType<typeof fixture>) => JSON.stringify({ ...JSON.parse(x.manifestJson ?? "{}"), extra: true }), "source-ledger-invalid"],
    ["bad revision", (x: ReturnType<typeof fixture>) => (x.manifestJson ?? "").replace(revision, "bad"), "source-ledger-invalid"],
    ["changed part bytes", (x: ReturnType<typeof fixture>) => { x.parts["sources/mengto-web-techniques--202608/tree.json"] = "{}"; return x.manifestJson ?? ""; }, "source-ledger-part-hash"],
    ["count drift", (x: ReturnType<typeof fixture>) => JSON.stringify({ ...JSON.parse(x.manifestJson ?? "{}"), treeRecordCount: 3 }), "source-ledger-count-drift"],
    ["empty adopted reason", (x: ReturnType<typeof fixture>) => { replacePart(x, "sources/mengto-web-techniques--202608/skills.json", skills.replace("Reusable mechanism.", "")); return x.manifestJson; }, "source-ledger-decision-invalid"],
    ["bad technique ID", (x: ReturnType<typeof fixture>) => { replacePart(x, "sources/mengto-web-techniques--202608/skills.json", skills.replace("MOT-01", "bad id")); return x.manifestJson; }, "source-ledger-decision-invalid"],
    ["manifest/skills provenance drift", (x: ReturnType<typeof fixture>) => { const changed = JSON.parse(skills); changed.upstream.capturedAt = "2026-08-21T00:27:36Z"; replacePart(x, "sources/mengto-web-techniques--202608/skills.json", JSON.stringify(changed)); return x.manifestJson; }, "source-ledger-provenance-drift"],
  ])("fails %s", (_label, mutate, expected) => {
    const input = fixture();
    input.manifestJson = mutate(input);
    expect(ids(input)).toContain(expected);
  });

  it("rejects duplicate or unsorted source paths and missing adopted mappings", () => {
    const input = fixture();
    replacePart(input, "sources/mengto-web-techniques--202608/tree.json", JSON.stringify({ schemaVersion: 1, kind: "tree", records: [
      { path: "z", mode: "100644", objectType: "blob", gitObjectId: "c".repeat(40), byteCount: 1, sha256: "b".repeat(64), artifactClass: "skill", ownerSkill: "alpha" },
      { path: "z", mode: "100644", objectType: "blob", gitObjectId: "c".repeat(40), byteCount: 1, sha256: "b".repeat(64), artifactClass: "skill", ownerSkill: "alpha" },
    ] }));
    expect(ids(input)).toContain("source-ledger-record-order");
  });

  it("requires a covered-existing decision to retain a live knowledge owner", () => {
    const input = fixture();
    const changed = JSON.parse(skills);
    changed.skills[0].disposition = "covered-existing";
    changed.skills[0].techniqueIds = [];
    changed.expected.dispositionCounts = { adopted: 0, "covered-existing": 1, rejected: 0 };
    replacePart(input, "sources/mengto-web-techniques--202608/skills.json", JSON.stringify(changed));
    const manifest = JSON.parse(input.manifestJson ?? "{}");
    manifest.dispositionCounts = { adopted: 0, "covered-existing": 1, rejected: 0 };
    input.manifestJson = JSON.stringify(manifest);
    expect(ids(input)).toContain("source-ledger-decision-invalid");
  });

  it("rejects an out-of-allowlist ledger path", () => {
    const input = fixture();
    input.files.push("sources/mengto-web-techniques--202608/unexpected.txt");
    expect(ids(input)).toContain("source-ledger-path-invalid");
  });

  it("rejects rehashed source-record semantic drift", () => {
    const input = fixture(); const changed = JSON.parse(tree);
    changed.records[0].techniqueIds = ["MOT-99"];
    replacePart(input, "sources/mengto-web-techniques--202608/tree.json", JSON.stringify(changed));
    expect(ids(input)).toContain("source-ledger-record-drift");
  });

  it("rejects malformed upstream provenance even when manifest and skills agree", () => {
    const input = fixture();
    const changedSkills = JSON.parse(skills);
    changedSkills.upstream = { repository: "", revision, capturedAt: "yesterday", rootLicense: "PROPRIETARY", rootLicenseEvidence: { path: "../outside", mode: "bad", gitObjectId: "x", byteCount: -1, sha256: "x" } };
    replacePart(input, "sources/mengto-web-techniques--202608/skills.json", JSON.stringify(changedSkills));
    const manifest = JSON.parse(input.manifestJson ?? "{}");
    manifest.upstream = changedSkills.upstream;
    input.manifestJson = JSON.stringify(manifest);
    expect(ids(input)).toContain("source-ledger-invalid");
  });

  it("rejects rehashed root-support provenance drift", () => {
    const input = fixture(); const changed = JSON.parse(tree);
    changed.records[0] = { ...changed.records[0], adoptability: "idea-only", inspectionStatus: "not-inspected", thirdPartyMarker: true, licenseEvidence: "none", legalDisposition: "idea-only-independent-rewrite" };
    replacePart(input, "sources/mengto-web-techniques--202608/tree.json", JSON.stringify(changed));
    expect(ids(input)).toContain("source-ledger-record-drift");
  });

  it.each([
    ["path or mode escape", (record: Record<string, unknown>) => Object.assign(record, { path: "agent-skills/web-design/alpha/../escape", mode: "evil", byteCount: -1 })],
    ["non-string skill owner", (record: Record<string, unknown>) => Object.assign(record, { artifactClass: "agent-yaml", ownerSkill: 42 })],
    ["unknown artifact class", (record: Record<string, unknown>) => Object.assign(record, { artifactClass: "unknown-text" })],
  ])("rejects rehashed record grammar drift: %s", (_label, mutate) => {
    const input = fixture(); const changed = JSON.parse(tree);
    mutate(changed.records[1]);
    replacePart(input, "sources/mengto-web-techniques--202608/tree.json", JSON.stringify(changed));
    expect(ids(input)).toContain("source-ledger-invalid");
  });

  it("fails closed when scoped parts exist without their manifest", () => {
    const input = fixture(); input.manifestJson = null;
    expect(ids(input)).toContain("source-ledger-missing");
  });
});
