/** `ui judge report <judgments.jsonl> [--families <families.json>]` — shadow-vs-human agreement per decision point. */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { validateFamilies } from "../core/judge-validate.js";
import type { JudgeFinding, PersonaFamilies } from "../core/judge-validate.js";
import { latestById, readLedger } from "../core/judge-store.js";
import { MIN_SAMPLE, buildStats, unknownFamilyRefs } from "../core/judge-report-build.js";
import type { PointStats } from "../core/judge-report-build.js";

const SUB = "judge report";

function statLine(s: PointStats): string {
  const name = s.decisionPoint.padEnd(17);
  if (s.status === "not-enough-data") return `  ${name} not enough data (n=${s.resolved} resolved, need ${MIN_SAMPLE}) · pending ${s.pending}`;
  const pct = Math.round((s.agreementRate ?? 0) * 100);
  return `  ${name} agreement ${pct}% (${s.accepted}/${s.resolved} accepted) · changed ${s.changed} · rejected ${s.rejected} · pending ${s.pending}`;
}

export function runJudgeReport(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["families"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui judge report requires <judgments.jsonl>");
  const famFlag = parsed.flags["families"];
  if (famFlag === true) return err("BAD_ARG", "--families requires a path to families.json");
  if (!existsSync(resolve(file))) return err("FILE_NOT_FOUND", `cannot read '${file}'`);

  const ledger = readLedger(resolve(file));
  const problems: { where: string; findings: JudgeFinding[] }[] = ledger.errors.map((e) => ({ where: `line ${e.line}`, findings: e.findings }));
  const latest = latestById(ledger.records);
  let families: PersonaFamilies | null = null;
  if (typeof famFlag === "string") {
    if (!existsSync(resolve(famFlag))) return err("FILE_NOT_FOUND", `cannot read '${famFlag}'`);
    let doc: unknown;
    try { doc = JSON.parse(readFileSync(resolve(famFlag), "utf8")); } catch { return err("BAD_JSON", `'${famFlag}' is not valid JSON`); }
    const findings = validateFamilies(doc);
    if (findings.length > 0) problems.push({ where: `families ${famFlag}`, findings });
    else families = doc as PersonaFamilies;
  }
  const unknownRefs = families === null ? [] : unknownFamilyRefs(latest, families);
  for (const u of unknownRefs) problems.push({ where: `judgment ${u.id}`, findings: [{ field: "persona-family", message: `'${u.ref}' is not a family in ${famFlag as string}` }] });

  const stats = buildStats(latest);
  const exitCode = problems.length > 0 ? 1 : 0;
  if (parsed.json) {
    return okJsonWithExit(SUB, {
      file: resolve(file), mode: "shadow", judgments: latest.length, minSample: MIN_SAMPLE, points: stats,
      familiesChecked: families !== null ? families.families.length : null, problems,
    }, exitCode);
  }
  const head = `judge report: ${resolve(file)} — ${latest.length} judgment(s), mode shadow (records only, never enforced)`;
  const lines = [head, ...stats.map(statLine)];
  if (families !== null && problems.length === 0) lines.push(`  families: ${families.families.length} valid`);
  for (const p of problems) for (const f of p.findings) lines.push(`  ✗ ${p.where} · ${f.field}: ${f.message}`);
  return { exitCode, stdout: `${lines.join("\n")}\n` };
}
