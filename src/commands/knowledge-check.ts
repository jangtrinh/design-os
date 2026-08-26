/** Filesystem owner for `ui knowledge check`; all rules remain in the pure kernel. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintKnowledge } from "../core/knowledge-lint.js";

function currentMonth(): string { const now = new Date(); return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`; }
export function walkKnowledge(root: string, base = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(root, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base === "" ? ent.name : `${base}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walkKnowledge(root, rel)); else if (ent.isFile()) out.push(rel);
  }
  return out;
}
const optional = (path: string): string | null => { try { return existsSync(path) ? readFileSync(path, "utf8") : null; } catch { return null; } };

export function runKnowledgeCheck(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge check"; const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult => useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
  const unknown = findUnknownFlag(parsed.flags, ["dir", "as-of"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const root = typeof parsed.flags.dir === "string" ? resolve(parsed.flags.dir) : process.cwd(); const knowledgeDir = join(root, "knowledge");
  if (!existsSync(knowledgeDir)) return err("NO_KNOWLEDGE", `no knowledge/ directory under '${root}' — run from a repo root, or pass --dir`);
  const asOfFlag = parsed.flags["as-of"];
  if (asOfFlag === true) return err("BAD_AS_OF", "--as-of requires a YYYYMM value (e.g. 202607)");
  const asOf = typeof asOfFlag === "string" ? asOfFlag : currentMonth();
  if (!/^\d{6}$/.test(asOf)) return err("BAD_AS_OF", `--as-of must be a YYYYMM month (e.g. 202607), got '${asOf}'`);
  let files: string[]; const mdContents: Record<string, string> = {};
  try { files = walkKnowledge(knowledgeDir); for (const rel of files) if (rel.endsWith(".md")) mdContents[rel] = readFileSync(join(knowledgeDir, rel), "utf8"); }
  catch (error) { return err("READ_ERROR", `cannot read knowledge/: ${error instanceof Error ? error.message : String(error)}`); }
  const read = (rel: string) => optional(join(knowledgeDir, rel));
  const tracked = (rel: string) => existsSync(join(knowledgeDir, rel)) ? readFileSync(join(knowledgeDir, rel), "utf8") : null;
  let sourceLedgerJson: string | null; let sourceTree: string | null; let sourceSkills: string | null; let webTechniqueCatalogJson: string | null;
  try { sourceLedgerJson = tracked("sources/mengto-web-techniques--202608.json"); sourceTree = tracked("sources/mengto-web-techniques--202608/tree.json"); sourceSkills = tracked("sources/mengto-web-techniques--202608/skills.json"); webTechniqueCatalogJson = tracked("web-techniques/catalog.json"); }
  catch (error) { return err("READ_ERROR", `cannot read tracked technique knowledge: ${error instanceof Error ? error.message : String(error)}`); }
  const findings = lintKnowledge({
    files, mdContents, repoFiles: files.map((file) => `knowledge/${file}`), asOf,
    personasJson: read("personas/personas.json"), committedIndex: read("index.json"),
    canvasCatalogJson: read("canvas-ui/catalog.json"), gradientCatalogJson: read("shader-gradient/catalog.json"),
    sourceLedgerJson,
    sourceLedgerParts: { "sources/mengto-web-techniques--202608/tree.json": sourceTree ?? "", "sources/mengto-web-techniques--202608/skills.json": sourceSkills ?? "" },
    webTechniqueCatalogJson,
    capabilityCatalogJson: read("capability-profiles.json"),
  });
  const errorCount = findings.filter((finding) => finding.severity === "error").length; const warningCount = findings.length - errorCount;
  if (useJson) return okJsonWithExit(sub, { dir: knowledgeDir, asOf, findings, errorCount, warningCount }, errorCount > 0 ? 1 : 0);
  const lines = findings.length === 0 ? [`knowledge check: ${knowledgeDir} — 0 findings.`] : [`knowledge check: ${knowledgeDir} — ${errorCount} error(s), ${warningCount} warning(s)`, ...findings.map((finding) => `  ${finding.severity === "error" ? "✗" : "!"} [${finding.checkId}]: ${finding.message}`)];
  return { exitCode: errorCount > 0 ? 1 : 0, stdout: `${lines.join("\n")}\n` };
}
