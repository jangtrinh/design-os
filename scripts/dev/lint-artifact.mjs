#!/usr/bin/env node
/**
 * Lint one diagram or chart artifact from the built CLI, choosing the capability from the
 * file's own owned-SVG marker. Exists so an author can gate a single file without naming
 * the build output path by hand.
 *
 *   node scripts/dev/lint-artifact.mjs path/to/artifact.html
 */
import { readFileSync } from "node:fs";
import { run } from "../../dist/cli.js";

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: node scripts/dev/lint-artifact.mjs <artifact.html>");
  process.exit(2);
}

const html = readFileSync(file, "utf8");
const capability = html.includes('data-chart-owned="true"') ? "chart" : "diagram";
const code = await run([capability, "lint", file]);
process.exit(typeof code === "number" ? code : 0);
