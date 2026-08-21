#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [promptsPath, decisionsPath] = process.argv.slice(2);
if (!promptsPath || !decisionsPath) {
  console.error("usage: node eval/web-technique-routing-grader.mjs <prompts.json> <decisions.json>");
  process.exit(2);
}

let prompts; let catalog; let decisionRows;
try {
  prompts = JSON.parse(readFileSync(promptsPath, "utf8"));
  catalog = JSON.parse(readFileSync(prompts.catalog, "utf8"));
  decisionRows = JSON.parse(readFileSync(decisionsPath, "utf8"));
} catch {
  console.log(JSON.stringify({ summary: { covered: "0/0", passed: 0 }, misses: [{ id: "input", pass: false, problems: ["input-json-invalid"] }] }, null, 2));
  process.exit(1);
}
const validRows = (rows) => Array.isArray(rows) && rows.every((row) => row && typeof row === "object" && typeof row.id === "string" && row.id.trim() !== "");
const uniqueIds = (rows) => new Set(rows.map((row) => row.id)).size === rows.length;
if (!prompts || typeof prompts.catalog !== "string" || !validRows(prompts.briefs) || !uniqueIds(prompts.briefs) || !catalog || !validRows(catalog.techniques) || !uniqueIds(catalog.techniques) || !validRows(decisionRows)) {
  console.log(JSON.stringify({ summary: { covered: `0/${Array.isArray(prompts?.briefs) ? prompts.briefs.length : 0}`, passed: 0 }, misses: [{ id: "input", pass: false, problems: ["input-shape-invalid"] }] }, null, 2));
  process.exit(1);
}
const decisions = new Map(decisionRows.map((row) => [row.id, row]));
const decisionIdCounts = new Map();
for (const row of decisionRows) decisionIdCounts.set(row.id, (decisionIdCounts.get(row.id) ?? 0) + 1);
const knownIds = new Set(catalog.techniques.map((row) => row.id));
const briefIds = new Set(prompts.briefs.map((row) => row.id));
const idPattern = /\b[A-Z][A-Z0-9]*-\d{2}\b/g;

function directionProblems(direction) {
  if (!direction || typeof direction !== "object" || Array.isArray(direction)) return ["direction-shape-invalid"];
  const { signatureTechnique } = direction;
  if (typeof signatureTechnique !== "string" || signatureTechnique.trim() === "") return ["empty-signature-technique"];
  const ids = signatureTechnique.match(idPattern) ?? [];
  if (ids.length === 0) return [];
  if (ids.length > 1) return ["multiple-catalog-ids"];
  if (!knownIds.has(ids[0])) return ["unknown-catalog-id"];
  return signatureTechnique.startsWith(`${ids[0]} — `) ? [] : ["catalog-format-invalid"];
}

const graded = [];
for (const brief of prompts.briefs) {
  const decision = decisions.get(brief.id);
  if (decision === undefined) {
    graded.push({ id: brief.id, pass: false, problems: ["decision-missing"] });
    continue;
  }
  const problems = decisionIdCounts.get(brief.id) === 1 ? [] : ["decision-id-duplicate"];
  if (decision.questionsAsked !== 0) problems.push("technique-question-asked");
  const directionRows = Array.isArray(decision.directions) ? decision.directions : [];
  if (directionRows.length !== 3) problems.push("direction-count-invalid");
  const primaryIds = [];
  for (const direction of directionRows) {
    problems.push(...directionProblems(direction));
    const signature = direction && typeof direction === "object" ? direction.signatureTechnique : null;
    const ids = typeof signature === "string" ? signature.match(idPattern) ?? [] : [];
    if (ids.length === 1 && knownIds.has(ids[0])) primaryIds.push(ids[0]);
  }
  if (new Set(primaryIds).size !== primaryIds.length) problems.push("primary-id-repeated");
  graded.push({ id: brief.id, pass: problems.length === 0, problems });
}
for (const row of decisionRows) {
  if (!briefIds.has(row.id)) graded.push({ id: row.id, pass: false, problems: ["unknown-brief-id"] });
}

const covered = prompts.briefs.filter((brief) => decisions.has(brief.id)).length;
const output = { summary: { covered: `${covered}/${prompts.briefs.length}`, passed: graded.filter((row) => row.pass).length }, misses: graded.filter((row) => !row.pass) };
console.log(JSON.stringify(output, null, 2));
if (output.misses.length > 0) process.exitCode = 1;
