/**
 * Rules of `ui design lint` — the deviations from the `design/` layout in docs/design-directory.md.
 * Pure: takes a ProjectView, returns findings. Error-class findings exit 1, warnings are advisory.
 */
import type { ProjectView } from "./design-dir-scan.js";
import { buildPrinciplesIndex, serializePrinciplesIndex } from "./design-dir-principles.js";
import { parseSupersededMarker } from "./ds-guidelines-rulings-reader.js";
import { MANIFEST_FILE, SEALED_STORE, SECOND_SOURCE, readDerived, tokenSourceConflict, tokenSourceInput } from "./design-token-sources.js";
import { AUTHORITATIVE } from "./owner-rulings/kind-source-authority.js";
import { governedOutcomes, indexRulings } from "./owner-rulings/resolve-detections.js";
import { parseRuling } from "./owner-rulings/ruling-store.js";
import type { Ruling } from "./owner-rulings/ruling-store.js";
import type { Schema } from "./method-json-schema.js";

export interface DesignFinding {
  checkId: string; severity: "error" | "warning"; path: string; message: string; fix: string;
}

export const TOKEN_SOURCE = SECOND_SOURCE;
export const MANIFEST_PATH = MANIFEST_FILE;
/** The token store `ui ds` seals (design-system.ts): never an "extra" token file once the manifest exists. */
export const SEALED_TOKENS = SEALED_STORE;
export const SEALED_MANIFEST = "design/ds.manifest.json";
export const STALE_INGEST_DAYS = 14;
const DAY_MS = 86_400_000;

const base = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const isTokenFile = (p: string): boolean => base(p) === "tokens.json" || base(p).endsWith(".tokens.json");
const isLogPath = (p: string): boolean => /\.jsonl(\.\d+)?$/.test(p) || /\.jsonl\.rotated\.json$/.test(p) || /\.changes\.[^/]+$/.test(p);
const isCachePath = (p: string): boolean => /(^|\/)\.?caches?\//.test(p) || /\.cache(\.[a-z]+)?$/.test(p) || /-cache\.json$/.test(p);
const isArtDirection = (p: string): boolean => /(^|\/)art-direction[^/]*(\/|$)/i.test(p) && !p.startsWith("design/art-direction/");
const isDecisionsFile = (p: string): boolean =>
  p.startsWith("design/") && (p.split("/").includes("decisions") || /^decisions?[.-]/i.test(base(p)));

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Token files a project declares as derived from design/tokens.json (design/design-dir.json), read the way the source-authority question reads them. */
function declaredDerived(view: ProjectView, schema: Schema, out: DesignFinding[]): Set<string> {
  const reading = readDerived(view, schema);
  if (reading.issues.length > 0) {
    out.push({ checkId: "bad-manifest", severity: "error", path: MANIFEST_PATH, message: `${MANIFEST_PATH} does not match the design-dir schema: ${reading.issues.slice(0, 3).join("; ")}`,
      fix: "Shape: { \"version\": 1 | 2, \"derived\": [{ \"path\": \"…\", \"derived_from\": \"design/tokens.json\" }], \"onboard\"?: { \"rulings\": […] } } — onboard only at version 2 (schemas/design-dir.schema.json)" });
  }
  return reading.derived;
}

export function lintDesignDir(view: ProjectView, schema: Schema): DesignFinding[] {
  const out: DesignFinding[] = [];
  const has = (p: string): boolean => view.files.includes(p);
  const derived = declaredDerived(view, schema, out);

  if (!has(TOKEN_SOURCE)) out.push({ checkId: "missing-token-source", severity: "error", path: TOKEN_SOURCE, message: "the single token source design/tokens.json is missing", fix: "Create design/tokens.json (or move the canonical file there) — it is the only hand-edited token file" });
  const sealed = has(SEALED_MANIFEST);
  for (const p of view.files.filter((f) => isTokenFile(f) && f !== TOKEN_SOURCE && !derived.has(f) && !(sealed && f === SEALED_TOKENS))) {
    out.push({ checkId: "extra-token-file", severity: "error", path: p, message: `a second token file: ${p}`,
      fix: `Delete it, or declare it in ${MANIFEST_PATH} as { "path": "${p}", "derived_from": "${TOKEN_SOURCE}" } if a build step emits it` });
  }
  lintTwoTokenSources(view, derived, out);
  for (const [path, what] of [["design/soul.md", "the project soul"], ["design/principles.md", "the principles"], ["design/knowledge/rulings.json", "the rulings"]] as const) {
    if (!has(path)) out.push({ checkId: "missing-required-file", severity: "warning", path, message: `${path} (${what}) is missing`, fix: `Add ${path} — see docs/design-directory.md` });
  }

  // Scoped to design/: plan folders and skill benches keep deliberate records the contract does not govern.
  for (const p of view.files.filter((f) => f.startsWith("design/"))) {
    const kind = isLogPath(p) ? "log" : isCachePath(p) ? "cache" : null;
    if (kind === null) continue;
    if (view.tracked?.has(p)) out.push({ checkId: "tracked-log-or-cache", severity: "error", path: p, message: `a ${kind} is tracked in git: ${p}`, fix: `git rm --cached '${p}' and add its pattern to .gitignore` });
    else if (view.tracked !== null) out.push({ checkId: "unignored-log-or-cache", severity: "warning", path: p, message: `a ${kind} is neither tracked nor gitignored: ${p}`, fix: `Add its pattern to .gitignore before it is committed` });
  }
  if (view.tracked === null) out.push({ checkId: "git-unavailable", severity: "warning", path: ".", message: "the project root is not the top level of a git repository — tracked logs and caches were not checked", fix: "Run the lint from a project root that is its own git repository" });

  for (const p of view.files.filter(isArtDirection)) {
    out.push({ checkId: "art-direction-outside-design", severity: "error", path: p, message: `art direction lives outside design/art-direction/: ${p}`, fix: `git mv '${p}' design/art-direction/${base(p)}` });
  }

  for (const p of view.files.filter(isDecisionsFile)) {
    const n = (view.read(p) ?? "").split("\n").filter((l) => /supersed/i.test(l)).length;
    if (n > 0) out.push({ checkId: "supersession-outside-rulings", severity: "error", path: p, message: `${n} line(s) record supersession in a decisions file`, fix: "Record it once, as superseded_by on the ruling in design/knowledge/rulings.json, and drop the note here" });
  }
  const rulings = (parseJson(view.read("design/knowledge/rulings.json")) as { rulings?: { id?: string; text?: string; superseded_by?: unknown }[] } | undefined)?.rulings;
  for (const r of Array.isArray(rulings) ? rulings : []) {
    // One rule, one implementation (Art IV): the marker is the one knowledge/ds-guidelines.md defines.
    const marker = typeof r.text === "string" ? parseSupersededMarker(r.text) : undefined;
    if (marker !== undefined && r.superseded_by === undefined) {
      out.push({ checkId: "supersession-not-in-field", severity: "error", path: `design/knowledge/rulings.json#${r.id ?? "?"}`, message: "the text starts with a `(SUPERSEDED …)` marker but `superseded_by` is not set",
        fix: `Set superseded_by to the replacing ruling id${marker.by === undefined ? "" : ` (the marker names ${marker.by})`}, then remove the marker from the text` });
    }
  }

  lintPrinciplesIndex(view, out);
  lintStaleIngest(view, out);
  return out;
}

