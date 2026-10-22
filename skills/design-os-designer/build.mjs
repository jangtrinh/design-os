#!/usr/bin/env node
// build.mjs — assemble an evidence folder for one page so validate.mjs and look.mjs check exactly
// the bytes that will ship. The unit is the page FOLDER: every regular file in it is copied (no reference
// tracing, so no asset is ever "missed"). Prints the absolute evidence path on stdout. Exit 0 built / 1 rejected input.
// Offline, Node built-ins only. Never writes inside the skill folder; refuses an existing destination.
// Run it from the PROJECT directory; the default destination is ./.design-os/evidence/designer/<name>-<hash>.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  MANIFEST_NAME, MAX_ENTRY_BYTES, MAX_FILES, MAX_TOTAL_BYTES, SITE_DIR, SKILL_DIR, WIDTHS,
  isInside, parseArgs, readContractState, sha256Hex,
} from "./shared.mjs";

const HELP = `Usage: node build.mjs --target <page.html|folder> [--entry <file.html>] [--out <new folder>] [--project <dir>]
  --target   one HTML file (its whole folder is the evidence unit) or a folder holding the page
  --entry    entry HTML inside a folder target (default: index.html, or the only .html file)
  --out      new evidence folder outside the skill folder (default: ./.design-os/evidence/designer/<name>-<hash>)
  --project  where \`ui gate\` looks for the project design system (default: the page's own folder)
Run from your project directory. Prints the evidence folder path. Exit 0 built, 1 input rejected.`;

function fail(line) {
  console.error(line);
  process.exit(1);
}

/** Every regular file under `root` (dotfiles and node_modules skipped, symlinks refused), stopping at the file limit. */
function walkFolder(root) {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const abs = join(dir, entry.name);
      if (entry.isSymbolicLink()) fail(`input: ${abs} is a symlink — copy the real file into the folder`);
      if (entry.isDirectory()) visit(abs);
      else if (entry.isFile()) found.push(abs);
      if (found.length > MAX_FILES) fail(`input: ${root} holds more than ${MAX_FILES} files — move the page and its assets into their own folder`);
    }
  };
  visit(root);
  return found;
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["target", "entry", "out", "project"], ["help"]);
  if (args.help) return void console.log(HELP);
  if (args._errors.length > 0) fail(args._errors.join("\n"));
  if (!args.target) fail("input: --target is required (see --help)");
  const target = resolve(args.target);
  if (!existsSync(target)) fail(`input: ${target} does not exist`);
  if (args.project && !existsSync(resolve(args.project))) fail(`input: --project ${resolve(args.project)} does not exist`);
  const contract = readContractState();
  if (!contract.ok) fail(`contract: ${contract.reason} — reinstall ease-design to restore the shipped copy`);

  const isFolder = lstatSync(target).isDirectory();
  if (!isFolder && !/\.html?$/i.test(target)) fail(`input: ${target} is not an .html file`);
  const base = isFolder ? target : dirname(target);
  const files = walkFolder(base);
  const htmls = files.filter((f) => /\.html?$/i.test(f));
  const entryAbs = !isFolder ? target
    : args.entry ? resolve(target, args.entry)
    : existsSync(join(target, "index.html")) ? join(target, "index.html") : htmls.length === 1 ? htmls[0] : null;
  if (entryAbs === null) fail("input: folder has no index.html and more than one .html file — pass --entry <file.html>");
  if (!files.includes(entryAbs)) fail(`input: entry ${entryAbs} is not inside the target`);
  const total = files.reduce((sum, f) => sum + lstatSync(f).size, 0);
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

  for (const record of records) {
    const dest = join(out, SITE_DIR, ...record.path.split("/"));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(base, ...record.path.split("/")), dest);
  }
  // `ui gate --dir` starts its own design-system discovery here; the skill never walks for one.
  const projectDir = args.project ? resolve(args.project) : dirname(entryAbs);
  const manifest = { schema: 1, skill: "design-os-designer", entry, widths: WIDTHS, contract: contract.hash, projectDir, files: records };
  writeFileSync(join(out, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + "\n");
  console.log(out);
}

main();
