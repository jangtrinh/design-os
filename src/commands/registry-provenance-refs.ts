/**
 * Source-reference verification for `ui registry register --source-ref`.
 *
 * Two reference forms, both checked against what is on disk right now and hashed so the record
 * proves what it pointed at when it was registered:
 *   - code:  `<path>:<start>[-<end>]`, a path relative to the project root (the parent of `design/`),
 *            1-based inclusive lines; hash = sha256 of the sliced lines joined with `\n`.
 *   - figma: `figma:<nodeId>` that is a component or component-set in `design/ds.json` or
 *            `design/canvas-inventory.json`; hash = canonical hash of the matched inventory entry.
 * Every refusal is a `REGISTRY_BAD_SOURCE_REF` naming the exact cause and the path or node; an I/O
 * failure on the referenced file (permissions, a directory race, a file too large to read) is one too.
 *
 * Controller ruling (a reference that proves nothing is refused). A code ref is refused when it is
 * the `--markup` file being registered (same device and inode, so a hard link or a symlink to it
 * counts; stdin has no file), or one of the design system's own files: any `*.json` / `*.jsonl`
 * under the store, anything under `rules/`, and the files the `ui` CLI generates into it (see
 * registry-provenance-store-files.ts). Hand-authored source that lives under `design/` is a valid ref.
 * Every path is resolved with `realpathSync.native`, so a case variant of a path on a case-insensitive
 * filesystem cannot dodge a guard.
 *
 * The recorded code ref is canonical: the on-disk path relative to the real project root, with forward
 * slashes, plus the range as typed. `src/../src/a.svelte:1`, `SRC/A.svelte:1` and `src\a.svelte:1` all
 * record `src/a.svelte:1`. (A backslash in a typed path is a separator, so a POSIX file whose name
 * contains one cannot be referenced.)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { canonicalHash } from "../core/ds-manifest.js";
import { designSystemFileKind } from "./registry-provenance-store-files.js";
import { RegistryError } from "../core/registry-store.js";
import type { ComponentProvenance } from "../core/registry-store.js";

const bad = (message: string): RegistryError => new RegistryError("REGISTRY_BAD_SOURCE_REF", `REGISTRY_BAD_SOURCE_REF: ${message}`);

/** `sha256-<base64url>`, the same shape the manifest uses, over the exact UTF-8 bytes of `text`. */
export function sha256OfText(text: string): string {
  return `sha256-${createHash("sha256").update(text, "utf8").digest("base64url")}`;
}

const FIGMA_REF = /^figma:(\d+:\d+)$/;
const CODE_REF = /^(.+):(\d+)(?:-(\d+))?$/;

export interface SourceRefContext {
  /** The `design/` folder of the design system being registered into. */
  storeDir: string;
  /** The `--markup` file when the markup came from a file; absent for stdin. */
  markupFile?: string;
}

/** Parse and verify a `--source-ref` value. */
export function verifySourceRef(sourceRef: string, ctx: SourceRefContext): ComponentProvenance {
  if (sourceRef.startsWith("figma:")) return verifyFigmaRef(sourceRef, ctx.storeDir);
  return verifyCodeRef(sourceRef, resolve(ctx.storeDir, ".."), ctx);
}

function insideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

/** The path and the OS error code, so a caller can act on it. */
function ioFailure(what: string, path: string, e: unknown): RegistryError {
  const code = e !== null && typeof e === "object" && "code" in e ? String((e as NodeJS.ErrnoException).code) : "error";
  return bad(`cannot ${what} '${path}': ${code} (${e instanceof Error ? e.message : String(e)})`);
}

const realPathOrUndefined = (path: string): string | undefined => {
  try { return realpathSync.native(path); } catch { return undefined; }
};

/** True when both paths are the same file on disk (same device and inode): hard links, symlinks, case variants. */
function sameFile(a: string, b: string): boolean {
  try {
    const x = statSync(a), y = statSync(b);
    return x.dev === y.dev && x.ino === y.ino;
  } catch { return false; }
}

