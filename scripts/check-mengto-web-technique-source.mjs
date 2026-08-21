#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  duplicateBlobGroups, enumerate, findNeuformOwners, parseArgs, readJson, sha256, sourceRecord,
  validateDecisions, verifyRootLicenseEvidence,
} from "./lib/mengto-web-technique-source.mjs";

function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  const options = parseArgs(process.argv.slice(2), ["corpus", "revision", "ledger"]);
  const ledgerPath = resolve(options.ledger);
  const ledgerDir = dirname(ledgerPath);
  const manifest = readJson(ledgerPath);
  assert(manifest.schemaVersion === 1, "manifest schemaVersion must be 1");
  assert(manifest.upstream?.revision === options.revision, "manifest revision mismatch");
  assert(Array.isArray(manifest.parts) && manifest.parts.length === 2, "manifest must contain tree and skills parts");
  const loaded = new Map();
  for (const part of manifest.parts) {
    const path = resolve(ledgerDir, part.path);
    const bytes = readFileSync(path);
    assert(sha256(bytes) === part.sha256, `${part.kind} part SHA-256 mismatch`);
    const value = JSON.parse(bytes.toString("utf8"));
    const rows = part.kind === "tree" ? value.records : value.skills;
    assert(Array.isArray(rows) && rows.length === part.recordCount, `${part.kind} part record count mismatch`);
    loaded.set(part.kind, value);
  }
  const decisions = loaded.get("skills");
  assert(JSON.stringify(manifest.upstream) === JSON.stringify(decisions.upstream), "manifest/decisions upstream provenance mismatch");
  const counts = validateDecisions(decisions, options.revision);
  verifyRootLicenseEvidence(options.corpus, options.revision, decisions.upstream);
  for (const [key, value] of Object.entries(counts)) assert(JSON.stringify(manifest[key]) === JSON.stringify(value), `manifest ${key} mismatch`);
  const records = loaded.get("tree").records;
  assert(records.length === manifest.treeRecordCount, "manifest treeRecordCount mismatch");
  for (let index = 1; index < records.length; index += 1) assert(records[index - 1].path < records[index].path, "tree part records are not bytewise path-sorted");
  const actual = enumerate(options.corpus, options.revision);
  assert(actual.length === records.length, "source/ledger record count mismatch");
  const skillMap = new Map(decisions.skills.map((row) => [row.skill, row]));
  const neuformOwners = findNeuformOwners(options.corpus, actual);
  for (let index = 0; index < actual.length; index += 1) {
    const source = actual[index];
    const record = records[index];
    const expectedRecord = sourceRecord(options.corpus, source, skillMap, neuformOwners);
    assert(JSON.stringify(record) === JSON.stringify(expectedRecord), `source/ledger semantic record mismatch for ${source.path}`);
  }
  const declaredSkills = [...skillMap.keys()].sort();
  const ownerSkills = records.filter((record) => record.artifactClass === "skill").map((record) => record.ownerSkill).sort();
  assert(JSON.stringify(declaredSkills) === JSON.stringify(ownerSkills), "decision skills do not exactly match source skill owners");
  const blobs = records.filter((record) => record.objectType === "blob");
  assert(blobs.length === manifest.blobRecordCount, "manifest blobRecordCount mismatch");
  assert(blobs.filter((record) => !["binary-asset", "root-support"].includes(record.artifactClass)).length === manifest.textArtifactCount, "manifest textArtifactCount mismatch");
  assert(JSON.stringify(duplicateBlobGroups(records)) === JSON.stringify(manifest.duplicateBlobGroups), "manifest duplicateBlobGroups mismatch");
  process.stdout.write(`verified ${records.length} pinned source records\n`);
} catch (error) {
  process.stderr.write(`source ledger verification failed: ${error.message}\n`);
  process.exitCode = 1;
}
