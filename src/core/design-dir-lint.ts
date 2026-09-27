/**
 * Rules of `ui design lint` — the deviations from the `design/` layout in docs/design-directory.md.
 * Pure: takes a ProjectView, returns findings. Error-class findings exit 1, warnings are advisory.
 */
import type { ProjectView } from "./design-dir-scan.js";
import { buildPrinciplesIndex, serializePrinciplesIndex } from "./design-dir-principles.js";
import { validateMethodSchema } from "./method-json-schema.js";
import type { Schema } from "./method-json-schema.js";

export interface DesignFinding {
  checkId: string; severity: "error" | "warning"; path: string; message: string; fix: string;
}

export const TOKEN_SOURCE = "design/tokens.json";
export const MANIFEST_PATH = "design/design-dir.json";
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

/** Token files a project declares as derived from design/tokens.json (design/design-dir.json). */
function declaredDerived(view: ProjectView, schema: Schema, out: DesignFinding[]): Set<string> {
  const doc = parseJson(view.read(MANIFEST_PATH));
  if (!view.files.includes(MANIFEST_PATH)) return new Set();
  const issues = doc === undefined ? [`$: not valid JSON`] : validateMethodSchema(doc, schema);
  if (issues.length > 0) {
    out.push({ checkId: "bad-manifest", severity: "error", path: MANIFEST_PATH, message: `${MANIFEST_PATH} does not match the design-dir schema: ${issues.slice(0, 3).join("; ")}`,
      fix: "Shape: { \"version\": 1, \"derived\": [{ \"path\": \"…\", \"derived_from\": \"design/tokens.json\" }] } (schemas/design-dir.schema.json)" });
    return new Set();
  }
  return new Set(((doc as { derived?: { path: string }[] }).derived ?? []).map((d) => d.path));
}

export function lintDesignDir(view: ProjectView, schema: Schema): DesignFinding[] {
  const out: DesignFinding[] = [];
  const has = (p: string): boolean => view.files.includes(p);
  const derived = declaredDerived(view, schema, out);

  if (!has(TOKEN_SOURCE)) out.push({ checkId: "missing-token-source", severity: "error", path: TOKEN_SOURCE, message: "the single token source design/tokens.json is missing", fix: "Create design/tokens.json (or move the canonical file there) — it is the only hand-edited token file" });
  for (const p of view.files.filter((f) => isTokenFile(f) && f !== TOKEN_SOURCE && !derived.has(f))) {
    out.push({ checkId: "extra-token-file", severity: "error", path: p, message: `a second token file: ${p}`,
      fix: `Delete it, or declare it in ${MANIFEST_PATH} as { "path": "${p}", "derived_from": "${TOKEN_SOURCE}" } if a build step emits it` });
  }
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
  const rulings = (parseJson(view.read("design/knowledge/rulings.json")) as { rulings?: { id?: string; text?: string; detail?: string; superseded_by?: unknown }[] } | undefined)?.rulings;
  for (const r of Array.isArray(rulings) ? rulings : []) {
    if (r.superseded_by === undefined && /\bsupersed(?:ed|es)\b/i.test(`${r.text ?? ""} ${r.detail ?? ""}`)) {
      out.push({ checkId: "supersession-not-in-field", severity: "error", path: `design/knowledge/rulings.json#${r.id ?? "?"}`, message: "the prose says it is superseded but superseded_by is not set", fix: "Set superseded_by to the replacing ruling id, then remove the marker from the prose" });
    }
  }

  lintPrinciplesIndex(view, out);
  lintStaleIngest(view, out);
  return out;
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
