#!/usr/bin/env node
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import {
  duplicateBlobGroups, enumerate, findNeuformOwners, parseArgs, readJson, sha256, sourceRecord,
  validateDecisions, verifyRootLicenseEvidence, writeJson,
} from "./lib/mengto-web-technique-source.mjs";

try {
  const options = parseArgs(process.argv.slice(2), ["corpus", "revision", "ledger"]);
  const ledgerPath = resolve(options.ledger);
  const ledgerDir = dirname(ledgerPath);
  const decisionsPath = options.decisions
    ? resolve(options.decisions)
    : resolve(ledgerDir, basename(ledgerPath, ".json"), "skills.json");
  if (!decisionsPath.startsWith(`${ledgerDir}/`)) throw new Error("decisions must be inside the ledger directory");
  const decisions = readJson(decisionsPath);
  const counts = validateDecisions(decisions, options.revision);
  verifyRootLicenseEvidence(options.corpus, options.revision, decisions.upstream);
  const entries = enumerate(options.corpus, options.revision);
  if (entries.length === 0) throw new Error("git enumeration returned no source records");
  const skillMap = new Map(decisions.skills.map((row) => [row.skill, row]));
  const neuformOwners = findNeuformOwners(options.corpus, entries);
  const records = entries.map((entry) => sourceRecord(options.corpus, entry, skillMap, neuformOwners));
  const partDir = resolve(ledgerDir, "mengto-web-techniques--202608");
  const treePath = resolve(partDir, "tree.json");
  mkdirSync(partDir, { recursive: true });
  writeJson(treePath, { schemaVersion: 1, kind: "tree", records });
  const treeBytes = readFileSync(treePath);
  const decisionsBytes = readFileSync(decisionsPath);
  const blobs = records.filter((record) => record.objectType === "blob");
  writeJson(ledgerPath, {
    schemaVersion: 1,
    id: "mengto-web-techniques--202608",
    upstream: decisions.upstream,
    enumeration: { scope: "agent-skills/web-design", command: "git ls-tree -r -t -l --full-tree <revision> -- agent-skills/web-design" },
    treeRecordCount: records.length,
    blobRecordCount: blobs.length,
    textArtifactCount: blobs.filter((record) => !["binary-asset", "root-support"].includes(record.artifactClass)).length,
    duplicateBlobGroups: duplicateBlobGroups(records),
    ...counts,
    parts: [
      { kind: "tree", path: relative(ledgerDir, treePath), sha256: sha256(treeBytes), recordCount: records.length },
      { kind: "skills", path: relative(ledgerDir, decisionsPath), sha256: sha256(decisionsBytes), recordCount: decisions.skills.length },
    ],
  });
  process.stdout.write(`generated ${records.length} pinned source records\n`);
} catch (error) {
  process.stderr.write(`source ledger generation failed: ${error.message}\n`);
  process.exitCode = 1;
}
