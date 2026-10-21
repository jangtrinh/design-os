// Shared helpers for build.mjs, validate.mjs and look.mjs. Node >= 20, built-ins only, offline.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeContractText } from "./contract-render.mjs";

/** The folder that marks a repository root; discovery never walks past it, like `ui`. */
const REPO_MARKER = ".git";

export const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
export const WIDTHS = [375, 768, 1440];
export const MAX_ENTRY_BYTES = 512 * 1024;
export const MAX_FILES = 200;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MANIFEST_NAME = "manifest.json";
export const SITE_DIR = "site";

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** Minimal `--flag value` / `--flag` parser. Unknown flags are reported, never ignored. */
export function parseArgs(argv, valueFlags, boolFlags) {
  const out = { _errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.startsWith("--") ? arg.slice(2) : null;
    if (name !== null && boolFlags.includes(name)) out[name] = true;
    else if (name !== null && valueFlags.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) out._errors.push(`input: --${name} needs a value`);
      else { out[name] = value; i++; }
    } else out._errors.push(`input: unknown argument ${arg}`);
  }
  return out;
}

/** The contract header is `<!-- sha256: <hex of every byte after the first line> -->`. */
export function readContractState(contractPath = join(SKILL_DIR, "contract.md")) {
  if (!existsSync(contractPath)) return { ok: false, reason: "contract.md is missing" };
  // CRLF checkouts (autocrlf on Windows) and a UTF-8 BOM must hash like the LF bytes that were generated.
  const text = normalizeContractText(readFileSync(contractPath, "utf8"));
  const newline = text.indexOf("\n");
  const first = newline < 0 ? text : text.slice(0, newline);
  const match = /^<!-- sha256: ([0-9a-f]{64}) -->$/.exec(first);
  if (match === null) return { ok: false, reason: "contract.md has no sha256 header on its first line" };
  const actual = sha256Hex(text.slice(newline + 1));
  if (actual !== match[1]) return { ok: false, reason: "contract.md body does not match its sha256 header (edited copy)" };
  return { ok: true, hash: match[1], text };
}

/**
 * The design-system project a page belongs to, found the way `ui gate` finds it from the page's folder:
 * the nearest design/ds.manifest.json (tokens in design/design.tokens.json), then brand/design/design.tokens.json,
 * each walked up at most 5 levels and stopping at a repository root. Null when there is none.
 */
export function findProject(startDir) {
  const walk = (marker, tokens) => {
    let cur = resolve(startDir);
    for (let level = 0; level < 5; level++) {
      if (existsSync(join(cur, ...marker))) return { root: cur, tokens: join(cur, ...tokens) };
      if (existsSync(join(cur, REPO_MARKER))) break;
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return null;
  };
  const ds = walk(["design", "ds.manifest.json"], ["design", "design.tokens.json"]);
  if (ds !== null && existsSync(ds.tokens)) return ds;
  return walk(["brand", "design", "design.tokens.json"], ["brand", "design", "design.tokens.json"]);
}

/** True when `child` is `parent` or lies inside it, resolving symlinks of the nearest existing ancestor. */
export function isInside(child, parent) {
  const real = (path) => {
    let existing = resolve(path);
    const rest = [];
    while (!existsSync(existing) && dirname(existing) !== existing) {
      rest.unshift(basename(existing));
      existing = dirname(existing);
    }
    return join(realpathSync(existing), ...rest);
  };
  const c = real(child);
  const p = real(parent);
  return c === p || c.startsWith(p + sep);
}

/**
 * Find the `ui` binary without installing anything: --ui path, DESIGN_OS_UI, the package's own
 * dist/cli.js (this skill ships inside the package), then `ui` on PATH. Returns null when absent.
 */
export function locateUi(explicit) {
  const candidates = [explicit, process.env.DESIGN_OS_UI, join(SKILL_DIR, "..", "..", "dist", "cli.js")];
  for (const candidate of candidates) {
    if (candidate && existsSync(resolve(candidate))) return { cmd: process.execPath, prefix: [resolve(candidate)] };
  }
  const probe = spawnSync("ui", ["--version"], { encoding: "utf8" });
  return probe.status === 0 ? { cmd: "ui", prefix: [] } : null;
}

export function runUi(ui, args, cwd) {
  return spawnSync(ui.cmd, [...ui.prefix, ...args], { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
}

export function readManifest(evidenceDir) {
  const path = join(evidenceDir, MANIFEST_NAME);
  if (!existsSync(path)) return { error: `input: ${evidenceDir} has no ${MANIFEST_NAME} — run build.mjs first` };
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("not an object");
    return { manifest };
  } catch (error) {
    return { error: `manifest: ${MANIFEST_NAME} is not valid JSON (${error.message}) — rebuild the evidence folder` };
  }
}
