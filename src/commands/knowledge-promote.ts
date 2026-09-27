/**
 * `ui knowledge promote <rulings.json> --ledger <events.jsonl> --out <dir>` — single-project
 * promotion gate. Writes candidates.json + candidates.md, both scrubbed of project-identifying text.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { selectCandidates } from "../core/knowledge-promotion-gate.js";
import { parseLedger } from "../core/knowledge-promotion-ledger.js";
import { renderCandidatesMarkdown } from "../core/knowledge-promotion-render.js";
import type { CandidateView } from "../core/knowledge-promotion-render.js";
import { isRecord, stringArray, usableRulings } from "../core/knowledge-promotion-ruling.js";
import { APPROVER_ROLES } from "../core/rulings-validate.js";
import { scrubText, scrubValue } from "../core/knowledge-scrub.js";
import type { ScrubKind, ScrubNames } from "../core/knowledge-scrub.js";

const SUB = "knowledge promote";
const DEFAULT_MIN_RECURRENCE = 3;
const DEFAULT_MIN_SOURCES = 2;

function positiveInt(flag: unknown, fallback: number): number | null {
  if (flag === undefined) return fallback;
  return typeof flag === "string" && /^[1-9]\d*$/.test(flag) ? Number(flag) : null;
}

/** Shorter names are ordinary words or abbreviations ("am", "cc"): only an explicit --redact may scrub them. */
const MIN_DERIVED_NAME_LENGTH = 4;
const csv = (flag: unknown): string[] => (typeof flag === "string" ? flag.split(",").map((s) => s.trim()).filter((s) => s !== "") : []);
const isRole = (name: string): boolean => (APPROVER_ROLES as readonly string[]).includes(name);

/**
 * Names that identify the project or its people: the explicit --redact / --redact-people lists, plus what the rulings
 * reveal — the apps they are scoped to and the people who verified or approved them. Role words (`owner`, `source`)
 * are not people, and scrubbing them would rewrite ordinary sentences.
 */
function collectNames(rulings: Record<string, unknown>[], redact: unknown, redactPeople: unknown): ScrubNames {
  const projects = new Set(csv(redact));
  const people = new Set(csv(redactPeople));
  const derived = (set: Set<string>, name: string): void => { if (name.length >= MIN_DERIVED_NAME_LENGTH && !isRole(name)) set.add(name); };
  for (const r of rulings) {
    if (isRecord(r["scope"])) for (const app of stringArray(r["scope"]["apps"])) derived(projects, app);
    if (typeof r["verified_by"] === "string") derived(people, r["verified_by"]);
    if (Array.isArray(r["approved_by"])) for (const a of r["approved_by"]) if (isRecord(a) && typeof a["person"] === "string") derived(people, a["person"]);
  }
  return { projects: [...projects], people: [...people] };
}

function readJson(path: string): { ok: true; value: unknown } | { ok: false; code: "FILE_NOT_FOUND" | "BAD_JSON" } {
  let raw: string;
  try { raw = readFileSync(resolve(path), "utf8"); } catch { return { ok: false, code: "FILE_NOT_FOUND" }; }
  try { return { ok: true, value: JSON.parse(raw) as unknown }; } catch { return { ok: false, code: "BAD_JSON" }; }
}

export function runKnowledgePromote(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["ledger", "out", "min-recurrence", "min-sources", "redact", "redact-people"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui knowledge promote requires <rulings.json>");
  const ledgerFlag = parsed.flags["ledger"];
  const outFlag = parsed.flags["out"];
  if (typeof ledgerFlag !== "string") return err("BAD_ARG", "ui knowledge promote requires --ledger <events.jsonl>");
  if (typeof outFlag !== "string") return err("BAD_ARG", "ui knowledge promote requires --out <dir>");
  const redact = parsed.flags["redact"];
  const redactPeople = parsed.flags["redact-people"];
  if (redact === true || redactPeople === true) return err("BAD_ARG", "--redact and --redact-people require a comma list of names");
  const minRecurrence = positiveInt(parsed.flags["min-recurrence"], DEFAULT_MIN_RECURRENCE);
  const minSources = positiveInt(parsed.flags["min-sources"], DEFAULT_MIN_SOURCES);
  if (minRecurrence === null || minSources === null) return err("BAD_THRESHOLD", "--min-recurrence and --min-sources must be positive integers");

  const rulingsDoc = readJson(file);
  if (!rulingsDoc.ok) return err(rulingsDoc.code, `cannot read rulings file '${file}' as JSON`);
  if (!isRecord(rulingsDoc.value) || !Array.isArray(rulingsDoc.value["rulings"])) return err("BAD_RULINGS", `'${file}' has no rulings array — run 'ui knowledge lint'`);
  let ledgerRaw: string;
  try { ledgerRaw = readFileSync(resolve(ledgerFlag), "utf8"); } catch { return err("FILE_NOT_FOUND", `cannot read ledger '${ledgerFlag}'`); }
  const ledger = parseLedger(ledgerRaw);
  if (ledger === null) return err("BAD_LEDGER", `'${ledgerFlag}' is neither JSON Lines nor a JSON document`);

  const params = { minRecurrence, minSources };
  const gate = selectCandidates(rulingsDoc.value, ledger.records, params);
  const names = collectNames(usableRulings(rulingsDoc.value).usable, redact, redactPeople);
  const replaced: Partial<Record<ScrubKind, number>> = {};
  const views: CandidateView[] = gate.candidates.map((c) => {
    const r = c.ruling;
    const view: CandidateView = {
      id: String(r["id"]), category: String(r["category"]), text: String(r["text"]),
      ...(typeof r["detail"] === "string" && r["detail"] !== "" ? { detail: r["detail"] } : {}),
      scope: r["scope"] ?? "global", principle: stringArray(r["principle"]), source: stringArray(r["source"]),
      reasons: c.reasons, recurrence: c.recurrence, distinctSources: c.distinctSources,
    };
    return scrubValue(view, names, replaced);
  });
  const counts = {
    considered: gate.considered, candidates: views.length, notLive: gate.notLive, unusable: gate.unusable,
    ledgerEvents: ledger.records.length, ledgerSkippedLines: ledger.skippedLines,
  };
  const record = { schema: "ruling-candidates/1", params, counts, scrubbed: replaced, candidates: views };
  // Scrub the rendered page as well: boilerplate and joined fields must never carry a leak the record check missed.
  const markdown = scrubText(renderCandidatesMarkdown(views, params, counts), names).text;

  const outDir = resolve(outFlag);
  const jsonPath = join(outDir, "candidates.json");
  const mdPath = join(outDir, "candidates.md");
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(jsonPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    writeFileSync(mdPath, markdown, "utf8");
  } catch (e) {
    return err("WRITE_ERROR", `cannot write to ${outDir}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (parsed.json) return okJson(SUB, { files: [jsonPath, mdPath], ...counts, scrubbed: replaced });
  const head = `knowledge promote: ${counts.candidates} candidate(s) / ${counts.considered} live ruling(s); ledger ${counts.ledgerEvents} event(s), ${counts.ledgerSkippedLines} unreadable line(s); ${counts.notLive} not live, ${counts.unusable} unusable`;
  return { exitCode: 0, stdout: `${head}\n  wrote ${jsonPath}\n  wrote ${mdPath}\n` };
}
