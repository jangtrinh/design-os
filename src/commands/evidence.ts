/**
 * `ui evidence` — the user-evidence ledger (DESIGN-OS T6). Records findings backed by
 * real sources so acceptance criteria (T0 `ui critique-coverage --evidence-dir`) can cite
 * them. The anti-fabrication gate lives in the model: a `quote` finding must be a verbatim
 * substring of its ingested source, or `add`/`verify` reject it. Deterministic; no model.
 */
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import {
  EvidenceError, validateForAdd, supportOf, nextEvidenceId,
} from "../core/evidence-model.js";
import type { EvidenceKind, EvidenceRecord, EvidenceSource, EvidenceMetric } from "../core/evidence-model.js";
import {
  loadEvidence, appendEvidence, ingestSource, verifyRecord, verifyAll, listSources,
} from "../core/evidence-store.js";

const CMD = "evidence";
const DEFAULT_DIR = "design";

export const EVIDENCE_HELP = `ui evidence — the user-evidence ledger (findings backed by real sources)

Usage:
  ui evidence add    --finding "…" [--kind quote|metric|observation] [--quote "…"] [--source FILE]
                     [--medium interview|survey|analytics|…] [--locator "line 42"] [--metric VALUE]
                     [--unit U] [--n N] [--tags a,b] [--dir design] [--json]
  ui evidence list   [--dir design] [--json]
  ui evidence verify [--dir design] [--json]
  ui evidence show   <id> [--dir design] [--json]

Subcommands:
  add     Append a finding. kind=quote (default) REQUIRES a --quote that is a verbatim substring
          of --source (else rejected). kind=metric requires --metric + --source. kind=observation
          is accepted but flagged 'unsupported'.
  list    List every recorded finding with its support level and verify status.
  verify  Re-check every quote finding against its stored source; exit 1 on any fabricated/broken quote.
  show    Print one finding by id.

The store is a self-contained dir (default 'design/'): research.events.jsonl + research-sources/.
Commit both so anyone can re-verify. Turning raw transcripts into findings is the host model's job;
this binary only records and verifies — it never invents evidence.

Options:
  --dir DIR   Evidence store directory (default 'design')
  --json      Emit a JSON envelope
  -h, --help  Show this help

Exit codes:
  0  Success (verify: all quotes intact)
  1  A rejected add, a failed verify, or a user/file error

Error codes:
  BAD_ARG         Missing subcommand / required field
  UNKNOWN_FLAG    Unrecognised --flag
  FILE_NOT_FOUND  A --source file does not exist
  READ_ERROR      A file cannot be read
  QUOTE_TOO_SHORT The --quote is too short to verify
  QUOTE_MISMATCH  The --quote is not a verbatim substring of --source
  SOURCE_MISSING  A referenced source is absent from the store
  SOURCE_COLLISION A different source with the same name already exists
  BAD_EVIDENCE    A ledger line is malformed
  NOT_FOUND       No finding with the given id
`;

const str = (v: string | boolean | undefined): string | undefined => (typeof v === "string" ? v : undefined);

function runAdd(parsed: ParsedArgs): CommandResult {
  const sub = "evidence add";
  const useJson = parsed.json;
  const dir = str(parsed.flags["dir"]) ?? DEFAULT_DIR;
  const kind = (str(parsed.flags["kind"]) ?? "quote") as EvidenceKind;
  if (!["quote", "metric", "observation"].includes(kind)) return fail(useJson, sub, "BAD_ARG", `--kind must be quote|metric|observation (got '${kind}')`);

  const finding = str(parsed.flags["finding"]);
  const quote = str(parsed.flags["quote"]);
  const sourcePath = str(parsed.flags["source"]);
  const metricVal = str(parsed.flags["metric"]);
  const metric: EvidenceMetric | undefined = metricVal !== undefined
    ? { value: metricVal, ...(str(parsed.flags["unit"]) ? { unit: str(parsed.flags["unit"]) } : {}), ...(str(parsed.flags["n"]) ? { n: Number(str(parsed.flags["n"])) } : {}) }
    : undefined;

  try {
    validateForAdd(kind, { finding, quote, source: sourcePath !== undefined ? { ref: sourcePath } : undefined, metric });
  } catch (e) {
    return failFromError(useJson, sub, e);
  }

  // Ingest + verify the source (for quote/metric that reference one).
  let source: EvidenceSource | undefined;
  if (sourcePath !== undefined) {
    let ref: string;
    try { ref = ingestSource(dir, sourcePath); }
    catch (e) { return failFromError(useJson, sub, e); }
    source = { ref, ...(str(parsed.flags["medium"]) ? { medium: str(parsed.flags["medium"]) } : {}), ...(str(parsed.flags["locator"]) ? { locator: str(parsed.flags["locator"]) } : {}) };
  }

  const existing = safeLoad(dir);
  if (existing instanceof EvidenceError) return failFromError(useJson, sub, existing);
  const tags = str(parsed.flags["tags"])?.split(",").map((t) => t.trim()).filter(Boolean);
  const rec: EvidenceRecord = {
    id: nextEvidenceId(existing), kind, finding: finding as string,
    ...(quote !== undefined ? { quote } : {}), ...(metric ? { metric } : {}),
    ...(source ? { source } : {}), ...(tags && tags.length ? { tags } : {}),
  };

  // Enforce the verbatim gate for quotes before persisting.
  if (kind === "quote") {
    const v = verifyRecord(dir, rec);
    if (!v.ok) return fail(useJson, sub, "QUOTE_MISMATCH", v.reason ?? "quote does not match source");
  }
  appendEvidence(dir, rec);
  if (useJson) return okJsonWithExit(sub, { id: rec.id, support: supportOf(rec), record: rec }, 0);
  return { exitCode: 0, stdout: `evidence add: recorded ${rec.id} (${supportOf(rec)}) — "${trunc(rec.finding)}"\n` };
}

