#!/usr/bin/env node
// designer-skill-contract — generates skills/design-os-designer/contract.md from the `ui` command
// signatures (src/core/command-signatures.ts, read through `ui schema --json` of the built binary).
// First line of the contract is `<!-- sha256: <hex of every byte after it> -->`; validate.mjs refuses
// an edited copy and this script's --check refuses a stale one. No network, no clock, no model.
//
//   node scripts/designer-skill-contract.mjs --write
//   node scripts/designer-skill-contract.mjs --check [--schema <schema.json>] [--contract <file>]
// Exit 0 ok / 1 stale or edited / 2 cannot run (no built binary, unreadable schema).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACT = join(ROOT, "skills", "design-os-designer", "contract.md");
/** The commands the skill tells the agent to run, in reading order. `name:sub` selects a subcommand. */
export const CONTRACT_COMMANDS = [
  "gate", "validate-layout", "a11y-lint", "taste-lint", "tell-lint", "content-lint", "autofix", "token-coverage",
  "ds:context", "registry:list", "registry:lookup", "memory:context",
];

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function signatureOf(schema, ref) {
  const [name, sub] = ref.split(":");
  const command = schema.data?.commands?.[name];
  const signature = sub ? command?.subcommands?.[sub] : command?.signature;
  if (!signature) throw new Error(`ui schema has no command '${ref.replace(":", " ")}'`);
  return signature;
}

/** Deterministic Markdown body (no header) for the given schema JSON. */
export function renderContractBody(schema) {
  const out = [
    "# Generated command contract",
    "",
    "Generated from `src/core/command-signatures.ts` through `ui schema --json`. Do not edit: validate.mjs",
    "refuses a changed copy and the repo contract script reports a stale one. Flags not listed here do not exist.",
    "",
  ];
  for (const ref of CONTRACT_COMMANDS) {
    const sig = signatureOf(schema, ref);
    const positionals = sig.positionals.map((p) => (p.required ? p.name : `[${p.name}]`)).join(" ");
    out.push(`## ui ${ref.replace(":", " ")}`, "", sig.summary, "", `Usage: \`ui ${ref.replace(":", " ")}${positionals ? " " + positionals : ""}${sig.flags.length ? " [flags]" : ""}\``, "");
    if (sig.flags.length > 0) {
      out.push("| Flag | Type | Meaning |", "| --- | --- | --- |");
      for (const f of sig.flags) {
        const kind = f.values ? f.values.join("\\|") : f.type;
        out.push(`| \`--${f.name}\`${f.required ? " (required)" : ""} | ${kind} | ${f.summary.replace(/\|/g, "\\|")} |`);
      }
      out.push("");
    }
    out.push(`Error codes: ${sig.errorCodes.map((c) => `\`${c}\``).join(", ") || "none"}`, "");
  }
  return out.join("\n");
}

export function renderContract(schema) {
  const body = renderContractBody(schema);
  return `<!-- sha256: ${sha256(body)} -->\n${body}`;
}

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
  const actual = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  if (actual !== expected) {
    console.error("contract: stale or edited — regenerate with `node scripts/designer-skill-contract.mjs --write`");
    return 1;
  }
  console.log("contract: current");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
