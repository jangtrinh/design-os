/**
 * Helpers of the ontology suites. The ring-1 project is built the way a user builds it, by the kernel's own commands:
 * the Figma ingest compiles the scan into a bundle, the page question is answered from the `--format claude` answer key,
 * and `ui ds import` seals the store and the registry together. Only the scan and the soul are fixture files.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalHash, canonicalStringify } from "../src/core/ds-manifest.js";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";

export const RING1 = join(process.cwd(), "tests", "fixtures", "ontology", "ring1");
export const NOW = "2026-11-11T09:00:00Z";
const scratch = (prefix: string): string => mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), prefix));

export function write(project: string, rel: string, body: string): void {
  mkdirSync(dirname(join(project, rel)), { recursive: true });
  writeFileSync(join(project, rel), body);
}
export const read = (project: string, rel: string): string => readFileSync(join(project, rel), "utf8");
export const json = (out: string): { ok?: boolean; data?: Record<string, any>; error?: { code: string; message: string } } => JSON.parse(out); // eslint-disable-line @typescript-eslint/no-explicit-any

/** Runs a kernel command and fails the setup loudly when it does not exit 0. */
export function must(args: string[]): ReturnType<typeof capture> {
  const done = capture(args);
  if (done.code !== 0) throw new Error(`setup command failed: ui ${args.join(" ")}\n${done.out}${done.err}`);
  return done;
}

/** Answers the screen-pages question of the ingest: the pages named `keep` are kept, the others dropped. */
function answerScreenPages(project: string, keep: readonly string[], pages: readonly string[]): void {
  const entry = keyOf(project).find((k) => k.kind === "screen-pages");
  if (entry === undefined) throw new Error("the ingest raised no screen-pages question");
  const members = Object.fromEntries(pages.map((p) => [p, keep.includes(p) ? "keep" : "drop"]));
  const done = submit(project, [{ fingerprint: entry.fingerprint, choice: ["review-individually"], members }]);
  if (done.code !== 0) throw new Error(`answer failed: ${done.out}${done.err}`);
}

/** Answers every open question of `kind` with one of its options, the way the `--format claude` answer key lets a host. */
function answerOptions(project: string, kind: string, choice: string): void {
  const entries = keyOf(project).filter((k) => k.kind === kind);
  if (entries.length === 0) throw new Error(`the ingest raised a question this helper does not answer: ${keyOf(project).map((k) => k.kind).join(", ")}`);
  const done = submit(project, entries.map((k) => ({ fingerprint: k.fingerprint, choice })));
  if (done.code !== 0) throw new Error(`answer failed: ${done.out}${done.err}`);
}

