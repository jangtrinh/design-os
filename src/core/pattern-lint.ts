/**
 * Pattern-card linter core — pure. Shape comes from schemas/pattern-card.schema.json; this file adds the
 * arithmetic a schema cannot express (shares against n, evidence against n, honest flags) and the
 * "no image ever enters a card" guard. Reuses the deterministic Draft-07 subset validator.
 */
import { validateMethodSchema } from "./method-json-schema.js";
import type { Schema } from "./method-json-schema.js";

export const PATTERN_FLOOR = 8;
/** Core distributions where one screen contributes exactly one value, so the counts cannot sum above n. */
const SINGLE_VALUED = ["layout", "navigation", "primary_action", "density", "color_mode", "copy_language"] as const;
const IMAGE_REFERENCE = /\.(png|jpe?g|webp|gif|svg|heic)\b|https?:\/\/|mobbin\.com/i;

export interface PatternFinding { checkId: string; severity: "error"; message: string }
export interface PatternLintInput {
  doc: unknown;
  schema: Schema;
  /** Where the card sits on disk: inside a web/ or ios/ folder the file stem must equal the archetype and the folder the platform. */
  location?: { stem: string; parent: string };
}

type Rec = Record<string, unknown>;
type Entry = { value: string; count: number };
const isRec = (v: unknown): v is Rec => v !== null && typeof v === "object" && !Array.isArray(v);
const entries = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
const sum = (list: Entry[]): number => list.reduce((total, e) => total + e.count, 0);

export function lintPatternCard(input: PatternLintInput): PatternFinding[] {
  const shape = validateMethodSchema(input.doc, input.schema);
  if (shape.length > 0 || !isRec(input.doc)) {
    return (shape.length > 0 ? shape : ["$: card must be a JSON object"]).map((message) => ({ checkId: "schema-shape", severity: "error", message }));
  }
  const out: PatternFinding[] = [];
  const bad = (checkId: string, message: string): void => { out.push({ checkId, severity: "error", message }); };
  const card = input.doc;
  const n = card["n"] as number;
  const evidence = card["evidence"] as string[];

  lintFloor(card, n, bad);
  if (new Set(evidence).size !== evidence.length) bad("evidence-duplicate", "evidence ids must be unique");
  if (evidence.length !== n) bad("evidence-count", `n is ${n} but evidence lists ${evidence.length} ids`);
  if (typeof card["attempted"] === "number" && card["attempted"] < n) bad("attempted-below-n", "attempted cannot be smaller than n");

  const core = card["core"] as Rec;
  for (const [field, raw] of Object.entries(core)) {
    const list = entries(raw);
    lintCounts(list, n, `core.${field}`, "share-over-n", `n (${n})`, bad);
    if ((SINGLE_VALUED as readonly string[]).includes(field) && sum(list) > n) bad("share-over-n", `core.${field}: counts sum to ${sum(list)}, above n (${n})`);
  }
  const seen = new Set<string>();
  for (const comp of card["components"] as Rec[]) {
    const name = comp["name"] as string;
    const count = comp["count"] as number;
    if (name !== "other" && seen.has(name)) bad("component-duplicate", `component '${name}' appears twice`);
    seen.add(name);
    if (count < 0 || count > n) bad("share-over-n", `components.${name}: count ${count} is outside 0..n (${n})`);
    for (const axis of ["kind", "position"] as const) {
      lintCounts(entries(comp[axis]), count, `components.${name}.${axis}`, "share-over-component", `the component count (${count})`, bad);
    }
  }
  lintUnreliable(card, bad);
  lintCrossCheck(card["extraction"] as Rec, bad);
  if (hasImageReference(card)) bad("image-reference", "card contains an image path, image extension or URL; evidence is observed(mobbin:<id>) only");
  // A card that lives in <platform>/<archetype>.json must say so; anywhere else the path carries no claim.
  if (input.location !== undefined && ["web", "ios"].includes(input.location.parent)) {
    if (input.location.parent !== card["platform"]) bad("path-mismatch", `folder '${input.location.parent}' holds platform '${String(card["platform"])}'`);
    if (input.location.stem !== card["archetype"]) bad("path-mismatch", `file '${input.location.stem}.json' holds archetype '${String(card["archetype"])}'`);
  }
  return out;
}

type Bad = (checkId: string, message: string) => void;

function lintFloor(card: Rec, n: number, bad: Bad): void {
  const flagged = card["n_below_floor"] === true;
  if (n < PATTERN_FLOOR && !flagged) bad("n-below-floor", `n is ${n}, below the floor of ${PATTERN_FLOOR}; flag it n_below_floor and mark it a draft`);
  if (n >= PATTERN_FLOOR && flagged) bad("n-below-floor", `n_below_floor is set but n (${n}) meets the floor of ${PATTERN_FLOOR}`);
  if (flagged && card["status"] !== "draft") bad("draft-required", "a card below the floor may only be status draft");
}

function lintCounts(list: Entry[], ceiling: number, path: string, checkId: string, ceilingName: string, bad: Bad): void {
  const values = new Set<string>();
  for (const { value, count } of list) {
    if (count < 0) bad("share-negative", `${path}.${value}: count ${count} is negative`);
    if (count > ceiling) bad(checkId, `${path}.${value}: count ${count} is above ${ceilingName}`);
    if (values.has(value)) bad("distribution-duplicate", `${path}: value '${value}' listed twice`);
    values.add(value);
  }
}

function lintUnreliable(card: Rec, bad: Bad): void {
  const core = card["core"] as Rec;
  const comps = new Map((card["components"] as Rec[]).map((c) => [c["name"] as string, c]));
  for (const path of (card["unreliable"] as string[] | undefined) ?? []) {
    const [head, name, axis] = path.split(".");
    const ok = head === "core" && name !== undefined && axis === undefined && core[name] !== undefined
      || head === "components" && name !== undefined && comps.has(name)
        && (axis === undefined || (axis === "kind" || axis === "position") && comps.get(name)?.[axis] !== undefined);
    if (!ok) bad("unreliable-path", `unreliable '${path}' does not name an attribute this card carries`);
  }
}

function lintCrossCheck(extraction: Rec, bad: Bad): void {
  const check = extraction["cross_check"];
  if (!isRec(check)) return;
  for (const row of check["agreement"] as Array<{ attribute: string; agree: number; of: number }>) {
    if (row.agree < 0 || row.agree > row.of || row.of > (check["images"] as number)) {
      bad("cross-check-range", `cross_check '${row.attribute}': need 0 <= agree <= of <= images`);
    }
  }
}

function hasImageReference(value: unknown): boolean {
  if (typeof value === "string") return IMAGE_REFERENCE.test(value);
  if (Array.isArray(value)) return value.some(hasImageReference);
  return isRec(value) && Object.values(value).some(hasImageReference);
}
