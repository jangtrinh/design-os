// scripts/lib/checks-files.mjs
//
// PR-001, PR-002 — frozen-file presence and freeze-time JSON-schema validity
// (architecture §H). Split out of checks-freeze.mjs per Article IX / BUILD-CONTRACT
// follow-up: pure move, no behaviour change.
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { FROZEN_FILES } from "./constants.mjs";

// PR-001 files-present — every §A frozen file exists (runs/ and the commitment are
// excluded pre-render, per BUILD-CONTRACT P3).
export function prFilesPresent(ctx) {
  const findings = [];
  for (const rel of FROZEN_FILES) {
    if (!ctx.exists(rel)) findings.push(finding("PR-001", "error", `missing frozen file: ${rel}`, rel));
  }
  return findings;
}

const SCHEMA_MAP = {
  "selection-manifest.json": "schemas/selection-manifest.schema.json",
  "selection-failures.json": "schemas/selection-failure.schema.json",
  "candidate-manifest.json": "schemas/candidate-manifest.schema.json",
  "phase-a-briefs.json": "schemas/phase-a-briefs.schema.json",
  "phase-b-briefs.json": "schemas/phase-b-briefs.schema.json",
};

// PR-002 schema-valid — every freeze-time JSON artifact validates against its
// committed schema. (run-manifest/result/owner-vote/curator-score/commitment are
// validated by the render/reveal checks, at the mode where they first exist.)
export function prSchemaValid(ctx) {
  const findings = [];
  for (const [dataFile, schemaFile] of Object.entries(SCHEMA_MAP)) {
    const schemaRes = ctx.readJSON(schemaFile);
    const dataRes = ctx.readJSON(dataFile);
    if (!schemaRes.ok) {
      findings.push(finding("PR-002", "error", `cannot read schema ${schemaFile}: ${schemaRes.error}`, schemaFile));
      continue;
    }
    if (!dataRes.ok) {
      findings.push(finding("PR-002", "error", `cannot read ${dataFile}: ${dataRes.error}`, dataFile));
      continue;
    }
    for (const e of validate(dataRes.data, schemaRes.data)) {
      findings.push(finding("PR-002", "error", `${dataFile} ${e.path}: ${e.message}`, dataFile));
    }
  }
  return findings;
}
