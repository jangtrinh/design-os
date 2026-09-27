/**
 * Deterministic markdown renderer for a rulings file. Grouped by category, then id
 * (both sorted with plain code-unit order, so output does not depend on locale).
 * Assumes a document that already passed `lintRulings` without errors.
 */
import { RULINGS_LABELS } from "./rulings-labels.js";
import type { RulingsLabels, RulingsLang } from "./rulings-labels.js";

type Ruling = Record<string, unknown>;

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const code = (s: string): string => `\`${s}\``;

function scopeText(scope: unknown, L: RulingsLabels): string {
  if (typeof scope !== "object" || scope === null) return L.global;
  const s = scope as Record<string, unknown>;
  const bits = ([["apps", L.apps], ["features", L.features], ["screens", L.screens]] as const)
    .filter(([key]) => strings(s[key]).length > 0)
    .map(([key, label]) => `${label}=${strings(s[key]).join(",")}`);
  return bits.length > 0 ? bits.join(" · ") : L.global;
}

function renderRuling(r: Ruling, L: RulingsLabels): string {
  const id = String(r["id"]);
  const meta: string[] = [`${L.scope}: ${scopeText(r["scope"], L)}`, `${L.since}: ${orUnknown(r["since"])}`, `${L.verifiedBy}: ${orUnknown(r["verified_by"])}`];
  if (typeof r["verified_at"] === "string") meta.push(`${L.verifiedAt}: ${r["verified_at"]}`);
  if (typeof r["status"] === "string") meta.push(`${L.status}: ${r["status"]}`);
  const lines = [`- **${code(id)}** — ${String(r["text"])}`, `  ${meta.join(" · ")}`];
  const src = strings(r["source"]);
  if (src.length > 0) lines.push(`  ${L.source}: ${src.map(code).join(", ")}`);
  const links: [string, string[]][] = [
    [L.principle, strings(r["principle"])],
    [L.supersedes, strings(r["supersedes"])],
    [L.supersededBy, typeof r["superseded_by"] === "string" ? [r["superseded_by"]] : []],
    [L.conflictsWith, strings(r["conflicts_with"])],
  ];
  for (const [label, values] of links) if (values.length > 0) lines.push(`  ${label}: ${values.map(code).join(", ")}`);
  const approvals = Array.isArray(r["approved_by"]) ? r["approved_by"] : [];
  if (approvals.length > 0) {
    lines.push(`  ${L.approvedBy}: ${approvals.map((a) => {
      const x = a as Record<string, unknown>;
      return `${String(x["role"])} ${String(x["person"])} (${String(x["at"])})`;
    }).join("; ")}`);
  }
  return lines.join("\n");
}

/**
 * Why a document cannot be rendered at all. Field-level schema errors (a null
 * `since`, say) do not block rendering — `ui knowledge lint` is the gate for those,
 * and the renderer shows the gap as "unknown" rather than hiding the ruling.
 */
export function renderBlocker(doc: unknown): string | null {
  const rulings = (doc as { rulings?: unknown } | null)?.rulings;
  if (!Array.isArray(rulings)) return "'rulings' must be an array";
  for (const [i, r] of rulings.entries()) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    for (const f of ["id", "category", "text"]) {
      if (typeof o[f] !== "string" || o[f] === "") return `rulings[${i}] has no string '${f}'`;
    }
  }
  return null;
}

const orUnknown = (v: unknown): string => (typeof v === "string" && v !== "" ? v : "unknown");

export function renderRulings(doc: { rulings: Ruling[] }, lang: RulingsLang): string {
  const L = RULINGS_LABELS[lang];
  const groups = new Map<string, Ruling[]>();
  for (const r of doc.rulings) {
    const cat = String(r["category"]);
    const list = groups.get(cat) ?? [];
    list.push(r);
    groups.set(cat, list);
  }
  const categories = [...groups.keys()].sort(byText);
  const parts = [`# ${L.title}`, "", `> ${L.generated}`, `> ${L.counts(doc.rulings.length, categories.length)}`, ""];
  for (const cat of categories) {
    const list = (groups.get(cat) ?? []).slice().sort((a, b) => byText(String(a["id"]), String(b["id"])));
    parts.push(`## ${cat} (${list.length})`, "");
    for (const r of list) parts.push(renderRuling(r, L), "");
  }
  return `${parts.join("\n").trimEnd()}\n`;
}
