#!/usr/bin/env node
// build.mjs — assemble an evidence folder for one page so validate.mjs and look.mjs check exactly
// the bytes that will ship. Prints the absolute evidence path on stdout. Exit 0 built / 1 rejected input.
// Offline, Node built-ins only. Never writes into the skill folder; refuses an existing destination.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  MANIFEST_NAME, MAX_ENTRY_BYTES, MAX_FILES, MAX_TOTAL_BYTES, SITE_DIR, WIDTHS,
  parseArgs, readContractState, sha256Hex,
} from "./shared.mjs";

const HELP = `Usage: node build.mjs --target <page.html|folder> [--entry <file.html>] [--out <new folder>]
  --target  one HTML file (its local assets are copied too) or a folder holding the page
  --entry   entry HTML inside a folder target (default: index.html, or the only .html file)
  --out     new evidence folder (default: ./.design-os/evidence/designer/<name>-<hash>)
Prints the evidence folder path. Exit 0 built, 1 input rejected.`;

const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

function fail(line) {
  console.error(line);
  process.exit(1);
}

/** Local references (relative paths only) found in an HTML or CSS text. */
function localRefs(text, isCss) {
  const refs = new Set();
  const add = (raw) => {
    const value = raw.trim().split(/[?#]/)[0];
    if (value !== "" && !SCHEME.test(value)) refs.add(value);
  };
  if (!isCss) {
    for (const m of text.matchAll(/\b(?:src|href|poster|data-src)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
    for (const m of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) m[1].split(",").forEach((c) => add(c.trim().split(/\s+/)[0]));
  }
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1]);
  for (const m of text.matchAll(/@import\s+["']([^"']+)["']/gi)) add(m[1]);
  return [...refs];
}

function walkFolder(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const abs = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`input: ${abs} is a symlink — copy the real file into the folder`);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) found.push(abs);
    }
  };
  visit(root);
  return found;
}

/** Entry plus every local asset it references, transitively through CSS. */
function collectFromFile(entryAbs) {
  const base = dirname(entryAbs);
  const files = new Set([entryAbs]);
  const queue = [entryAbs];
  while (queue.length > 0) {
    const current = queue.pop();
    const isCss = current.toLowerCase().endsWith(".css");
    if (!isCss && !/\.html?$/i.test(current)) continue;
    for (const ref of localRefs(readFileSync(current, "utf8"), isCss)) {
      const abs = resolve(dirname(current), ref);
      if (abs !== base && !abs.startsWith(base + sep)) fail(`input: ${relative(process.cwd(), current)} references ${ref}, outside the page folder — move the asset next to the page`);
      if (!existsSync(abs) || !lstatSync(abs).isFile() || files.has(abs)) continue;
      files.add(abs);
      queue.push(abs);
    }
  }
  return { base, files: [...files] };
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["target", "entry", "out"], ["help"]);
  if (args.help) return void console.log(HELP);
  if (args._errors.length > 0) fail(args._errors.join("\n"));
  if (!args.target) fail("input: --target is required (see --help)");
  const target = resolve(args.target);
  if (!existsSync(target)) fail(`input: ${target} does not exist`);
  const contract = readContractState();
  if (!contract.ok) fail(`contract: ${contract.reason} — reinstall ease-design to restore the shipped copy`);

  let base;
  let files;
  let entryAbs;
  if (lstatSync(target).isDirectory()) {
    base = target;
    files = walkFolder(target);
    const htmls = files.filter((f) => /\.html?$/i.test(f));
    entryAbs = args.entry ? resolve(target, args.entry) : existsSync(join(target, "index.html")) ? join(target, "index.html") : htmls.length === 1 ? htmls[0] : null;
    if (entryAbs === null) fail("input: folder has no index.html and more than one .html file — pass --entry <file.html>");
  } else {
    if (!/\.html?$/i.test(target)) fail(`input: ${target} is not an .html file`);
    entryAbs = target;
    ({ base, files } = collectFromFile(target));
  }
  if (!files.includes(entryAbs)) fail(`input: entry ${entryAbs} is not inside the target`);
  const total = files.reduce((sum, f) => sum + lstatSync(f).size, 0);
  if (files.length > MAX_FILES) fail(`input: ${files.length} files exceed the ${MAX_FILES}-file limit — build one page at a time`);
  if (total > MAX_TOTAL_BYTES) fail(`input: ${total} bytes exceed the ${MAX_TOTAL_BYTES}-byte limit`);
  if (lstatSync(entryAbs).size > MAX_ENTRY_BYTES) fail(`input: entry is larger than ${MAX_ENTRY_BYTES} bytes — split the page`);

  const records = files.map((abs) => {
    const data = readFileSync(abs);
    return { path: relative(base, abs).split(sep).join("/"), bytes: data.length, sha256: sha256Hex(data) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  const entry = relative(base, entryAbs).split(sep).join("/");
  const digest = sha256Hex(records.map((r) => `${r.path}:${r.sha256}`).join("\n")).slice(0, 12);
  const out = args.out
    ? resolve(args.out)
    : join(process.cwd(), ".design-os", "evidence", "designer", `${basename(entry).replace(/\.html?$/i, "")}-${digest}`);
  if (existsSync(out)) fail(`output: ${out} already exists — pass --out <new folder>; the old run stays for comparison`);

  for (const record of records) {
    const dest = join(out, SITE_DIR, ...record.path.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(base, ...record.path.split("/")), dest);
  }
  const manifest = { schema: 1, skill: "design-os-designer", entry, widths: WIDTHS, contract: contract.hash, files: records };
  writeFileSync(join(out, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");
  console.log(out);
}

main();
