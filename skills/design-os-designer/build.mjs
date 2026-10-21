#!/usr/bin/env node
// build.mjs — assemble an evidence folder for one page so validate.mjs and look.mjs check exactly
// the bytes that will ship. Prints the absolute evidence path on stdout. Exit 0 built / 1 rejected input.
// Offline, Node built-ins only. Never writes inside the skill folder; refuses an existing destination.
// Run it from the PROJECT directory; the default destination is ./.design-os/evidence/designer/<name>-<hash>.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  MANIFEST_NAME, MAX_ENTRY_BYTES, MAX_FILES, MAX_TOTAL_BYTES, SITE_DIR, SKILL_DIR, WIDTHS,
  findProject, isInside, parseArgs, readContractState, sha256Hex,
} from "./shared.mjs";
import { referencesIn, resolveLocal } from "./refs.mjs";

const HELP = `Usage: node build.mjs --target <page.html|folder> [--entry <file.html>] [--out <new folder>] [--project <dir>]
  --target   one HTML file (its local assets are copied too) or a folder holding the page
  --entry    entry HTML inside a folder target (default: index.html, or the only .html file)
  --out      new evidence folder outside the skill folder (default: ./.design-os/evidence/designer/<name>-<hash>)
  --project  where to look for the project design system (default: the page's own folder)
Run from your project directory. Prints the evidence folder path. Exit 0 built, 1 input rejected.`;

function fail(line) {
  console.error(line);
  process.exit(1);
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

/** Entry plus every local asset it references (URL-decoded), transitively through HTML and CSS. */
function collectFromFile(entryAbs) {
  const base = dirname(entryAbs);
  const files = new Set([entryAbs]);
  const queue = [entryAbs];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const { ref } of referencesIn(current, readFileSync(current, "utf8"))) {
      const abs = resolveLocal(current, ref);
      if (abs === null) continue;
      if (abs !== base && !abs.startsWith(base + sep)) fail(`input: ${relative(process.cwd(), current)} references ${ref}, outside the page folder — move the asset next to the page`);
      if (!existsSync(abs) || !lstatSync(abs).isFile() || files.has(abs)) continue;
      files.add(abs);
      queue.push(abs);
    }
  }
  return { base, files: [...files] };
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["target", "entry", "out", "project"], ["help"]);
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
  if (isInside(out, SKILL_DIR)) fail(`output: ${out} is inside the skill folder — run build from your project directory or pass --out <folder outside ${SKILL_DIR}>`);
  if (existsSync(out)) fail(`output: ${out} already exists — pass --out <new folder>; the old run stays for comparison`);

  // The skill's own examples are samples, not pages of the user's project.
  const projectStart = args.project ? resolve(args.project) : dirname(entryAbs);
  const project = !args.project && isInside(entryAbs, SKILL_DIR) ? null : findProject(projectStart);
  for (const record of records) {
    const dest = join(out, SITE_DIR, ...record.path.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(base, ...record.path.split("/")), dest);
  }
  const manifest = { schema: 1, skill: "design-os-designer", entry, widths: WIDTHS, contract: contract.hash, projectStart, project, files: records };
  writeFileSync(join(out, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");
  console.log(out);
}

main();
