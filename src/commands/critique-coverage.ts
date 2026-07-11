/**
 * `ui critique-coverage` — the curator's goal-axis accounting (deterministic).
 *
 * Given a brief spec (acceptance criteria) and a produced design manifest
 * (screens + which criteria each covers), report uncovered criteria + coverage %.
 * Zero-token, zero-network, zero-LLM. Read-only. Exit 1 iff coverage < 100% (any
 * uncovered criterion). The taste + goal JUDGMENT stays host-model (curator.md);
 * this is the accounting the binary owns. No subcommands.
 */
import { readFileSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { parseSpec, parseManifest, checkCoverage, CoverageError } from "../core/coverage-check.js";
import { loadEvidence, verifyRecord } from "../core/evidence-store.js";
import { EvidenceError } from "../core/evidence-model.js";

const CMD = "critique-coverage";

export const CRITIQUE_COVERAGE_HELP = `ui critique-coverage — acceptance-criteria coverage of a produced design

Usage:
  ui critique-coverage <spec.json> <manifest.json> [--require-evidence] [--evidence-dir DIR] [--json]

Inputs:
  <spec.json>      The brief: { acceptanceCriteria: [{ id, text?, evidence?: [ids] }], successMetrics?: [...] }
  <manifest.json>  The produced design: { screens: [{ name, coversCriteria?: [ids], states?: [...] }] }

Options:
  --require-evidence  Treat any acceptance criterion with no 'evidence' provenance as an
                      ASSUMPTION — not real coverage. A design can otherwise score 100% against
                      criteria the model invented; this gates that. Exit 1 if any assumption remains.
  --evidence-dir DIR  Resolve each criterion's evidence[] as IDS in the T6 evidence ledger at DIR
                      (default store 'design'). A cited id that doesn't exist, or whose quote no
                      longer matches its source, does NOT make the criterion evidenced and is
                      reported as unresolvedEvidence — a broken citation fails the gate (exit 1).
  --json              Emit a JSON envelope (coveragePct, covered, uncovered, assumptions,
                      evidencedCoveragePct, perCriterion, unknownRefs, unresolvedEvidence)
  -h, --help          Show this help

Reports every acceptance criterion that no screen/state covers, the coverage %, any
assumptions (criteria sourced from no evidence), and unknownRefs (a screen claiming a
criterion the spec doesn't list). The taste and goal-plausibility judgment stay host-model
(see knowledge/figma-craft/curator.md). This accounts a self-report deterministically; it does
NOT prove the design meets the brief — only that claimed criteria are covered and (optionally) sourced.

Exit codes:
  0  100% coverage (and, with --require-evidence, every covered criterion is evidenced)
  1  One or more uncovered criteria or unevidenced assumptions, or a user/file error

Error codes:
  BAD_ARG        Missing <spec.json> or <manifest.json>, or unexpected extra positionals
  FILE_NOT_FOUND An input file does not exist (ENOENT)
  READ_ERROR     An input file exists but cannot be read
  BAD_JSON       An input file is not valid JSON, or is the wrong shape
  BAD_EVIDENCE   The --evidence-dir ledger has a malformed line
`;

class InputError extends Error {
  constructor(readonly code: "FILE_NOT_FOUND" | "READ_ERROR" | "BAD_JSON", message: string) {
    super(message);
  }
}

/** Build an evidence resolver over a T6 ledger dir: a cited id must exist and verify. */
function buildResolver(dir: string): (id: string) => { ok: boolean; reason?: string } {
  const byId = new Map(loadEvidence(dir).map((r) => [r.id, r]));
  return (id: string) => {
    const rec = byId.get(id);
    if (rec === undefined) return { ok: false, reason: `no evidence '${id}' in ${dir}` };
    const v = verifyRecord(dir, rec);
    return v.ok ? { ok: true } : { ok: false, reason: v.reason ?? "unverified" };
  };
}

function readJson(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    throw new InputError(
      isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR",
      isNotFound ? `file not found: '${path}'` : `cannot read file '${path}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new InputError("BAD_JSON", `invalid JSON in '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

function formatReport(result: ReturnType<typeof checkCoverage>): string {
  const lines: string[] = [`critique-coverage: ${result.covered.length}/${result.criterionCount} criteria covered (${result.coveragePct}%) across ${result.screenCount} screen(s)`];
  if (result.uncovered.length > 0) {
    lines.push("  UNCOVERED (no screen/state covers these):");
    for (const p of result.perCriterion.filter((x) => x.coveredBy.length === 0)) {
      lines.push(`    [${p.id}] ${p.text ?? ""}`.trimEnd());
    }
  } else {
    lines.push("  All acceptance criteria covered.");
  }
  if (result.unknownRefs.length > 0) {
    lines.push(`  unknownRefs (screens claim criteria not in the spec): ${result.unknownRefs.join(", ")}`);
  }
  if (result.unresolvedEvidence !== undefined && result.unresolvedEvidence.length > 0) {
    lines.push("  BROKEN EVIDENCE (cited id missing or quote no longer verbatim — fails the gate):");
    for (const u of result.unresolvedEvidence) lines.push(`    [${u.criterionId}] ${u.evidenceId}: ${u.reason}`);
  }
  if (result.assumptions.length > 0) {
    const tag = result.requireEvidence ? "ASSUMPTIONS (no evidence — NOT counted as real coverage)" : "assumptions (no evidence provenance)";
    lines.push(`  ${tag}: ${result.assumptions.join(", ")}`);
    if (result.requireEvidence && result.evidencedCoveragePct !== undefined) {
      lines.push(`  evidence-backed coverage: ${result.evidencedCoveragePct}% (assumptions excluded)`);
    }
  }
  return lines.join("\n") + "\n";
}

export const critiqueCoverageCommand = {
  name: CMD,
  summary: "Deterministic acceptance-criteria coverage of a produced design (the curator's goal axis)",
  hasSubcommands: false,
  help: CRITIQUE_COVERAGE_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const specPath = parsed.positionals[0];
    const manifestPath = parsed.positionals[1];
    if (specPath === undefined || manifestPath === undefined) {
      const msg = "ui critique-coverage requires <spec.json> and <manifest.json>";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 2) {
      const msg = `ui critique-coverage takes exactly two files; unexpected: ${parsed.positionals.slice(2).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    const requireEvidence = parsed.flags["require-evidence"] === true;
    const evidenceDir = typeof parsed.flags["evidence-dir"] === "string" ? parsed.flags["evidence-dir"] : undefined;
    let result: ReturnType<typeof checkCoverage>;
    try {
      const spec = parseSpec(readJson(specPath), specPath);
      const manifest = parseManifest(readJson(manifestPath), manifestPath);
      const resolveEvidence = evidenceDir !== undefined ? buildResolver(evidenceDir) : undefined;
      result = checkCoverage(spec, manifest, { requireEvidence, ...(resolveEvidence ? { resolveEvidence } : {}) });
    } catch (e) {
      if (e instanceof InputError || e instanceof CoverageError) {
        return useJson ? errJson(CMD, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      if (e instanceof EvidenceError) {
        const code = e.code === "BAD_EVIDENCE" ? "BAD_EVIDENCE" : "READ_ERROR";
        return useJson ? errJson(CMD, code, e.message) : errText(`ui: ${e.message}\n`);
      }
      throw e;
    }

    // Gate: uncovered criteria fail; unsourced assumptions fail under --require-evidence; a
    // BROKEN evidence citation (fabricated/drifted quote) always fails when a ledger was consulted.
    const exitCode =
      result.uncovered.length > 0 ||
      (requireEvidence && result.assumptions.length > 0) ||
      (result.unresolvedEvidence !== undefined && result.unresolvedEvidence.length > 0) ? 1 : 0;
    if (useJson) {
      return okJsonWithExit(CMD, result, exitCode);
    }
    return { exitCode, stdout: formatReport(result) };
  },
};