function verifyCodeRef(sourceRef: string, projectRoot: string, ctx: SourceRefContext): ComponentProvenance {
  const m = CODE_REF.exec(sourceRef);
  if (m === null) {
    throw bad(`'${sourceRef}' is not <path>:<startLine>[-<endLine>] or figma:<nodeId> (e.g. src/lib/Card.svelte:1-38)`);
  }
  const [, path, startText, endText] = m as unknown as [string, string, string, string | undefined];
  const start = Number(startText);
  const end = endText === undefined ? start : Number(endText);
  if (start < 1 || end < start) {
    throw bad(`line range ${start}-${end} in '${sourceRef}' is invalid: lines are 1-based and start must not exceed end`);
  }
  if (isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\")) {
    throw bad(`path '${path}' is absolute — give it relative to the project root '${projectRoot}'`);
  }
  const file = resolve(projectRoot, path.replace(/\\/g, "/"));
  if (!insideRoot(projectRoot, file)) {
    throw bad(`path '${path}' escapes the project root '${projectRoot}'`);
  }
  if (!existsSync(file)) {
    const hint = path.includes("\\") ? " (backslashes are read as path separators)" : "";
    throw bad(`file '${path}' does not exist under the project root '${projectRoot}'${hint}`);
  }
  let text: string;
  let canonicalPath: string;
  try {
    if (!statSync(file).isFile()) throw bad(`'${path}' is not a file`);
    // A symlink inside the root must not smuggle in a file from outside it.
    const real = realpathSync.native(file);
    const realRoot = realpathSync.native(projectRoot);
    if (!insideRoot(realRoot, real)) {
      throw bad(`path '${path}' resolves through a link to a file outside the project root '${projectRoot}'`);
    }
    if (ctx.markupFile !== undefined && sameFile(real, ctx.markupFile)) {
      throw bad(`'${path}' is the markup file being registered — the reference must point at the component's real source, not at the markup it is meant to vouch for`);
    }
    const storeReal = realPathOrUndefined(ctx.storeDir);
    const kind = storeReal !== undefined && insideRoot(storeReal, real) ? designSystemFileKind(relative(storeReal, real)) : undefined;
    if (kind !== undefined) {
      throw bad(`'${path}' is a design-system file (${kind}) — the reference must point at the component's real source, not at the design system's own files; ` +
        `markup with no real source can be registered with --synthetic-approved --reason "<why>"`);
    }
    canonicalPath = relative(realRoot, real).split(sep).join("/");
    text = readFileSync(file, "utf8");
  } catch (e) {
    if (e instanceof RegistryError) throw e;
    throw ioFailure("read", path, e);
  }
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop(); // the newline that ends the last line
  const count = lines.length;
  if (end > count) {
    throw bad(`line range ${start}-${end} is past the end of '${path}', which has ${count} line(s)`);
  }
  return { kind: "code", sourceRef: `${canonicalPath}:${start}${endText === undefined ? "" : `-${end}`}`, sha256: sha256OfText(lines.slice(start - 1, end).join("\n")) };
}

/** The component and component-set entries of one inventory file, or undefined when the file is absent. */
function inventoryEntries(file: string): { id?: unknown }[] | undefined {
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { throw bad(`Figma inventory '${file}' is not readable JSON (${e instanceof Error ? e.message : String(e)})`); }
  const o = (parsed !== null && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const list = (v: unknown): { id?: unknown }[] => (Array.isArray(v) ? v.filter((x): x is { id?: unknown } => x !== null && typeof x === "object") : []);
  return [...list(o["components"]), ...list(o["componentSets"])];
}

function verifyFigmaRef(sourceRef: string, storeDir: string): ComponentProvenance {
  const m = FIGMA_REF.exec(sourceRef);
  if (m === null) throw bad(`'${sourceRef}' is not a Figma node reference: expected figma:<nodeId> with an id like 8660:117742`);
  const nodeId = m[1]!;
  const files = ["ds.json", "canvas-inventory.json"].map((f) => join(storeDir, f));
  const loaded = files.map((f) => ({ f, entries: inventoryEntries(f) }));
  if (loaded.every((l) => l.entries === undefined)) {
    throw bad(`cannot verify Figma node ${nodeId}: no inventory found — looked for ${files.map((f) => `'${f}'`).join(" and ")}`);
  }
  for (const { entries } of loaded) {
    const hit = entries?.find((e) => e.id === nodeId);
    if (hit !== undefined) return { kind: "figma", sourceRef, sha256: canonicalHash(hit) };
  }
  const searched = loaded.filter((l) => l.entries !== undefined).map((l) => `'${l.f}'`).join(" and ");
  throw bad(`Figma node ${nodeId} is not a component or component set in ${searched}`);
}
