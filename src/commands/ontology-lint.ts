/**
 * `ui ontology lint [--dir <project>] [--strict] [--json]` (FR-024). Errors: a link to a node that does not exist, a
 * duplicate node id, a stale file (a fresh emit differs from the file on disk), a conventions pair that differs.
 * Orphans are warnings, errors under `--strict`. The coverage table is always printed. Never writes, never raises a
 * question: when an open question blocks a fresh emit, that is reported as an error that names `ui onboard questions`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { resolveDetections } from "../core/owner-rulings/resolve-detections.js";
import { coverageTable } from "../core/ontology/coverage.js";
import { CONVENTIONS_JSON_REL, CONVENTIONS_MD_REL } from "../core/ontology/conventions-machine-form.js";
import { lintOntology } from "../core/ontology/lint-ontology.js";
import { ONTOLOGY_REL } from "../core/ontology/ontology-types.js";
import { lintText } from "./ontology-render.js";
import { isResult, prepare } from "./ontology-shared.js";

const CMD = "ontology lint";
const KNOWN = ["dir", "strict"] as const;

const readIfPresent = (dir: string, rel: string): string | null => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : null);

export function runOntologyLint(parsed: ParsedArgs): CommandResult {
  const ready = prepare(parsed, CMD, KNOWN);
  if (isResult(ready)) return ready;
  const { dir, built, rulings } = ready;
  const open = resolveDetections(built.detections, rulings, CMD).open;
  const openCount = open.reduce((n, c) => n + c.count, 0);
  const result = lintOntology({
    fresh: open.length === 0 ? built.ontology : null,
    ...(open.length === 0 ? {} : { blockedReason: `${openCount} term candidate(s) await an owner ruling` }),
    disk: readIfPresent(dir, ONTOLOGY_REL),
    conventions: { json: readIfPresent(dir, CONVENTIONS_JSON_REL), md: readIfPresent(dir, CONVENTIONS_MD_REL) },
    strict: parsed.flags["strict"] === true,
  });
  const errors = result.findings.filter((f) => f.severity === "error").length;
  const exitCode = errors > 0 ? 1 : 0;
  if (parsed.json) {
    return okJsonWithExit(CMD, { errors, warnings: result.findings.length - errors, findings: result.findings, coverage: result.ontology === null ? [] : coverageTable(result.ontology) }, exitCode);
  }
  return { exitCode, stdout: lintText(result.findings, result.ontology) };
}
