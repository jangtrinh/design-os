#!/usr/bin/env node
/**
 * Deterministic grader for the routing-accuracy benchmark — the committed half
 * of the harness, so grading rules are executable, not prose (no model grades
 * itself; rerun contract: docs/routing-benchmark.md).
 *
 * Usage:  node eval/routing-grader.mjs <prompts.json> <decisions.json>
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

const [promptsPath, decisionsPath] = process.argv.slice(2);
if (!promptsPath || !decisionsPath) {
  console.error("usage: node eval/routing-grader.mjs <prompts.json> <decisions.json>");
  process.exit(2);
}

const prompts = JSON.parse(readFileSync(promptsPath, "utf8")).prompts;
const decisions = new Map(
  JSON.parse(readFileSync(decisionsPath, "utf8")).map((d) => [d.id, d]),
);

const graded = [];
for (const p of prompts) {
  const d = decisions.get(p.id);
  if (d === undefined) continue; // partial run — reported in coverage below
  let pass = false;
  if (p.category === "verb" || p.category === "selection-route") {
    pass = d.ask === "none" && d.route[0] === p.expectedRoute[0];
  } else if (p.category === "must-ask") {
    pass = d.ask === p.expectedAsk;
  } else {
    pass =
      d.ask === "none" &&
      d.route.length === p.expectedRoute.length &&
      d.route.every((v, i) => v === p.expectedRoute[i]);
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
  const all = prompts.filter((p) => p.category === c);
  const g = graded.filter((x) => x.category === c);
  const passed = g.filter((x) => x.pass).length;
  summary[c] = {
    covered: `${g.length}/${all.length}`,
    passed,
    pct: g.length === 0 ? null : Math.round((100 * passed) / g.length),
  };
}
const sel = graded.filter((x) => x.category === "selection-route");
summary.tasteInterrogations = sel.filter((x) => x.got.ask !== "none").length;
summary.variantsOffered = sel.filter((x) => x.got.variants).length;

console.log(JSON.stringify(
  { summary, misses: graded.filter((x) => !x.pass) },
  null, 2,
));
