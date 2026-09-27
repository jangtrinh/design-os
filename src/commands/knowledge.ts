/**
 * `ui knowledge check` — the deterministic "unit tier" for the knowledge core.
 * Pure kernel: src/core/knowledge-lint.ts (fs-free). This command owns all IO —
 * it walks knowledge/, reads the markdown + personas.json, and hands already-read
 * content to the linter, which returns findings. Free, no model call, runs on
 * every commit (CI). See knowledge/authoring-standard.md for the conventions.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { buildIndex, emitIndex } from "../core/knowledge-index-emit.js";
import { topLevelMarkdown } from "../core/knowledge-frontmatter-check.js";
import { runEffectMatrix } from "./knowledge-effect-matrix.js";
import { runGradientMatrix } from "./knowledge-gradient-matrix.js";
import { runKnowledgeCheck, walkKnowledge } from "./knowledge-check.js";
import { runKnowledgeActivate } from "./knowledge-activate.js";
import { runRulingsLint } from "./knowledge-rulings-lint.js";
import { runRulingsRender } from "./knowledge-rulings-render.js";
import { runKnowledgeDraftRuling } from "./knowledge-draft-ruling.js";
import { runKnowledgeFresh } from "./knowledge-fresh.js";
import { runKnowledgePromote } from "./knowledge-promote.js";
import { LEDGER_HELP, runKnowledgeLedger } from "./knowledge-ledger-run.js";

const CMD = "knowledge";

export const KNOWLEDGE_HELP = `ui knowledge — governance checks over the knowledge core

Usage:
  ui knowledge check [--dir <repo-root>] [--as-of <YYYYMM>] [--json]
  ui knowledge activate <request.json> [--dir <repo-root>] [--json]
  ui knowledge effect-matrix [--dir <repo-root>] [--json]
  ui knowledge gradient-matrix [--dir <repo-root>] [--json]
  ui knowledge index [--dir <repo-root>] [--emit]
  ui knowledge lint <rulings.json> [--root <repo-root>] [--json]
  ui knowledge render <rulings.json> --out <dir> [--lang en,vi] [--json]
  ui knowledge fresh <rulings.json> [--root <dir>] [--days 90] [--as-of <YYYY-MM-DD>] [--strict] [--json]
  ui knowledge promote <rulings.json> --ledger <events.jsonl> --out <dir> [--min-recurrence 3] [--min-sources 2] [--redact a,b] [--redact-people a,b] [--json]
  ui knowledge draft-ruling --from <correction.json> --out <rulings-draft.json> [--as-of <YYYY-MM-DD>] [--force] [--ledger <events.jsonl>] [--json]
  ui knowledge ledger lint <events.jsonl> [--json] | ledger append <events.jsonl> --event <json> [--json]

Subcommands:
  activate       Route an available typed surface with explicit assurance; fail closed when unavailable or invalid
  check          Findings-linter over knowledge/; exit 1 on error-severity findings
  index          Emit the routing index (id / description / when) over knowledge/*.md to stdout;
                 --emit writes knowledge/index.json (one small map an agent reads to pick a file)
  lint           Validate a rulings file against schemas/rulings.schema.json, check that repo-path source[]
                 entries exist under --root (default cwd), warn on SUPERSEDED text without superseded_by; exit 1 on errors
  render         Render rulings.<lang>.md (by category, then id) into --out; 'vi' translates only fixed labels, never ruling text
  fresh          Age (since verified_at or since) and source-anchor liveness of every live ruling; prints
                 STALE rows and 'fresh N / stale M / unanchored K'; --strict exits 1 on any stale ruling
  promote        Single-project promotion gate: a live ruling is a candidate when >= N ledger events
                 reference its id or principle[] (learning events: refs[] only) OR it has >= K distinct source
                 documents. Writes a scrubbed candidates.json + candidates.md (project names, hosts, emails,
                 people, absolute paths, Figma file keys replaced by placeholders); zero candidates is exit 0
  draft-ruling   Turn an approver correction {screen, what_was_wrong, what_is_right, evidence[]} into a
                 rulings/1 stub: status draft, approved_by [], source from evidence, since today;
                 --ledger also appends a ruling-candidate event naming the new ruling id
${LEDGER_HELP}  effect-matrix  Emit the Canvas UI effect matrix's machine columns (Effect/slug/family)
                 from knowledge/canvas-ui/catalog.json to stdout — never writes into
                 knowledge/canvas-effect-direction.md
  gradient-matrix Emit the ShaderGradient preset matrix's machine columns (Preset/slug/mesh)
                 from knowledge/shader-gradient/catalog.json to stdout — never writes into
                 knowledge/shader-gradient-direction.md

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
  gradient-catalog-missing-ledger (error)  shader-gradient-direction.md exists, its ledger doesn't
  gradient-catalog-revision-drift (error)  the direction file's pinned SHA != the ledger revision
  gradient-catalog-slug-unknown  (error)   a preset-matrix row's slug is not in the ledger
  gradient-catalog-slug-missing  (error)   a ledger preset has no matrix row
  gradient-catalog-row-drift     (error)   a matrix row's Preset/mesh cell disagrees with its ledger entry
  gradient-catalog-field-empty   (error)   a matrix row's Narrative job/Anti-use/Required fallback is empty
  gradient-catalog-fallback-thin (error)   a Required fallback cell that never names the frozen state
  gradient-catalog-stale         (warning) knowledge/shader-gradient/catalog.json captured > 6 months ago
  source-ledger-*                (error)   pinned MengTo source accounting has invalid paths, parts, hashes, counts, or dispositions
  web-technique-*                (error)   adopted source techniques lack a valid catalog/card mapping or specialist reachability
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

Error codes (activate):
  BAD_ARG | UNKNOWN_FLAG | FILE_NOT_FOUND | BAD_ACTIVATION | NO_CATALOG | BAD_CATALOG
  UNKNOWN_CAPABILITY | UNSUPPORTED_INPUT | CAPABILITY_UNQUALIFIED
  Successful receipts report route availability separately from assurance and qualified-delivery claim policy.

Error codes (lint / render):
  BAD_ARG | UNKNOWN_FLAG | FILE_NOT_FOUND | BAD_JSON (lint) | BAD_LANG | BAD_RULINGS (render) | WRITE_ERROR

Error codes (fresh / promote / draft-ruling):
  BAD_ARG | UNKNOWN_FLAG | FILE_NOT_FOUND | BAD_JSON | BAD_RULINGS | BAD_AS_OF (fresh, draft-ruling)
  BAD_THRESHOLD | BAD_LEDGER | WRITE_ERROR (promote) · BAD_CORRECTION | OUT_EXISTS (draft-ruling)

Error codes (effect-matrix / gradient-matrix):
  BAD_ARG       Missing/unknown subcommand
  UNKNOWN_FLAG  Unrecognised --flag (rejected, with a did-you-mean hint)
  NO_LEDGER     No catalog.json for that ledger under --dir
  BAD_LEDGER    catalog.json is unparseable or violates the ledger shape
  READ_ERROR    catalog.json could not be read
`;

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
  let knowledgeFiles: string[];
  try {
    knowledgeFiles = walkKnowledge(knowledgeDir);
    for (const rel of knowledgeFiles) if (rel.endsWith(".md")) mdContents[rel] = readFileSync(join(knowledgeDir, rel), "utf8");
  } catch (e) {
    return err("READ_ERROR", `cannot read knowledge/: ${e instanceof Error ? e.message : String(e)}`);
  }

  const json = emitIndex(buildIndex(topLevelMarkdown(mdContents), knowledgeFiles));
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
  summary: "Governance checks over the knowledge core (index / persona / xref / provenance / effect-catalog / gradient-catalog drift)",
  hasSubcommands: true,
  help: KNOWLEDGE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "activate": return runKnowledgeActivate(parsed);
      case "check": return runKnowledgeCheck(parsed);
      case "effect-matrix": return runEffectMatrix(parsed);
      case "gradient-matrix": return runGradientMatrix(parsed);
      case "index": return runIndex(parsed);
      case "lint": return runRulingsLint(parsed);
      case "render": return runRulingsRender(parsed);
      case "draft-ruling": return runKnowledgeDraftRuling(parsed);
      case "fresh": return runKnowledgeFresh(parsed);
      case "ledger": return runKnowledgeLedger(parsed);
      case "promote": return runKnowledgePromote(parsed);
      case undefined: {
        const msg = "ui knowledge requires a subcommand (activate, check, draft-ruling, effect-matrix, fresh, gradient-matrix, index, ledger, lint, promote, render). Run 'ui knowledge --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui knowledge --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
