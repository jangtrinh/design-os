import { basename } from "node:path";
import { validateMethodSchema } from "./method-json-schema.js";
import type { Schema } from "./method-json-schema.js";

export const METHOD_STEPS = ["frame", "define", "explore", "decide", "build", "verify"] as const;
type StepName = typeof METHOD_STEPS[number];
export interface MethodFinding { checkId: string; severity: "error"; message: string; step?: StepName }
export interface MethodLintInput {
  doc: unknown;
  runSchema: Schema;
  briefSchema: Schema;
  readBrief: (path: string) => unknown | null;
}

const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Check shape first, then the cross-file and human-decision rules that JSON Schema cannot express. */
export function lintMethodRun(input: MethodLintInput): MethodFinding[] {
  const findings: MethodFinding[] = validateMethodSchema(input.doc, input.runSchema).map((message) => {
    const step = METHOD_STEPS.find((name) => message.startsWith(`$.steps.${name}`));
    return step === undefined
      ? { checkId: "schema-shape", severity: "error", message }
      : { checkId: "schema-shape", severity: "error", message, step };
  });
  const steps = record(input.doc) && record(input.doc["steps"]) ? input.doc["steps"] : {};
  for (const name of METHOD_STEPS) {
    const step = steps[name];
    if (!record(step)) continue;
    if (step["status"] === "skipped") {
      const reason = step["skip_reason"];
      if (!record(reason) || !nonempty(reason["detail"])) {
        findings.push({ checkId: "skip-reason", severity: "error", step: name, message: `${name}: skipped step needs a reason code and detail` });
      }
    }
    if ((name === "decide" || name === "verify") && step["status"] === "done" && Array.isArray(step["needs_humans"])) {
      step["needs_humans"].forEach((need: unknown, index: number) => {
        if (record(need) && (!nonempty(need["answered_by"]) || !nonempty(need["answered_at"]))) {
          findings.push({ checkId: "unanswered-human", severity: "error", step: name,
            message: `${name}: needs_humans[${index}] requires answered_by and answered_at before done` });
        }
      });
    }
  }
  const define = steps["define"];
  const artifacts = record(define) && Array.isArray(define["artifacts"]) ? define["artifacts"] : [];
  const briefs = artifacts.filter((a): a is Record<string, unknown> => record(a) && typeof a["path"] === "string" && basename(a["path"]) === "brief.json");
  if (briefs.length === 0) {
    findings.push({ checkId: "missing-brief", severity: "error", step: "define", message: "define must reference a brief.json artifact" });
  }
  for (const artifact of briefs) {
    const path = artifact["path"] as string;
    const brief = input.readBrief(path);
    if (brief === null) {
      findings.push({ checkId: "invalid-brief", severity: "error", step: "define", message: `define: cannot read valid JSON from ${path}` });
      continue;
    }
    const errors = validateMethodSchema(brief, input.briefSchema);
    if (errors.length > 0) findings.push({ checkId: "invalid-brief", severity: "error", step: "define",
      message: `define: ${path} fails design-brief schema: ${errors[0]}` });
  }
  return findings;
}

export function methodStatusLine(doc: unknown, findings: MethodFinding[]): string {
  const steps = record(doc) && record(doc["steps"]) ? doc["steps"] : {};
  const globalError = findings.some((f) => f.step === undefined);
  return METHOD_STEPS.map((name) => {
    const step = steps[name];
    const mark = globalError || findings.some((f) => f.step === name) || !record(step) ? "✗" : step["status"] === "skipped" ? "–" : "✓";
    return `${name} ${mark}`;
  }).join(" ");
}
