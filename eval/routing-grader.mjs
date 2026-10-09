#!/usr/bin/env node
/**
 * Deterministic grader for the routing-accuracy benchmark — the committed half
 * of the harness, so grading rules are executable, not prose (no model grades
 * itself; rerun contract: docs/routing-benchmark.md).
 *
 * Usage:  node eval/routing-grader.mjs [--require-complete] <prompts.json> <decisions.json>
 *   prompts.json    the committed asset (eval/routing-prompts.json)
 *   decisions.json  [{id, route: string[], ask: "none"|"ask-1"|"ask-2"|"ask-3",
 *                     variants?: boolean}] from any blind-router harness
 *
 * Rules (the single authority — a run report may quote but never redefine):
 *   verb            pass = ask "none" AND route[0] === expectedRoute[0]
 *   must-ask        pass = ask === expectedAsk (the route is IGNORED: a router
 *                   that asks correctly may still sketch a tentative route)
 *   selection-route pass = ask "none" AND route[0] === expectedRoute[0];
 *                   `variants` is tracked informationally (no target yet)
 *   composite       pass = ask "none" AND route equals expectedRoute exactly,
 *                   same order, same length
 * Partial runs are supported: only ids present in decisions are graded, and
 * the output names how many of the full set were covered — a subset is never
 * silently presented as the whole (no silent caps).
 */
import { readFileSync } from "node:fs";

const rawArgs = process.argv.slice(2);
let requireComplete = false;
const positional = [];

for (const arg of rawArgs) {
  if (arg === "--require-complete") {
    requireComplete = true;
  } else if (arg.startsWith("-")) {
    console.error(`unknown option "${arg}"\nusage: node eval/routing-grader.mjs [--require-complete] <prompts.json> <decisions.json>`);
    process.exit(2);
  } else {
    positional.push(arg);
  }
}

if (positional.length !== 2) {
  console.error("usage: node eval/routing-grader.mjs [--require-complete] <prompts.json> <decisions.json>");
  process.exit(2);
}

const [promptsPath, decisionsPath] = positional;

function failInput(msg) {
  console.error(msg);
  process.exit(2);
}

function readFileJson(filePath, label) {
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (err) {
    failInput(`Error reading ${label} file at "${filePath}": ${err.message}`);
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    failInput(`Invalid JSON in ${label} file at "${filePath}": ${err.message}`);
  }
}

const rawCorpus = readFileJson(promptsPath, "prompts");
if (!rawCorpus || typeof rawCorpus !== "object" || Array.isArray(rawCorpus) || !Array.isArray(rawCorpus.prompts)) {
  failInput(`Corrupt prompts corpus in "${promptsPath}": root must be an object with "prompts" array`);
}

const VALID_CATEGORIES = new Set(["verb", "must-ask", "selection-route", "composite"]);
const VALID_ASKS = new Set(["none", "ask-1", "ask-2", "ask-3"]);
const VALID_MUST_ASKS = new Set(["ask-1", "ask-2", "ask-3"]);

const corpusPrompts = rawCorpus.prompts;
const seenPromptIds = new Set();
const corpusPromptMap = new Map();

for (let i = 0; i < corpusPrompts.length; i++) {
  const p = corpusPrompts[i];
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    failInput(`Corrupt prompt entry at index ${i} in "${promptsPath}": entry must be an object`);
  }
  if (typeof p.id !== "string" || p.id.trim() === "") {
    failInput(`Invalid prompt at index ${i} in "${promptsPath}": "id" must be a nonempty string`);
  }
  if (seenPromptIds.has(p.id)) failInput(`Duplicate prompt id "${p.id}" in "${promptsPath}"`);
  seenPromptIds.add(p.id);

  if (!VALID_CATEGORIES.has(p.category)) {
    failInput(`Invalid category "${p.category}" for prompt "${p.id}" in "${promptsPath}"`);
  }
  if (typeof p.prompt !== "string") {
    failInput(`Invalid prompt text for prompt "${p.id}" in "${promptsPath}": "prompt" must be a string`);
  }
  if (!Array.isArray(p.expectedRoute) || !p.expectedRoute.every((r) => typeof r === "string" && r.trim() !== "")) {
    failInput(`Invalid expectedRoute for prompt "${p.id}" in "${promptsPath}": must be an array of nonempty strings`);
  }
  if (p.category === "must-ask") {
    if (!VALID_MUST_ASKS.has(p.expectedAsk)) {
      failInput(`Invalid expectedAsk "${p.expectedAsk}" for must-ask prompt "${p.id}" in "${promptsPath}": must be one of ask-1, ask-2, ask-3`);
    }
  } else if (p.expectedRoute.length === 0) {
    failInput(`Invalid expectedRoute for non-must-ask prompt "${p.id}" in "${promptsPath}": route cannot be empty`);
  }
  corpusPromptMap.set(p.id, p);
}

