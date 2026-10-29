/**
 * Source-reference verification for `ui registry register --source-ref`.
 *
 * Two reference forms, both checked against what is on disk right now and hashed so the record
 * proves what it pointed at when it was registered:
 *   - code:  `<path>:<start>[-<end>]`, a path relative to the project root (the parent of `design/`),
 *            1-based inclusive lines; hash = sha256 of the sliced lines joined with `\n`.
 *   - figma: `figma:<nodeId>` that is a component or component-set in `design/ds.json` or
 *            `design/canvas-inventory.json`; hash = canonical hash of the matched inventory entry.
 * Every refusal is a `REGISTRY_BAD_SOURCE_REF` naming the exact cause and the path or node.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { canonicalHash } from "../core/ds-manifest.js";
import { RegistryError } from "../core/registry-store.js";
import type { ComponentProvenance } from "../core/registry-store.js";

const bad = (message: string): RegistryError => new RegistryError("REGISTRY_BAD_SOURCE_REF", `REGISTRY_BAD_SOURCE_REF: ${message}`);

/** `sha256-<base64url>`, the same shape the manifest uses, over the exact UTF-8 bytes of `text`. */
export function sha256OfText(text: string): string {
  return `sha256-${createHash("sha256").update(text, "utf8").digest("base64url")}`;
}

const FIGMA_REF = /^figma:(\d+:\d+)$/;
const CODE_REF = /^(.+):(\d+)(?:-(\d+))?$/;

/** Parse and verify a `--source-ref` value. `storeDir` is the design system's `design/` folder. */
export function verifySourceRef(sourceRef: string, storeDir: string): ComponentProvenance {
  if (sourceRef.startsWith("figma:")) return verifyFigmaRef(sourceRef, storeDir);
  return verifyCodeRef(sourceRef, resolve(storeDir, ".."));
}

function insideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function verifyCodeRef(sourceRef: string, projectRoot: string): ComponentProvenance {
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
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.startsWith("\\")) {
    throw bad(`path '${path}' is absolute — give it relative to the project root '${projectRoot}'`);
  }
  const file = resolve(projectRoot, path);
  if (!insideRoot(projectRoot, file)) {
    throw bad(`path '${path}' escapes the project root '${projectRoot}'`);
  }
  if (!existsSync(file)) throw bad(`file '${path}' does not exist under the project root '${projectRoot}'`);
  if (!statSync(file).isFile()) throw bad(`'${path}' is not a file`);
  // A symlink inside the root must not smuggle in a file from outside it.
  if (!insideRoot(realpathSync(projectRoot), realpathSync(file))) {
    throw bad(`path '${path}' resolves through a link to a file outside the project root '${projectRoot}'`);
  }
  const text = readFileSync(file, "utf8");
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop(); // the newline that ends the last line
  const count = lines.length;
  if (end > count) {
    throw bad(`line range ${start}-${end} is past the end of '${path}', which has ${count} line(s)`);
  }
  return { kind: "code", sourceRef, sha256: sha256OfText(lines.slice(start - 1, end).join("\n")) };
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
