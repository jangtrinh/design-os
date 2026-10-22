#!/usr/bin/env node
// designer-skill-contract — generates skills/design-os-designer/contract.md from the `ui` command
// signatures (src/core/command-signatures.ts, read through `ui schema --json` of the built binary).
// The renderer lives in the skill folder (contract-render.mjs) so validate.mjs re-renders with the very same
// code. First line of the contract is `<!-- sha256: <hex of every byte after it> -->`. No network, no clock.
//
//   node scripts/designer-skill-contract.mjs --write
//   node scripts/designer-skill-contract.mjs --check [--schema <schema.json>] [--contract <file>]
// Exit 0 ok / 1 stale or edited / 2 cannot run (no built binary, unreadable schema).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeContractText, renderContract } from "../skills/design-os-designer/contract-render.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(ROOT, "skills", "design-os-designer", "contract.md");

function loadSchema(schemaPath) {
  if (schemaPath) return JSON.parse(readFileSync(resolve(schemaPath), "utf8"));
  const cli = join(ROOT, "dist", "cli.js");
  if (!existsSync(cli)) throw new Error("dist/cli.js is missing — run `npm run build` first");
  const run = spawnSync(process.execPath, [cli, "schema", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ui schema --json exited ${run.status}: ${run.stderr.trim()}`);
  return JSON.parse(run.stdout);
}

function main(argv) {
  const flag = (name) => argv.includes(name);
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  if (!flag("--check") && !flag("--write")) {
    console.error("usage: designer-skill-contract.mjs --write | --check [--schema <file>] [--contract <file>]");
    return 2;
  }
  const target = resolve(value("--contract") ?? CONTRACT);
  let expected;
  try {
    expected = renderContract(loadSchema(value("--schema")));
  } catch (error) {
    console.error(`contract: cannot run — ${error.message}`);
    return 2;
  }
  if (flag("--write")) {
    writeFileSync(target, expected);
    console.log(`wrote ${target}`);
    return 0;
  }
  if (!existsSync(target)) {
    console.error(`contract: ${target} is missing — run with --write`);
    return 1;
  }
  if (normalizeContractText(readFileSync(target, "utf8")) !== expected) {
    console.error("contract: stale or edited — regenerate with `node scripts/designer-skill-contract.mjs --write`");
    return 1;
  }
  console.log("contract: current");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
