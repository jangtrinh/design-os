/**
 * DS Guidelines Pack — owner-rulings reader + tier classifier (pure, no fs).
 *
 * Reader contract: `{ rulings: [{ id, category, text, scope, source[], since, verified_by }] }`
 * where `scope` is "global" or `{ apps: string[], features?: string[] }`. Supersession is
 * recorded only as a text prefix `(SUPERSEDED …)` (see `parseSupersededMarker`), so the reader parses it.
 *
 * Tiers: superseded → never emitted; process categories → C (excluded, counted); app-scoped → B
 * (one file per app); global rulings in the design categories → A; any other global ruling → AOther
 * (kept, under its own heading — never dropped).
 */
import { GuidelinesInputError } from "./ds-guidelines-model.js";

export type RulingScope = "global" | { apps: string[] };

export interface Ruling {
  id: string;
  category: string;
  text: string;
  scope: RulingScope;
  source: string[];
  since?: string;
}

export type Tier = "A" | "AOther" | "B" | "C" | "superseded";

/** Process rulings steer how the team works, not how the library is used (excluded, counted). */
const PROCESS_CATEGORIES: ReadonlySet<string> = new Set(["figma-scripting", "workflow-process", "delivery-gates"]);
/** The categories that make a global ruling library guidance proper (tier A). */
const DESIGN_CATEGORIES: ReadonlySet<string> = new Set([
  "shell-chrome", "component-reuse", "screen-composition", "tables", "forms-inputs",
  "status-vocabulary", "naming-language", "section-layout",
]);
const SUPERSEDED_OPEN = /^\s*\(SUPERSEDED(?![\p{L}\p{N}])/iu;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Parse a rulings file; every shape violation is BAD_RULINGS naming the path and the entry. */
export function parseRulings(raw: string, path: string): Ruling[] {
  const bad = (why: string): GuidelinesInputError => new GuidelinesInputError("BAD_RULINGS", `rulings file '${path}': ${why}`);
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw bad("not valid JSON"); }
  const list = (json as { rulings?: unknown } | null)?.rulings;
  if (json === null || typeof json !== "object" || Array.isArray(json) || !Array.isArray(list)) {
    throw bad("expected an object with a 'rulings' array");
  }
  return list.map((entry: unknown, i): Ruling => {
    const r = entry as Record<string, unknown> | null;
    if (r === null || typeof r !== "object" || Array.isArray(r)) throw bad(`rulings[${i}] is not an object`);
    for (const key of ["id", "category", "text"] as const) {
      if (typeof r[key] !== "string" || r[key] === "") throw bad(`rulings[${i}].${key} must be a non-empty string`);
    }
    const scope = r["scope"];
    let parsedScope: RulingScope;
    if (scope === "global") parsedScope = "global";
    else if (scope !== null && typeof scope === "object" && isStringArray((scope as { apps?: unknown }).apps)) {
      parsedScope = { apps: (scope as { apps: string[] }).apps };
    } else throw bad(`rulings[${i}].scope must be "global" or { apps: string[] }`);
    const source = r["source"] ?? [];
    if (!isStringArray(source)) throw bad(`rulings[${i}].source must be an array of strings`);
    const since = r["since"];
    if (since !== undefined && since !== null && typeof since !== "string") throw bad(`rulings[${i}].since must be a string or null`);
    return {
      id: r["id"] as string, category: r["category"] as string, text: r["text"] as string,
      scope: parsedScope, source, ...(typeof since === "string" ? { since } : {}),
    };
  });
}

/**
 * The `(SUPERSEDED …)` marker a ruling text STARTS with (after optional whitespace, any case), up to its
 * matching `)`; `by` is the replacing ruling id when the marker names one (`… by <id> …`). The owner's
 * own generator treats every such prefix as "kept for history, do not follow", whatever follows
 * SUPERSEDED (`<date> by <id>`, `<date> — do not follow`, `in part by <id> — <note>`). The word elsewhere
 * in a text is a mention, not a marker; an unclosed marker is not one either.
 */
export function parseSupersededMarker(text: string): { by?: string } | undefined {
  const open = SUPERSEDED_OPEN.exec(text);
  if (open === null) return undefined;
  let depth = 1;
  for (let i = open[0].length; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) {
      const by = /\bby\s+([^\s—–,;()]+)/i.exec(text.slice(open[0].length, i))?.[1];
      return by === undefined ? {} : { by };
    }
  }
  return undefined;
}

export function classifyRuling(r: Ruling): Tier {
  if (parseSupersededMarker(r.text) !== undefined) return "superseded";
  if (PROCESS_CATEGORIES.has(r.category)) return "C";
  if (r.scope !== "global" && r.scope.apps.length > 0) return "B";
  return DESIGN_CATEGORIES.has(r.category) ? "A" : "AOther";
}

export function supersededRulingIds(rulings: readonly Ruling[]): Set<string> {
  return new Set(rulings.filter((r) => classifyRuling(r) === "superseded").map((r) => r.id));
}
