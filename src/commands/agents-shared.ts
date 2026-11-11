/**
 * What the `ui agents` subcommands share: the project, the templates, the studio name, the ontology file the area block
 * is read from, and the stamped agent files of each runtime on disk.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDesignSystem, pathsForDir } from "../core/design-system.js";
import { loadManifest, DSManifestError } from "../core/ds-manifest.js";
import { easeHome } from "../core/memory-store.js";
import { STUDIO_SOUL_FILENAME, soulName } from "../core/ds-soul-studio.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { ROSTER, parseAgentStamp } from "../core/agents-gen.js";
import type { AgentRole, AgentStamp } from "../core/agents-gen.js";
import { ontologyView } from "../core/agents-areas-block.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END, CODEX_REL } from "../core/agents-targets.js";
import type { TargetContext } from "../core/agents-targets.js";
import { ONTOLOGY_REL } from "../core/ontology/ontology-types.js";

export type Fail = { fail: true; code: string; message: string };
export const fail = (code: string, message: string): Fail => ({ fail: true, code, message });
export const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && (v as { fail?: unknown }).fail === true;
export const isRosterRole = (r: string): r is AgentRole => (ROSTER as readonly string[]).includes(r);

const DS_HINT = "no design/ds.manifest.json found — agents bind to a project design system; run 'ui ds init <name>' (or /ui:learn) first.";
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Project root + manifest name, from --dir or upward discovery. */
export function loadProject(dirFlag: string | boolean | undefined): { root: string; project: string } | Fail {
  let designDir: string;
  if (typeof dirFlag === "string") designDir = pathsForDir(resolve(dirFlag, "design")).dir;
  else {
    try { designDir = discoverDesignSystem(undefined).dir; }
    catch { return fail("DS_NOT_FOUND", DS_HINT); }
  }
  try {
    const manifest = loadManifest(join(designDir, "ds.manifest.json"));
    return { root: dirname(designDir), project: manifest.name };
  } catch (e) {
    if (e instanceof DSManifestError && e.code === "MANIFEST_NOT_FOUND") return fail("DS_NOT_FOUND", DS_HINT);
    return fail(e instanceof DSManifestError ? e.code : "READ_ERROR", errText(e));
  }
}

/** Project root for read-only scans — --dir, else the discovered DS project, else cwd. */
export function resolveRoot(dirFlag: string | boolean | undefined): string {
  if (typeof dirFlag === "string") return resolve(dirFlag);
  try { return dirname(discoverDesignSystem(undefined).dir); }
  catch { return process.cwd(); }
}

/** Studio name from $EASE_DESIGN_HOME/studio-soul.md, or null (absence degrades silently). */
export function studioNameFromHome(): string | null {
  const p = join(easeHome(), STUDIO_SOUL_FILENAME);
  try { return existsSync(p) ? soulName(readFileSync(p, "utf8")) : null; }
  catch { return null; }
}

/** The role templates (and the knowledge root beside them) from the package, joined with the project facts into one context. */
export function targetContext(root: string, project: string): TargetContext | Fail {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const { templatesRoot, knowledgeRoot } = resolvePackageRoots(startDir);
  if (templatesRoot === null) return fail("READ_ERROR", `ease-design templates not found (searched upward from ${startDir})`);
  const tpls = {} as Record<AgentRole, string>;
  for (const role of ROSTER) {
    const p = join(templatesRoot, "agents", `${role}.md`);
    try { tpls[role] = readFileSync(p, "utf8"); }
    catch (e) { return fail("READ_ERROR", `cannot read agent template '${p}': ${errText(e)}`); }
  }
  const file = join(root, ONTOLOGY_REL);
  let text: string | null;
  try { text = existsSync(file) ? readFileSync(file, "utf8") : null; }
  catch (e) { return fail("READ_ERROR", `cannot read '${ONTOLOGY_REL}': ${errText(e)}`); }
  return { tpls, knowledgeRoot, project, studio: studioNameFromHome(), view: ontologyView(text) };
}

export interface ScannedAgent { name: string; rel: string; path: string; text: string; stamp: AgentStamp }

function stamped(files: readonly { name: string; rel: string; path: string }[]): ScannedAgent[] | Fail {
  const out: ScannedAgent[] = [];
  for (const f of files) {
    let text: string;
    try { text = readFileSync(f.path, "utf8"); }
    catch (e) { return fail("READ_ERROR", `cannot read '${f.path}': ${errText(e)}`); }
    const stamp = parseAgentStamp(text);
    if (stamp !== null) out.push({ ...f, text, stamp });
  }
  return out;
}

/** The stamped design-os agent files of `.claude/agents`, name-sorted. Unstamped files are never ours to lint. */
export function scanClaude(root: string): ScannedAgent[] | Fail {
  const dir = join(root, ".claude", "agents");
  if (!existsSync(dir)) return [];
  try {
    return stamped(readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ name: f.replace(/\.md$/, ""), rel: `.claude/agents/${f}`, path: join(dir, f) })));
  } catch (e) { return fail("READ_ERROR", `cannot read '${dir}': ${errText(e)}`); }
}

/** The stamped agent skills under `.agent/skills/` (the kernel's own craft skills carry no roster stamp). */
export function scanAntigravity(root: string): ScannedAgent[] | Fail {
  const dir = join(root, ".agent", "skills");
  if (!existsSync(dir)) return [];
  try {
    const names = readdirSync(dir).filter((d) => d.startsWith("design-os-") && existsSync(join(dir, d, "SKILL.md"))).sort();
    return stamped(names.map((d) => ({ name: d.slice("design-os-".length), rel: `.agent/skills/${d}/SKILL.md`, path: join(dir, d, "SKILL.md") })));
  } catch (e) { return fail("READ_ERROR", `cannot read '${dir}': ${errText(e)}`); }
}

/** The design-os agents section of AGENTS.md: its text and the roles it holds, or null when the file has none. */
export function scanCodex(root: string): { text: string; roles: string[] } | null | Fail {
  const p = join(root, CODEX_REL);
  if (!existsSync(p)) return null;
  let host: string;
  try { host = readFileSync(p, "utf8"); }
  catch (e) { return fail("READ_ERROR", `cannot read '${p}': ${errText(e)}`); }
  const start = host.indexOf(CODEX_AGENTS_BEGIN);
  const end = start === -1 ? -1 : host.indexOf(CODEX_AGENTS_END, start);
  if (end === -1) return null;
  const text = host.slice(start, end + CODEX_AGENTS_END.length);
  const roles = [...text.matchAll(/<!--\s*design-os agents\s*·\s*roster-role:\s*([a-z][a-z0-9-]*)\s*·\s*template-hash:\s*[0-9a-f]{8}\s*-->/g)].map((m) => m[1] as string);
  return { text, roles };
}
