/**
 * The code side of `screen` nodes: the `screens` of the surface (page files and what they import), built in memory by
 * the surface builder `ui ds surface` calls. No surface file is written or read. The app roots are the ones the
 * surface's own default accepts; when that rule would need `--app` because the owner kept several, every kept root is
 * read, in sorted order. No component directory found: a missing source.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { scanProject } from "../project-scan.js";
import { scanRulingsOf } from "../project-scan-rulings.js";
import { readAppFiles } from "../ds-surface/app-source-files.js";
import { buildSurface } from "../ds-surface/build-surface.js";
import { chooseAppRoot } from "../ds-surface/choose-app-root.js";
import { componentDirsOf } from "../ds-surface/component-dirs.js";
import { buildTokenLookup } from "../ds-surface/style-references.js";
import { byText } from "../ds-surface/surface-types.js";
import type { SurfaceLink } from "../ds-surface/surface-types.js";
import { nodeId } from "./node-ids.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export interface CodeComponent { name: string; file: string; startLine: number; endLine: number }
export interface CodeFacts { screens: SurfaceLink[]; components: CodeComponent[] }
export interface CodeScreenRead { nodes: OntNode[]; code: CodeFacts | null; report: SourceReport; appRoots: string[] }

const missing = (note: string): CodeScreenRead => ({ nodes: [], code: null, appRoots: [], report: { kind: "screen", status: "missing", nodes: 0, note } });

/** The code door; throws only what the ruling store throws (the caller maps it). */
export function readCodeScreens(projectDir: string): CodeScreenRead {
  const rulings = scanRulingsOf(projectDir);
  const scan = scanProject(projectDir, rulings);
  const choice = chooseAppRoot({
    apps: scan.apps.map((a) => ({ path: a.path, framework: a.framework })), rootFramework: scan.framework,
    rootHasPackage: existsSync(join(projectDir, "package.json")), rulings, projectDir,
  });
  const walked = scan.apps.map((a) => a.path);
  let roots: string[];
  if (choice.ok) roots = [choice.app];
  else if (choice.code === "SURFACE_APP_AMBIGUOUS") roots = rulings.keepRoots.filter((k) => walked.includes(k)).sort(byText);
  else return missing(`the code door has no app root to read (${choice.message.split(". ")[0]})`);

  const screens = new Map<string, SurfaceLink>();
  const components: CodeComponent[] = [];
  for (const app of roots) {
    const files = readAppFiles(projectDir, app, walked, rulings);
    const dirs = componentDirsOf(files.sources.keys());
    if (dirs.length === 0) continue;
    const model = buildSurface({ app: app === "" ? "." : app, componentDirs: dirs, tailwindCss: null, files, lookup: buildTokenLookup(undefined), scan: { truncated: scan.truncated, visited: scan.visited, budget: scan.budget } });
    for (const s of model.output.screens) screens.set(s.file, s);
    for (const d of model.details) components.push({ name: d.name, file: d.file, startLine: d.startLine, endLine: d.endLine });
  }
  if (components.length === 0) return missing("no component directory found in the app: nothing to read screens against; ui ds surface shows what the code door finds");
  const list = [...screens.values()].sort((a, b) => byText(a.file, b.file));
  const nodes = list.map((s): OntNode => ({ id: nodeId("screen", s.file), kind: "screen", name: s.file, door: "code", file: s.file }));
  return { nodes, code: { screens: list, components }, appRoots: roots, report: { kind: "screen", status: "read", nodes: nodes.length, note: `${nodes.length} page file(s) of the code door` } };
}