const rawDecisions = readFileJson(decisionsPath, "decisions");
if (!Array.isArray(rawDecisions)) {
  failInput(`Invalid decisions in "${decisionsPath}": root must be an array`);
}

const seenDecisionIds = new Set();
const decisionsMap = new Map();

for (let i = 0; i < rawDecisions.length; i++) {
  const d = rawDecisions[i];
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    failInput(`Invalid decision entry at index ${i} in "${decisionsPath}": entry must be an object`);
  }
  if (typeof d.id !== "string" || d.id.trim() === "") {
    failInput(`Invalid decision at index ${i} in "${decisionsPath}": "id" must be a nonempty string`);
  }
  if (seenDecisionIds.has(d.id)) failInput(`Duplicate decision id "${d.id}" in "${decisionsPath}"`);
  seenDecisionIds.add(d.id);

  if (!corpusPromptMap.has(d.id)) {
    failInput(`Unknown decision id "${d.id}" in "${decisionsPath}": not present in corpus "${promptsPath}"`);
  }
  if (!VALID_ASKS.has(d.ask)) {
    failInput(`Invalid ask "${d.ask}" for decision "${d.id}" in "${decisionsPath}": must be one of none, ask-1, ask-2, ask-3`);
  }
  if (!Array.isArray(d.route) || !d.route.every((r) => typeof r === "string")) {
    failInput(`Invalid route for decision "${d.id}" in "${decisionsPath}": route must be an array of strings`);
  }
  if (d.ask === "none" && d.route.length === 0) {
    failInput(`Invalid route for decision "${d.id}" in "${decisionsPath}": route cannot be empty when ask is "none"`);
  }
  if (d.variants !== undefined && typeof d.variants !== "boolean") {
    failInput(`Invalid variants for decision "${d.id}" in "${decisionsPath}": variants must be boolean if present`);
  }
  decisionsMap.set(d.id, d);
}

const missingIds = corpusPrompts.filter((p) => !decisionsMap.has(p.id)).map((p) => p.id);
if (requireComplete && missingIds.length > 0) {
  failInput(`Missing ${missingIds.length} decision id(s) with --require-complete in "${decisionsPath}": ${missingIds.join(", ")}`);
}

const graded = [];
for (const p of corpusPrompts) {
  const d = decisionsMap.get(p.id);
  if (d === undefined) continue; // partial run — reported in coverage below
  let pass;
  if (p.category === "verb" || p.category === "selection-route") {
    pass = d.ask === "none" && d.route[0] === p.expectedRoute[0];
  } else if (p.category === "must-ask") {
    pass = d.ask === p.expectedAsk;
  } else {
    pass = d.ask === "none" && d.route.length === p.expectedRoute.length && d.route.every((v, i) => v === p.expectedRoute[i]);
  }
  graded.push({
    id: p.id, category: p.category, pass,
    expected: p.expectedRoute, expectedAsk: p.expectedAsk ?? null,
    got: { route: d.route, ask: d.ask, variants: d.variants ?? false },
    prompt: p.prompt,
  });
}

const cats = ["verb", "must-ask", "selection-route", "composite"];
const summary = {};
for (const c of cats) {
  const all = corpusPrompts.filter((p) => p.category === c);
  const g = graded.filter((x) => x.category === c);
  const passed = g.filter((x) => x.pass).length;
  summary[c] = {
    covered: `${g.length}/${all.length}`, passed,
    pct: g.length === 0 ? null : Math.round((100 * passed) / g.length),
  };
}
const sel = graded.filter((x) => x.category === "selection-route");
summary.tasteInterrogations = sel.filter((x) => x.got.ask !== "none").length;
summary.variantsOffered = sel.filter((x) => x.got.variants).length;

const coverage = {
  covered: graded.length, total: corpusPrompts.length,
  complete: missingIds.length === 0, missingIds,
};

console.log(JSON.stringify({ coverage, summary, misses: graded.filter((x) => !x.pass) }, null, 2));