const count = (n: number): string => `${n} ${n === 1 ? "token" : "tokens"}`;

/** The file the owner ruled is the source, when the manifest holds that ruling; null before the question is answered. */
function ruledSource(view: ProjectView): string | null {
  const doc = parseJson(view.read(MANIFEST_PATH)) as { onboard?: { rulings?: unknown } } | undefined;
  const list = doc?.onboard?.rulings;
  if (!Array.isArray(list)) return null;
  let rulings: Ruling[];
  try { rulings = list.map((r, i) => parseRuling(r, i)); } catch { return null; }
  return Object.entries(governedOutcomes(indexRulings(rulings), "source-authority")).find(([, outcome]) => outcome === AUTHORITATIVE)?.[0] ?? null;
}

/**
 * Both the sealed store and the hand-edited file exist and disagree: the project must say which one is the
 * source. The condition is the one the source-authority question uses (design-token-sources.ts); a file declared
 * derived is the contract's own route for keeping a second file, so it is not a finding.
 */
function lintTwoTokenSources(view: ProjectView, derived: Set<string>, out: DesignFinding[]): void {
  const input = tokenSourceInput(view, derived);
  const diff = input === null ? null : tokenSourceConflict(input);
  if (diff === null) return;
  const ruled = ruledSource(view);
  const fix = ruled === null
    ? `Answer the source-authority question: ui onboard questions — or keep one source: delete one of the two files, or declare ${SEALED_TOKENS} derived in ${MANIFEST_PATH}`
    : `The owner ruled ${ruled} is the source (${MANIFEST_PATH}, onboard.rulings): make ${ruled === SEALED_TOKENS ? TOKEN_SOURCE : SEALED_TOKENS} agree with it or remove it${ruled === TOKEN_SOURCE ? `, or declare ${SEALED_TOKENS} derived` : ""}`;
  out.push({ checkId: "two-token-sources", severity: "error", path: SEALED_TOKENS,
    message: `${SEALED_TOKENS} (${count(diff.sealedTokens)}) and ${TOKEN_SOURCE} (${count(diff.otherTokens)}) both exist and differ`, fix });
}

function lintPrinciplesIndex(view: ProjectView, out: DesignFinding[]): void {
  const md = view.read("design/principles.md");
  if (md === null) return;
  const cmd = "ui design principles-index design/principles.md --out design/principles.json";
  const { index, problems } = buildPrinciplesIndex(md, "principles.md");
  if (problems.length > 0) {
    out.push({ checkId: "principles-index-invalid", severity: "error", path: "design/principles.md", message: problems.slice(0, 3).map((p) => p.message).join("; "), fix: "Give every principle heading a Yields-when and a Test bullet" });
    return;
  }
  const disk = view.read("design/principles.json");
  if (disk === null) out.push({ checkId: "missing-principles-index", severity: "error", path: "design/principles.json", message: "design/principles.md has no machine index", fix: cmd });
  else if (disk !== serializePrinciplesIndex(index)) out.push({ checkId: "principles-index-drift", severity: "error", path: "design/principles.json", message: "the index differs from the headings of design/principles.md", fix: cmd });
}

function lintStaleIngest(view: ProjectView, out: DesignFinding[]): void {
  const dsMs = view.mtimeMs("design/ds.json");
  if (dsMs === null) return;
  for (const p of ["design/DESIGN.md", "DESIGN.md", "design/component-registry.json", "component-registry.json"]) {
    const ms = view.mtimeMs(p);
    if (ms === null || dsMs - ms <= STALE_INGEST_DAYS * DAY_MS) continue;
    const days = Math.floor((dsMs - ms) / DAY_MS);
    out.push({ checkId: "stale-ingest", severity: "warning", path: p, message: `${p} is ${days} days older than design/ds.json (limit ${STALE_INGEST_DAYS})`, fix: "Re-run the ingest so DESIGN.md and the registry match ds.json" });
  }
}
