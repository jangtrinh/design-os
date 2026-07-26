#!/usr/bin/env node
/**
 * validate-prereg.mjs — spec 022, the preregistration gate (architecture §H).
 *
 * Zero-dependency, offline, deterministic (Article I / D12). Runs the PR-001..PR-031
 * check list at the requested mode — later modes run all earlier modes' checks — and
 * prints an Article-II findings envelope to stdout, with a human summary on stderr.
 * Never touches the network.
 *
 * Secret-map handling: before the Phase-A gate the map is never opened — PR-016
 * verifies only that `secret_map_location` does not resolve inside the repo. From
 * `--mode post-phase-a` onward the gate MUST resolve which side was which arm, so
 * the map is read IN PLACE, read-only, and only after its bytes hash-match the
 * committed `secret_map_sha256`; at that mode only Phase-A presentations are
 * consulted and Phase-B assignments are never read into a decision. The map is never
 * copied into the repo. The reveal copy's hash is checked (PR-026) only after reveal
 * explicitly happens.
 *
 * Usage:
 *   node validate-prereg.mjs --mode <pre-freeze|pre-render|post-phase-a|post-render|post-reveal> [--corpus <path>] [--json]
 *
 * Exit codes: 0 = errorCount===0, 1 = errors found, 2 = usage/internal failure.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, modeIndex } from "./lib/constants.mjs";
import { makeContext } from "./lib/context.mjs";
import * as freeze from "./lib/checks-freeze.mjs";
import * as render from "./lib/checks-render.mjs";
import * as reveal from "./lib/checks-reveal.mjs";
import * as phaseA from "./lib/checks-phase-a.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(SPEC_DIR, "..", "..");

// One row per PR-check. `minMode` is the earliest CLI mode at which the check
// participates; a later mode always includes it (architecture §H: "later modes run
// all earlier modes' checks"). This list, not the file/line count, is the contract
// (architecture R7 / risk R7).
const CHECKS = [
  { id: "PR-001", minMode: "pre-freeze", run: freeze.prFilesPresent },
  { id: "PR-002", minMode: "pre-freeze", run: freeze.prSchemaValid },
  { id: "PR-003", minMode: "pre-freeze", run: freeze.prSelectionCount },
  { id: "PR-004", minMode: "pre-freeze", run: freeze.prSelectionEnumeration },
  { id: "PR-005", minMode: "pre-freeze", run: freeze.prHashesWellformed },
  { id: "PR-006", minMode: "pre-freeze", run: freeze.prFailuresNoSubstitution },
  { id: "PR-007", minMode: "pre-freeze", run: freeze.prCandidatesFrozen },
  { id: "PR-008", minMode: "pre-freeze", run: freeze.prPatchIntegrity },
  { id: "PR-009", minMode: "pre-freeze", run: freeze.prPatchClean },
  { id: "PR-010", minMode: "pre-freeze", run: freeze.prFamilyBSeparation },
  { id: "PR-011", minMode: "pre-freeze", run: freeze.prPhaseAShape },
  { id: "PR-012", minMode: "pre-freeze", run: freeze.prPhaseBShape },
  { id: "PR-013", minMode: "pre-freeze", run: freeze.prArithmetic },
  { id: "PR-014", minMode: "pre-freeze", run: freeze.prAssetsManifest },
  { id: "PR-015", minMode: "pre-freeze", run: freeze.prReconciliationHashes },
  { id: "PR-016", minMode: "pre-render", run: render.prCommitmentValid },
  { id: "PR-017", minMode: "pre-render", run: render.prCommitmentPrecedesRender },
  { id: "PR-018", minMode: "pre-render", run: render.prCleanTree },
  // F3: the whole post-render evidence/judging/result set now begins at
  // "post-phase-a", scoped to Phase A by ctx.phaseScope. That mode is the gate that
  // decides which families enter Phase B, so it must run the same integrity, repair,
  // no-regeneration, leak, vote, curator, duplicate, contradiction, result and
  // truth-table checks — not the pre-render check set it used to alias.
  { id: "PR-019", minMode: "post-phase-a", run: render.prPreregCommitRecorded },
  { id: "PR-020", minMode: "post-phase-a", run: render.prManifestComplete },
  { id: "PR-021", minMode: "post-phase-a", run: render.prRepairLegality },
  { id: "PR-022", minMode: "post-phase-a", run: render.prNoRegeneration },
  { id: "PR-023", minMode: "post-phase-a", run: render.prBlindingLeakScan },
  { id: "PR-024", minMode: "post-phase-a", run: render.prVoteCoverage },
  { id: "PR-030", minMode: "post-phase-a", run: render.prCuratorBlindnessShape },
  { id: "PR-031", minMode: "post-phase-a", run: phaseA.prPhaseAGate },
  { id: "PR-027", minMode: "post-phase-a", run: reveal.prResultRecompute },
  { id: "PR-028", minMode: "post-phase-a", run: reveal.prTruthTable },
  { id: "PR-025", minMode: "post-reveal", run: reveal.prFreezeOrder },
  { id: "PR-026", minMode: "post-reveal", run: reveal.prCommitmentMatch },
  { id: "PR-029", minMode: "post-reveal", run: reveal.prAllCandidatesAdvance },
];

function parseArgs(argv) {
  const args = { mode: null, corpus: null, json: false, usageError: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--mode") args.mode = argv[++i];
    else if (a === "--corpus") args.corpus = argv[++i];
    else if (a === "--json") args.json = true;
    else {
      args.usageError = `unrecognized argument: ${a}`;
      return args;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.usageError) {
    process.stderr.write(`${args.usageError}\n`);
    process.exitCode = 2;
    return;
  }
  if (!args.mode || !MODES.includes(args.mode)) {
    process.stderr.write(`usage: node validate-prereg.mjs --mode <${MODES.join("|")}> [--corpus <path>] [--json]\n`);
    process.exitCode = 2;
    return;
  }

  const ctx = makeContext({ specDir: SPEC_DIR, repoRoot: REPO_ROOT, corpus: args.corpus || null, mode: args.mode });
  const currentIndex = modeIndex(args.mode);

  const findings = [];
  for (const check of CHECKS) {
    if (currentIndex < modeIndex(check.minMode)) continue;
    try {
      findings.push(...check.run(ctx));
    } catch (err) {
      findings.push({ checkId: check.id, severity: "error", message: `check threw: ${err.stack || err.message}` });
    }
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const envelope = { findings, errorCount, warningCount };

  process.stdout.write(JSON.stringify(envelope, null, args.json ? undefined : 2) + "\n");

  process.stderr.write(`\nspec 022 preregistration validator — mode=${args.mode}\n`);
  process.stderr.write(`  ${errorCount} error(s), ${warningCount} warning(s)\n`);
  for (const f of findings) {
    process.stderr.write(`  [${f.severity.toUpperCase()}] ${f.checkId}: ${f.message}${f.path ? ` (${f.path})` : ""}\n`);
  }

  // `process.exitCode`, never `process.exit()`. When stdout is a pipe, Node writes
  // it asynchronously and `process.exit()` discards whatever has not flushed — at
  // ~64 KiB the envelope was being truncated mid-string, so a post-render run with
  // many findings emitted INVALID JSON to its consumer while still exiting 1. Setting
  // the exit code lets the event loop drain first.
  process.exitCode = errorCount > 0 ? 1 : 0;
}

main();
