/**
 * Two token files that both claim to be the source of a project (spec 033 FR-011, FR-017): the sealed store
 * `design/design.tokens.json` and the hand-edited `design/tokens.json`. The whole condition lives here and is called by
 * `ui design lint` (the `two-token-sources` finding) and by the `source-authority` question with the same view of the
 * project, so the finding and the question can never disagree: which files count as present (the view's file list, so a
 * gitignored file is a second source for neither), how `derived` is read (the design-dir schema, so an invalid entry
 * declares nothing for both), and how the values compare.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectView } from "./design-dir-scan.js";
import { canonicalStringify } from "./ds-manifest.js";
import { resolvePackageRoots } from "./init-stub.js";
import { validateMethodSchema } from "./method-json-schema.js";
import type { Schema } from "./method-json-schema.js";

export const SEALED_STORE = "design/design.tokens.json";
export const SECOND_SOURCE = "design/tokens.json";
export const MANIFEST_FILE = "design/design-dir.json";

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Leaf tokens of a DTCG document as path -> serialized $value (null when the text is not a JSON object). */
export function tokenValues(text: string | null): Map<string, string> | null {
  const doc = parseJson(text);
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const out = new Map<string, string>();
  const visit = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return;
    const rec = node as Record<string, unknown>;
    // The kernel's canonical rule (sorted keys), so key order inside an object value is not a difference.
    if ("$value" in rec) { out.set(path, canonicalStringify(rec["$value"])); return; }
    for (const k of Object.keys(rec).sort()) if (!k.startsWith("$")) visit(rec[k], path === "" ? k : `${path}.${k}`);
  };
  visit(doc, "");
  return out;
}

export interface TokenSourceDiff {
  sealedTokens: number;
  otherTokens: number;
  /** Tokens whose path exists only in the sealed store / only in the other file. */
  onlyInSealed: number;
  onlyInOther: number;
  /** Paths in both with a different value. */
  differentValue: number;
  /** True when the two token sets are identical. */
  same: boolean;
}

/** null when either text is not a readable token document: an unreadable file is not a comparison. */
export function diffTokenSources(sealedText: string | null, otherText: string | null): TokenSourceDiff | null {
  const sealed = tokenValues(sealedText);
  const other = tokenValues(otherText);
  if (sealed === null || other === null) return null;
  const onlyInSealed = [...sealed.keys()].filter((k) => !other.has(k)).length;
  const onlyInOther = [...other.keys()].filter((k) => !sealed.has(k)).length;
  const differentValue = [...sealed].filter(([k, v]) => other.has(k) && other.get(k) !== v).length;
  return {
    sealedTokens: sealed.size, otherTokens: other.size, onlyInSealed, onlyInOther, differentValue,
    same: onlyInSealed === 0 && onlyInOther === 0 && differentValue === 0,
  };
}

/** The installed design-dir schema; throws when the package has no schemas directory. */
export function loadDesignDirSchema(): Schema {
  const roots = resolvePackageRoots(dirname(fileURLToPath(import.meta.url)));
  if (roots.templatesRoot === null) throw new Error("installed schemas are unavailable");
  return JSON.parse(readFileSync(join(dirname(roots.templatesRoot), "schemas", "design-dir.schema.json"), "utf8")) as Schema;
}

export interface DerivedReading {
  /** The manifest is in the view's file list. */
  present: boolean;
  /** Schema problems; when there are any, nothing is declared derived. */
  issues: string[];
  derived: Set<string>;
}

/** The token files the manifest declares derived: read through the schema, so an invalid manifest declares nothing. */
export function readDerived(view: Pick<ProjectView, "files" | "read">, schema: Schema): DerivedReading {
  if (!view.files.includes(MANIFEST_FILE)) return { present: false, issues: [], derived: new Set() };
  const doc = parseJson(view.read(MANIFEST_FILE));
  const issues = doc === undefined ? ["$: not valid JSON"] : validateMethodSchema(doc, schema);
  if (issues.length > 0) return { present: true, issues, derived: new Set() };
  return { present: true, issues: [], derived: new Set(((doc as { derived?: { path: string }[] }).derived ?? []).map((d) => d.path)) };
}

export interface TokenSourceInput {
  sealedText: string;
  otherText: string;
  /** Files the project declares derived; a derived sealed store is the contract's own route to a second file. */
  derived: string[];
}

/** The two files as the view lists them, with the declared derived set; null when there is only one source. */
export function tokenSourceInput(view: Pick<ProjectView, "files" | "read">, derived: ReadonlySet<string>): TokenSourceInput | null {
  if (!view.files.includes(SEALED_STORE) || !view.files.includes(SECOND_SOURCE)) return null;
  const sealedText = view.read(SEALED_STORE);
  const otherText = view.read(SECOND_SOURCE);
  return sealedText === null || otherText === null ? null : { sealedText, otherText, derived: [...derived] };
}

/** The difference when both files exist, are readable, are not declared derived and differ; null otherwise. */
export function tokenSourceConflict(input: TokenSourceInput): TokenSourceDiff | null {
  if (input.derived.includes(SEALED_STORE)) return null;
  const diff = diffTokenSources(input.sealedText, input.otherText);
  return diff === null || diff.same ? null : diff;
}
