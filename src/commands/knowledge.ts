/**
 * `ui knowledge check` — the deterministic "unit tier" for the knowledge core.
 * Pure kernel: src/core/knowledge-lint.ts (fs-free). This command owns all IO —
 * it walks knowledge/, reads the markdown + personas.json, and hands already-read
 * content to the linter, which returns findings. Free, no model call, runs on
 * every commit (CI). See knowledge/authoring-standard.md for the conventions.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintKnowledge } from "../core/knowledge-lint.js";
import { buildIndex, emitIndex } from "../core/knowledge-index-emit.js";
import { topLevelMarkdown } from "../core/knowledge-frontmatter-check.js";
import type { KnowledgeFinding } from "../core/knowledge-lint.js";
import { runEffectMatrix } from "./knowledge-effect-matrix.js";

const CMD = "knowledge";

export const KNOWLEDGE_HELP = `ui knowledge — governance checks over the knowledge core

Usage:
  ui knowledge check [--dir <repo-root>] [--as-of <YYYYMM>] [--json]
  ui knowledge effect-matrix [--dir <repo-root>] [--json]
  ui knowledge index [--dir <repo-root>] [--emit]

Subcommands:
  check          Findings-linter over knowledge/; exit 1 on error-severity findings
  index          Emit the routing index (id / description / when) over knowledge/*.md.
                 Without --emit it prints to stdout; with --emit it writes
                 knowledge/index.json — one small map an agent reads to pick a
                 knowledge file, instead of loading README's prose table
  effect-matrix  Emit the Canvas UI effect matrix's machine columns (Effect/slug/family)
                 from knowledge/canvas-ui/catalog.json to stdout — never writes into
                 knowledge/canvas-effect-direction.md

Checks:
  index-missing-row       (error)   a knowledge/*.md with no row in README '## The files'
  index-dead-row          (error)   a README table row pointing to a missing file
  persona-drift           (error)   persona-index.md ↔ personas/*.md ↔ personas.json disagree
  broken-xref             (error)   a relative markdown link that does not resolve
  benchmark-stale         (warning) a benchmarks/*.dna.json older than 6 months
  provenance-bad-grammar  (error)   an ease:source marker missing ref= or with a dead ref
  provenance-machine-local-ref   (error)   an ease:source ref into references/** or taste/**
  effect-catalog-missing-ledger  (error)   knowledge file exists, knowledge/canvas-ui/catalog.json doesn't
  effect-catalog-revision-drift  (error)   the knowledge file's pinned revision != the ledger's
  effect-catalog-slug-unknown    (error)   a matrix row's slug is not in the ledger
  effect-catalog-slug-missing    (error)   a ledger slug has no matrix row
  effect-catalog-row-drift       (error)   a matrix row's Effect/family cell disagrees with its ledger entry
  effect-catalog-field-empty     (error)   a matrix row's Narrative job/Anti-use/Required fallback is empty
  effect-catalog-draco-missing   (error)   a ledger object-family row's fallback has no Draco clause
  effect-catalog-stale           (warning) knowledge/canvas-ui/catalog.json captured > 6 months ago
  index-frontmatter-missing      (error)   a top-level knowledge/*.md with no routing front-matter
  index-frontmatter-bad          (error)   a routing block unparseable, or whose id != filename
  index-drift                    (error)   knowledge/index.json differs from the emitted index

Options:
  --dir <path>     Repo root holding knowledge/ (default: current working directory)
  --as-of <YYYYMM> Reference month for benchmark-stale (default: current month) —
                   the one time-dependent input, isolated behind this flag so a
                   pinned value keeps the check fully deterministic
  --json           Emit a JSON envelope
  -h, --help       Show this help

Error codes (check):
  BAD_ARG       Missing/unknown subcommand
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
  NO_KNOWLEDGE  No knowledge/ directory under --dir
  BAD_AS_OF     --as-of is not a YYYYMM month
  READ_ERROR    A knowledge file could not be read
  WRITE_ERROR   knowledge/index.json could not be written (--emit)

Error codes (effect-matrix):
  BAD_ARG       Missing/unknown subcommand
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
  NO_LEDGER     No knowledge/canvas-ui/catalog.json under --dir
  BAD_LEDGER    catalog.json is unparseable or violates the ledger shape
  READ_ERROR    catalog.json could not be read
`;

/** Current month as YYYYMM — the sole non-deterministic input, only when --as-of is absent. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Recursively collect posix-relative file paths under `root`. */
function walk(root: string, base = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(root, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = base === "" ? ent.name : `${base}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walk(root, rel));
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

function runCheck(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge check";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir", "as-of"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const repoRoot = typeof parsed.flags["dir"] === "string" ? resolve(parsed.flags["dir"]) : process.cwd();
  const knowledgeDir = join(repoRoot, "knowledge");
  if (!existsSync(knowledgeDir)) {
    return err("NO_KNOWLEDGE", `no knowledge/ directory under '${repoRoot}' — run from a repo root, or pass --dir`);
  }

  const asOfFlag = parsed.flags["as-of"];
  if (asOfFlag === true) return err("BAD_AS_OF", "--as-of requires a YYYYMM value (e.g. 202607)");
  const asOf = typeof asOfFlag === "string" ? asOfFlag : currentMonth();
  if (!/^\d{6}$/.test(asOf)) return err("BAD_AS_OF", `--as-of must be a YYYYMM month (e.g. 202607), got '${asOf}'`);

  let files: string[];
  const mdContents: Record<string, string> = {};
  try {
    files = walk(knowledgeDir);
    for (const rel of files) if (rel.endsWith(".md")) mdContents[rel] = readFileSync(join(knowledgeDir, rel), "utf8");
  } catch (e) {
    return err("READ_ERROR", `cannot read knowledge/: ${e instanceof Error ? e.message : String(e)}`);
  }

  let personasJson: string | null = null;
  const personasPath = join(knowledgeDir, "personas", "personas.json");
  if (existsSync(personasPath)) {
    try { personasJson = readFileSync(personasPath, "utf8"); } catch { personasJson = null; }
  }

  // repoFiles — the subtree an ease:source ref may target: knowledge/** ONLY (D9, C5).
  // references/** and taste/** are gitignored symlinks into a private repo — resolving
  // through them here is exactly the bug provenance-machine-local-ref exists to catch;
  // a tracked ref may never target either, even where this machine's symlink resolves it.
  const repoFiles = files.map((f) => `knowledge/${f}`);

  // The Canvas UI ledger (spec 028) — read when present so effectCatalogChecks
  // can compare it against knowledge/canvas-effect-direction.md's matrix. It lives
  // inside knowledge/ (tracked, packaged) — never a references/ probe (B10).
  let canvasCatalogJson: string | null = null;
  const ledgerPath = join(knowledgeDir, "canvas-ui", "catalog.json");
  if (existsSync(ledgerPath)) {
    try { canvasCatalogJson = readFileSync(ledgerPath, "utf8"); } catch { canvasCatalogJson = null; }
  }
  const indexPath = join(knowledgeDir, "index.json");
  let committedIndex: string | null = null;
  if (existsSync(indexPath)) {
    try { committedIndex = readFileSync(indexPath, "utf8"); } catch { committedIndex = null; }
  }

  const findings: KnowledgeFinding[] = lintKnowledge({ files, mdContents, personasJson, repoFiles, asOf, canvasCatalogJson, committedIndex });
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.length - errorCount;
  const exitCode = errorCount > 0 ? 1 : 0;

  if (useJson) return okJsonWithExit(sub, { dir: knowledgeDir, asOf, findings, errorCount, warningCount }, exitCode);
  const lines =
    findings.length === 0
      ? [`knowledge check: ${knowledgeDir} — 0 findings.`]
      : [
          `knowledge check: ${knowledgeDir} — ${errorCount} error(s), ${warningCount} warning(s)`,
          ...findings.map((f) => `  ${f.severity === "error" ? "✗" : "!"} [${f.checkId}]: ${f.message}`),
        ];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

function runIndex(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge index";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir", "emit"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const repoRoot = typeof parsed.flags["dir"] === "string" ? resolve(parsed.flags["dir"]) : process.cwd();
  const knowledgeDir = join(repoRoot, "knowledge");
  if (!existsSync(knowledgeDir)) {
    return err("NO_KNOWLEDGE", `no knowledge/ directory under '${repoRoot}' — run from a repo root, or pass --dir`);
  }

  const mdContents: Record<string, string> = {};
  try {
    for (const rel of walk(knowledgeDir)) {
      if (rel.endsWith(".md")) mdContents[rel] = readFileSync(join(knowledgeDir, rel), "utf8");
    }
  } catch (e) {
    return err("READ_ERROR", `cannot read knowledge/: ${e instanceof Error ? e.message : String(e)}`);
  }

  const json = emitIndex(buildIndex(topLevelMarkdown(mdContents)));
  if (parsed.flags["emit"] !== true) return { exitCode: 0, stdout: json };

  const outPath = join(knowledgeDir, "index.json");
  try {
    writeFileSync(outPath, json, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write ${outPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { exitCode: 0, stdout: `knowledge index: wrote ${outPath}\n` };
}

export const knowledgeCommand = {
  name: CMD,
  summary: "Governance checks over the knowledge core (index / persona / xref / provenance / effect-catalog drift)",
  hasSubcommands: true,
  help: KNOWLEDGE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "check": return runCheck(parsed);
      case "effect-matrix": return runEffectMatrix(parsed);
      case "index": return runIndex(parsed);
      case undefined: {
        const msg = "ui knowledge requires a subcommand (check, effect-matrix, index). Run 'ui knowledge --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui knowledge --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