/** Rewrites the sealed component registry through `change` and reseals the pair, the way an adopted edit would be. */
export function editRegistry(project: string, change: (registry: { components: Record<string, any>[] }) => void): void { // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = join(project, "design");
  const registry = JSON.parse(readFileSync(join(d, "component-registry.json"), "utf8")) as { components: Record<string, any>[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  change(registry);
  const manifest = JSON.parse(readFileSync(join(d, "ds.manifest.json"), "utf8")) as Record<string, unknown>;
  manifest["registryHash"] = canonicalHash(registry);
  writeFileSync(join(d, "component-registry.json"), canonicalStringify(registry));
  writeFileSync(join(d, "ds.manifest.json"), canonicalStringify(manifest));
}

export type Scan = { components: Record<string, any>[]; tokens: Record<string, any>[]; frames?: Record<string, any>[]; sensing?: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Ring1Options {
  soul?: boolean; scan?: boolean; promoted?: boolean;
  /** Changes the scan before the ingest reads it and before it is placed at `design/ds.json`. */
  edit?: (scan: Scan) => void;
}

/** A rule reaches `_adherence.rules.json` only through the owner's act: harvest the bans, then accept one by id. */
export function promoteGradientBan(project: string): void {
  const source = scratch("ontology-source-");
  write(source, "app.css", ".card { background: #ffffff; color: #112233; }\n");
  write(source, "view.tsx", "export const View = () => <main className=\"stack\"><h1>Title</h1></main>;\n");
  must(["ds", "harvest-bans", "--source", source, "--dir", project, "--write"]);
  must(["ds", "harvest-bans", "--accept", "NS-10", "--dir", project]);
}

/** The AC-16 project: sealed store, sealed registry with tokensUsed, a scan with frames and bindings, a ratified soul. */
export function ring1Project(options: Ring1Options = {}): string {
  const project = scratch("ontology-ring1-");
  const bundle = scratch("ontology-bundle-");
  const scan = join(RING1, "ds.json");
  const input = options.edit === undefined ? scan : editedScan(scan, bundle, options.edit);
  const ingest = (): ReturnType<typeof capture> => capture(["ingest-figma-ds", input, "--out", bundle, "--cwd", project, "--now", NOW, "--json"]);
  let done = ingest();
  for (let round = 0; round < 3 && done.code !== 0 && keyOf(project).length > 0; round++) {
    if (keyOf(project).some((k) => k.kind === "screen-pages")) answerScreenPages(project, ["0:2"], ["0:2", "0:3"]);
    else answerOptions(project, "archived-marked-nodes", "keep-archived");
    done = ingest();
  }
  if (done.code !== 0) throw new Error(`ingest failed: ${done.out}${done.err}`);
  must(["ds", "import", join(bundle, "tokens.json"), "--registry", join(bundle, "component-registry.json"), "--dir", project, "--json"]);
  if (options.scan !== false) cpSync(input, join(project, "design", "ds.json"));
  if (options.soul !== false) cpSync(join(RING1, "soul.md"), join(project, "design", "soul.md"));
  if (options.promoted !== false && options.soul !== false) promoteGradientBan(project);
  return project;
}

export const FULL = join(process.cwd(), "tests", "fixtures", "ontology", "full");

/** The ring-1 project plus every ring-2 file a mature project may have written; one component has no bound-variable entry in its scan. */
export function fullProject(): string {
  const project = ring1Project({ edit: (scan) => { delete scan.components.find((c) => c["name"] === "Badge")!["boundVariables"]; } });
  cpSync(FULL, project, { recursive: true });
  return project;
}

export const CODE = join(process.cwd(), "tests", "fixtures", "ontology", "code");

/** The code door: the app is copied, its tokens are sealed by `ui ds import`, its components are registered by `ui ds surface --register --apply`. */
export function codeProject(): string {
  const project = scratch("ontology-code-");
  cpSync(CODE, project, { recursive: true, filter: (src) => !src.endsWith("tokens.json") });
  must(["ds", "import", join(CODE, "tokens.json"), "--dir", project, "--json"]);
  must(["ds", "surface", "--cwd", project, "--register", "--apply", "--now", NOW, "--json"]);
  return project;
}

function editedScan(scan: string, dir: string, edit: (scan: Scan) => void): string {
  const doc = JSON.parse(readFileSync(scan, "utf8")) as Scan;
  edit(doc);
  const out = join(dir, "scan-edited.json");
  writeFileSync(out, JSON.stringify(doc, null, 2));
  return out;
}

export const build = (project: string, ...extra: string[]): ReturnType<typeof capture> => capture(["ontology", "build", "--dir", project, "--json", ...extra]);
export const lint = (project: string, ...extra: string[]): ReturnType<typeof capture> => capture(["ontology", "lint", "--dir", project, "--json", ...extra]);
export const ontologyOf = (project: string): { nodes: { id: string; kind: string; name: string; [k: string]: unknown }[]; links: { kind: string; from: string; to: string }[]; sources: { kind: string; status: string; note: string }[]; linkReports: { link: string; written: number; unresolved: number; notSensed: number; notSensedReason?: string; notChecked?: number; details: string[] }[]; [k: string]: unknown } =>
  JSON.parse(read(project, "design/knowledge/ontology.json"));
