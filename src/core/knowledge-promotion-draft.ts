/**
 * Turn an approver correction into a draft ruling stub. Pure: the caller supplies
 * today's date, so the same correction always yields the same stub (id included).
 */
import { createHash } from "node:crypto";

import { isNonEmptyString, isRecord } from "./knowledge-promotion-ruling.js";
import type { RulingRecord } from "./knowledge-promotion-ruling.js";
import { validateRulingsFile } from "./rulings-validate.js";

export const DRAFT_CATEGORY = "correction";
export const DRAFT_VERIFIED_BY = "unverified";

export type DraftResult = { ok: true; doc: { schema: "rulings/1"; rulings: RulingRecord[] } } | { ok: false; problems: string[] };

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");

export function draftRulingFromCorrection(correction: unknown, today: string): DraftResult {
  if (!isRecord(correction)) return { ok: false, problems: ["correction must be a JSON object"] };
  const problems: string[] = [];
  for (const key of ["screen", "what_was_wrong", "what_is_right"]) {
    if (!isNonEmptyString(correction[key])) problems.push(`'${key}' must be a non-empty string`);
  }
  const evidence = correction["evidence"];
  if (!(Array.isArray(evidence) && evidence.length > 0 && evidence.every(isNonEmptyString))) problems.push("'evidence' must be a non-empty array of non-empty strings");
  if (problems.length > 0) return { ok: false, problems };

  const screen = String(correction["screen"]);
  const wrong = String(correction["what_was_wrong"]);
  const right = String(correction["what_is_right"]);
  const digest = createHash("sha1").update(`${screen}\n${wrong}\n${right}`).digest("hex").slice(0, 8);
  const ruling: RulingRecord = {
    id: `r-draft-${slug(screen) || "screen"}-${digest}`,
    category: DRAFT_CATEGORY,
    text: right,
    detail: `Correction — what was wrong: ${wrong}`,
    scope: { screens: [screen] },
    source: evidence as string[],
    since: today,
    verified_by: DRAFT_VERIFIED_BY,
    status: "draft",
    approved_by: [],
  };
  const doc = { schema: "rulings/1" as const, rulings: [ruling] };
  const findings = validateRulingsFile(doc).filter((f) => f.severity === "error");
  if (findings.length > 0) return { ok: false, problems: findings.map((f) => f.message) };
  return { ok: true, doc };
}
