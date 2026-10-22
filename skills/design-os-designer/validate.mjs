#!/usr/bin/env node
// validate.mjs — mechanical rejects for one evidence folder made by build.mjs.
// Named checks (each is a rule in rules.md): contract, manifest, artifact-hashes, size,
// external-request, missing-local-ref, gate. Prints one line per failure as `<check>: <what to fix>`,
// gate warnings as `warn: ...`, notes (e.g. token coverage did not run) as `note: ...`, and `ok` when clean.
// Exit 0 ok / 1 rejected / 2 cannot run (no `ui` binary, unreadable evidence). Offline, deterministic.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MAX_ENTRY_BYTES, MAX_FILES, SITE_DIR, locateUi, parseArgs, readContractState, readManifest, sha256Hex,
} from "./shared.mjs";
import { contractFailure, referenceFailures, runGate } from "./validate-checks.mjs";

const HELP = `Usage: node validate.mjs --evidence <folder> [--tokens <file>] [--family <slug>] [--ui <cli.js>]
  --evidence  folder printed by build.mjs
  --tokens    token file for \`ui gate\` (default: the project design system recorded at build time)
  --family    persona family slug, passed to \`ui gate\`
  --ui        path to dist/cli.js when \`ui\` is not found automatically
Prints one \`<check>: <fix>\` line per failure, or \`ok\`. Exit 0 ok, 1 rejected, 2 cannot run.`;

function listSiteFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else out.push(abs.slice(root.length + 1).split(/[\\/]/).join("/"));
    }
  };
  if (existsSync(root)) visit(root);
  return out.sort();
}

function fileFailures(manifest, siteRoot) {
  const failures = [];
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const f of manifest.files) {
    const abs = join(siteRoot, ...f.path.split("/"));
    if (f.path.split("/").includes("..") || !existsSync(abs)) failures.push(`artifact-hashes: ${f.path} is missing — rebuild the evidence folder`);
    else if (sha256Hex(readFileSync(abs)) !== f.sha256) failures.push(`artifact-hashes: ${f.path} changed after build — edit the source and rebuild`);
  }
  for (const extra of listSiteFiles(siteRoot)) if (!listed.has(extra)) failures.push(`artifact-hashes: ${extra} is not in the manifest — rebuild the evidence folder`);
  if (manifest.files.length > MAX_FILES) failures.push(`size: ${manifest.files.length} files exceed ${MAX_FILES} — build one page at a time`);
  const entryAbs = join(siteRoot, ...manifest.entry.split("/"));
  if (existsSync(entryAbs) && statSync(entryAbs).size > MAX_ENTRY_BYTES) failures.push(`size: ${manifest.entry} is larger than ${MAX_ENTRY_BYTES} bytes — split the page`);
  return failures;
}

function finish(failures, warnings, notes) {
  // Warnings and notes are results too: they print on stdout, before the verdict.
  const lead = [...warnings, ...notes];
  console.log([...lead, ...(failures.length > 0 ? failures : ["ok"])].join("\n"));
  return failures.length > 0 ? 1 : 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["evidence", "tokens", "family", "ui"], ["help"]);
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args._errors.length > 0 || !args.evidence) {
    console.error(args._errors.concat(args.evidence ? [] : ["input: --evidence is required (see --help)"]).join("\n"));
    return 2;
  }
  const evidence = resolve(args.evidence);
  const failures = [];
  const contract = readContractState();
  if (!contract.ok) failures.push(`contract: ${contract.reason} — reinstall ease-design to restore the shipped copy`);

  const read = readManifest(evidence);
  if (read.error) {
    const cannotRun = read.error.startsWith("input:");
    (cannotRun ? console.error : console.log)(read.error);
    return cannotRun ? 2 : 1;
  }
  const { manifest } = read;
  const shapeOk = manifest.schema === 1 && typeof manifest.entry === "string" && Array.isArray(manifest.files)
    && manifest.files.every((f) => f && typeof f.path === "string" && typeof f.sha256 === "string" && typeof f.bytes === "number");
  if (!shapeOk) {
    console.log("manifest: manifest.json does not match schema 1 (entry, files[path, bytes, sha256]) — rebuild the evidence folder");
    return 1;
  }
  if (contract.ok && manifest.contract !== contract.hash) failures.push("manifest: built against a different contract.md — rebuild the evidence folder with this skill version");
  if (!manifest.files.some((f) => f.path === manifest.entry)) failures.push(`manifest: entry ${manifest.entry} is not in the files list — rebuild the evidence folder`);

  const siteRoot = join(evidence, SITE_DIR);
  failures.push(...fileFailures(manifest, siteRoot), ...referenceFailures(siteRoot, manifest));

  const ui = locateUi(args.ui);
  if (ui === null) {
    console.error("runtime: could not run — `ui` binary not found; pass --ui <path/to/dist/cli.js> or set DESIGN_OS_UI");
    if (failures.length > 0) console.log(failures.join("\n"));
    return failures.length > 0 ? 1 : 2;
  }
  if (contract.ok) {
    const stale = contractFailure(ui, contract.text);
    if (stale !== null) failures.unshift(stale);
  }
  if (!existsSync(join(siteRoot, ...manifest.entry.split("/")))) {
    failures.push(`gate: entry ${manifest.entry} is missing, nothing to gate`);
    return finish(failures, [], []);
  }
  const gate = runGate(ui, evidence, manifest, args);
  if (gate.cannotRun) {
    console.error(gate.cannotRun);
    if (failures.length > 0) console.log(failures.join("\n"));
    return failures.length > 0 ? 1 : 2;
  }
  return finish([...failures, ...gate.failures], gate.warnings, gate.notes);
}

process.exitCode = main();
