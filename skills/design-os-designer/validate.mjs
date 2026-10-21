#!/usr/bin/env node
// validate.mjs — mechanical rejects for one evidence folder made by build.mjs.
// Named checks (each is a rule in rules.md): contract, manifest, artifact-hashes, size,
// external-request, gate. Prints one line per failure as `<check>: <what to fix>` and `ok` when clean.
// Exit 0 ok / 1 rejected / 2 cannot run (no `ui` binary, unreadable evidence). Offline, deterministic.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  MAX_ENTRY_BYTES, MAX_FILES, SITE_DIR, locateUi, parseArgs, readContractState, readManifest, runUi, sha256Hex,
} from "./shared.mjs";

const HELP = `Usage: node validate.mjs --evidence <folder> [--tokens <file>] [--family <slug>] [--ui <cli.js>]
  --evidence  folder printed by build.mjs
  --tokens    project token file, passed to \`ui gate\` (also grades token coverage)
  --family    persona family slug, passed to \`ui gate\`
  --ui        path to dist/cli.js when \`ui\` is not found automatically
Prints one \`<check>: <fix>\` line per failure, or \`ok\`. Exit 0 ok, 1 rejected, 2 cannot run.`;

const REMOTE = /^(?:https?:)?\/\//i;

/** Remote loads in markup or CSS: tags that fetch a resource, never plain navigation links. */
function externalRequests(rel, text) {
  const lines = text.split("\n");
  const hits = [];
  const tagRe = /<(link|script|img|source|video|audio|iframe|embed|object|track)\b([^>]*)>/gi;
  lines.forEach((line, index) => {
    for (const m of line.matchAll(tagRe)) {
      const tag = m[1].toLowerCase();
      for (const a of m[2].matchAll(/\b(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi)) {
        const isNavigation = tag === "link" && /\brel\s*=\s*["']?(?:canonical|alternate|author|license|next|prev)\b/i.test(m[2]);
        if (REMOTE.test(a[1].trim()) && !isNavigation) hits.push(`${rel}:${index + 1} <${tag}> loads ${a[1].trim()}`);
      }
      for (const a of m[2].matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
        if (a[1].split(",").some((c) => REMOTE.test(c.trim().split(/\s+/)[0]))) hits.push(`${rel}:${index + 1} <${tag}> srcset loads a remote image`);
      }
    }
    for (const m of line.matchAll(/(?<!@import\s*)url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi)) hits.push(`${rel}:${index + 1} css url() loads ${m[1]}`);
    for (const m of line.matchAll(/@import\s+(?:url\(\s*)?["']?((?:https?:)?\/\/[^"')\s]+)/gi)) hits.push(`${rel}:${index + 1} css @import loads ${m[1]}`);
  });
  return hits;
}

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

/** First line of a finding message, capped so one finding stays one readable line. */
const brief = (message) => {
  const first = String(message).split("\n")[0];
  return first.length > 200 ? first.slice(0, 197) + "..." : first;
};

function gateLines(ui, evidence, entry, args) {
  const flags = ["gate", join(SITE_DIR, entry), "--json", ...(args.tokens ? ["--tokens", resolve(args.tokens)] : []), ...(args.family ? ["--family", args.family] : [])];
  const run = runUi(ui, flags, evidence);
  let data;
  try {
    data = JSON.parse(run.stdout).data;
  } catch {
    return { cannotRun: `runtime: \`ui gate\` returned no JSON (exit ${run.status}): ${(run.stderr || run.stdout || "").trim().split("\n")[0]}` };
  }
  if (data === undefined || data === null || (run.status !== 0 && run.status !== 1)) return { cannotRun: `runtime: \`ui gate\` exited ${run.status}` };
  const lines = [];
  for (const [family, result] of Object.entries(data.families ?? {})) {
    for (const f of result.findings ?? []) {
      if (f.severity === "error") lines.push(`gate: ${family}/${f.checkId} ${entry}${f.line ? ":" + f.line : ""} — ${brief(f.message)}`);
    }
  }
  for (const f of data.linkedCssErrors ?? []) lines.push(`gate: linked-css/${f.checkId} — ${brief(f.message)}`);
  const coverage = data.tokenCoverage?.overall?.coverage;
  if (typeof coverage === "number" && coverage < data.tokenCoverageFloor) {
    lines.push(`gate: token-coverage ${Math.round(coverage * 100)}% is below the ${Math.round(data.tokenCoverageFloor * 100)}% floor — style with the project's tokens`);
  }
  if (lines.length === 0 && (run.status === 1 || data.pass === false)) lines.push("gate: ui gate failed without a listed finding — run `ui gate` on the entry by hand");
  return { lines };
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

  for (const f of manifest.files) {
    if (!/\.(?:html?|css)$/i.test(f.path)) continue;
    const abs = join(siteRoot, ...f.path.split("/"));
    if (existsSync(abs)) for (const hit of externalRequests(f.path, readFileSync(abs, "utf8"))) failures.push(`external-request: ${hit} — bundle the asset into the folder; look blocks the network`);
  }

  const ui = locateUi(args.ui);
  if (ui === null) {
    console.error("runtime: could not run — `ui` binary not found; pass --ui <path/to/dist/cli.js> or set DESIGN_OS_UI");
    return 2;
  }
  if (!existsSync(entryAbs)) failures.push(`gate: entry ${manifest.entry} is missing, nothing to gate`);
  else {
    const gate = gateLines(ui, evidence, manifest.entry, args);
    if (gate.cannotRun) {
      console.error(gate.cannotRun);
      return 2;
    }
    failures.push(...gate.lines);
  }
  if (failures.length > 0) {
    console.log(failures.join("\n"));
    return 1;
  }
  console.log("ok");
  return 0;
}

process.exitCode = main();