function runList(parsed: ParsedArgs): CommandResult {
  const sub = "evidence list";
  const useJson = parsed.json;
  const dir = str(parsed.flags["dir"]) ?? DEFAULT_DIR;
  const recs = safeLoad(dir);
  if (recs instanceof EvidenceError) return failFromError(useJson, sub, recs);
  const rows = recs.map((r) => ({ ...r, support: supportOf(r), verify: verifyRecord(dir, r) }));
  if (useJson) return okJsonWithExit(sub, { dir, count: rows.length, sources: listSources(dir), evidence: rows }, 0);
  if (rows.length === 0) return { exitCode: 0, stdout: `evidence list: ${dir} — no findings recorded yet.\n` };
  const lines = [`evidence list: ${dir} — ${rows.length} finding(s)`,
    ...rows.map((r) => `  ${r.verify.ok ? "✓" : "✗"} ${r.id} [${r.support}] ${trunc(r.finding)}${r.source ? ` (${r.source.ref})` : ""}`)];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

function runVerify(parsed: ParsedArgs): CommandResult {
  const sub = "evidence verify";
  const useJson = parsed.json;
  const dir = str(parsed.flags["dir"]) ?? DEFAULT_DIR;
  let results;
  try { results = verifyAll(dir); }
  catch (e) { return failFromError(useJson, sub, e); }
  const failed = results.filter((r) => !r.ok);
  const exitCode = failed.length > 0 ? 1 : 0;
  if (useJson) return okJsonWithExit(sub, { dir, checked: results.length, failed: failed.length, results }, exitCode);
  const lines = failed.length === 0
    ? [`evidence verify: ${dir} — ${results.length} finding(s), all quotes verbatim-intact.`]
    : [`evidence verify: ${dir} — ${failed.length} of ${results.length} FAILED`,
       ...failed.map((r) => `  ✗ ${r.id}: ${r.reason}`)];
  return { exitCode, stdout: lines.join("\n") + "\n" };
}

function runShow(parsed: ParsedArgs): CommandResult {
  const sub = "evidence show";
  const useJson = parsed.json;
  const dir = str(parsed.flags["dir"]) ?? DEFAULT_DIR;
  const id = parsed.positionals[0];
  if (id === undefined) return fail(useJson, sub, "BAD_ARG", "ui evidence show requires <id>");
  const recs = safeLoad(dir);
  if (recs instanceof EvidenceError) return failFromError(useJson, sub, recs);
  const rec = recs.find((r) => r.id === id);
  if (rec === undefined) return fail(useJson, sub, "NOT_FOUND", `no finding with id '${id}'`);
  const v = verifyRecord(dir, rec);
  if (useJson) return okJsonWithExit(sub, { ...rec, support: supportOf(rec), verify: v }, 0);
  const lines = [`evidence show: ${rec.id} [${supportOf(rec)}] ${v.ok ? "✓ verified" : `✗ ${v.reason}`}`,
    `  finding: ${rec.finding}`,
    ...(rec.quote ? [`  quote:   "${rec.quote}"`] : []),
    ...(rec.metric ? [`  metric:  ${rec.metric.value}${rec.metric.unit ? " " + rec.metric.unit : ""}${rec.metric.n ? ` (n=${rec.metric.n})` : ""}`] : []),
    ...(rec.source ? [`  source:  ${rec.source.ref}${rec.source.medium ? ` · ${rec.source.medium}` : ""}${rec.source.locator ? ` · ${rec.source.locator}` : ""}`] : []),
    ...(rec.tags ? [`  tags:    ${rec.tags.join(", ")}`] : [])];
  return { exitCode: 0, stdout: lines.join("\n") + "\n" };
}

// ── helpers ──
function safeLoad(dir: string): EvidenceRecord[] | EvidenceError {
  try { return loadEvidence(dir); }
  catch (e) { return e instanceof EvidenceError ? e : new EvidenceError("READ_ERROR", e instanceof Error ? e.message : String(e)); }
}
const trunc = (s: string): string => (s.length > 70 ? s.slice(0, 67) + "…" : s);
function fail(useJson: boolean, sub: string, code: string, msg: string): CommandResult {
  return useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);
}
function failFromError(useJson: boolean, sub: string, e: unknown): CommandResult {
  const code = e instanceof EvidenceError ? e.code : "READ_ERROR";
  return fail(useJson, sub, code, e instanceof Error ? e.message : String(e));
}

export const evidenceCommand = {
  name: CMD,
  summary: "Record & verify user-evidence findings (anti-fabrication ledger)",
  hasSubcommands: true,
  help: EVIDENCE_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "add": return runAdd(parsed);
      case "list": return runList(parsed);
      case "verify": return runVerify(parsed);
      case "show": return runShow(parsed);
      case undefined: return fail(parsed.json, CMD, "BAD_ARG", "ui evidence requires a subcommand (add/list/verify/show). Run 'ui evidence --help'.");
      default: return fail(parsed.json, CMD, "BAD_ARG", `unknown subcommand '${parsed.subcommand}'. Run 'ui evidence --help'.`);
    }
  },
};
