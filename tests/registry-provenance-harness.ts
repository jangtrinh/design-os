/**
 * Shared harness for the registry provenance tests: an in-process `ui` runner, a sealed project
 * built by a real `ds init` (copied per test), an unsealed project, and a byte snapshot of a folder
 * used to prove a refused register wrote nothing.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";

export interface Captured { code: number; out: string; err: string }

export function capture(args: string[]): Captured {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stream write signature
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stream write signature
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const FAKE_MONOSPACE = join(HERE, "fixtures", "registry", "fake-monospace.html");
const PERSONA_DATA = join(HERE, "..", "knowledge", "personas", "personas.json");

/** Declared first families of the `ds init` token set: "SF Pro Text" / "SF Pro Display". */
export const CLEAN_MARKUP = `<style>.ok { font-family: "SF Pro Text", Inter, sans-serif; }</style><div class="ok">Fine</div>\n`;
/** A page-declared var is an off-system-token WARNING: it is printed and never blocks. */
export const WARNING_ONLY_MARKUP = `<style>:root { --mine: monospace; } .a { font-family: var(--mine); }</style><div class="a">x</div>\n`;
/** Six lines: the ref target for every code-ref test. */
export const SOURCE_FILE_TEXT = ["<script>", "  export let label;", "</script>", "<button>{label}</button>", "<style>", "</style>"].join("\n") + "\n";

export const sha256Text = (text: string): string => `sha256-${createHash("sha256").update(text).digest("base64url")}`;

export interface Project {
  /** Project root: the parent of `design/`. Its own parent is a scratch folder a test may write "outside the project" files into. */
  root: string;
  designDir: string;
  registryFile: string;
  manifestFile: string;
  markupFile: string;
  /** Run `ui registry register <name> --category data --markup <file> --file <registry> ...extra`. */
  register(extra?: string[], opts?: { name?: string; markup?: string }): Captured;
}

const created: string[] = [];
let sealedTemplate: string | undefined;

function project(root: string): Project {
  const designDir = join(root, "design");
  const registryFile = join(designDir, "component-registry.json");
  const markupFile = join(root, "clean.html");
  writeFileSync(markupFile, CLEAN_MARKUP);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "widget.svelte"), SOURCE_FILE_TEXT);
  return {
    root, designDir, registryFile, markupFile, manifestFile: join(designDir, "ds.manifest.json"),
    register: (extra = [], opts = {}) => capture([
      "registry", "register", opts.name ?? "Table/Fake", "--category", "data",
      "--markup", opts.markup ?? markupFile, "--file", registryFile, ...extra,
    ]),
  };
}

/** A project whose design system was compiled by a real `ds init`: `design/ds.manifest.json` exists. */
export function sealedProject(): Project {
  if (sealedTemplate === undefined) {
    sealedTemplate = mkdtempSync(join(tmpdir(), "registry-provenance-template-"));
    created.push(sealedTemplate);
    const r = capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument", "--dir", sealedTemplate, "--persona-data", PERSONA_DATA]);
    if (r.code !== 0) throw new Error(`ds init failed: ${r.out}${r.err}`);
  }
  const parent = mkdtempSync(join(tmpdir(), "registry-provenance-sealed-"));
  created.push(parent);
  const root = join(parent, "project");
  cpSync(sealedTemplate, root, { recursive: true });
  return project(root);
}

/** A project with a `design/` folder and no manifest: nothing has been sealed yet. */
export function unsealedProject(): Project {
  const parent = mkdtempSync(join(tmpdir(), "registry-provenance-unsealed-"));
  created.push(parent);
  const root = join(parent, "project");
  mkdirSync(join(root, "design"), { recursive: true });
  return project(root);
}

export function cleanupProjects(): void {
  for (const p of created.splice(0)) rmSync(p, { recursive: true, force: true });
  sealedTemplate = undefined;
}

/** path -> bytes (base64) of every file under `dir`, for byte-for-byte before/after comparison. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(dir, p)] = readFileSync(p).toString("base64");
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
