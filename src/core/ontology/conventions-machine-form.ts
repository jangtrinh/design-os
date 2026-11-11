/**
 * Measured conventions in machine form: `design/conventions.json` (`design-os-conventions/1`) is the structure
 * `CONVENTIONS.md` is rendered from. The Markdown is a pure render of the JSON and of nothing else, so the lint can
 * compare a render of the JSON with the Markdown on disk using those two files alone. The JSON also carries the rules
 * an agent reads as `rule` nodes, each with the counts it was measured on ("radius 8 on 412 of 430 uses").
 * No time and no absolute path: the same measurement gives the same bytes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildConventionsDoc } from "../figma-conventions-emit.js";
import type { Totals } from "../figma-conventions-emit.js";
import type { DsScale } from "../figma-conventions-synth.js";
import { byText } from "./ontology-types.js";

export const CONVENTIONS_SCHEMA = "design-os-conventions/1";
export const CONVENTIONS_JSON_REL = "design/conventions.json";
export const CONVENTIONS_MD_REL = "CONVENTIONS.md";

export interface MeasuredRule {
  /** Stable: names the category and the measure, never the value. */
  id: string;
  category: "layout" | "color" | "spacing" | "radius" | "typography" | "components";
  statement: string;
  /** `on` of `of` uses carry the stated practice; `value` is the dominant value where the rule names one. */
  measured: { on: number; of: number; value?: string | number };
}

export interface ConventionsDoc {
  schema: typeof CONVENTIONS_SCHEMA;
  source: string;
  designSystem: { spacing: number[]; radius: number[]; fonts: string[] } | null;
  totals: {
    sections: number; walkedSections: number; screens: number; nodesWalked: number;
    autoFrames: number; rawFrames: number; boundFills: number; rawFills: number;
    spacing: [number, number][]; radius: [number, number][]; fonts: [string, number][]; components: [string, number][];
    truncated: string[]; missing: string[];
    perSection: Totals["perSection"];
  };
  deviations: number;
  rules: MeasuredRule[];
}

const sum = (m: Map<unknown, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
const numRows = (m: Map<number, number>): [number, number][] => [...m].sort((a, b) => a[0] - b[0]);
const strRows = (m: Map<string, number>): [string, number][] => [...m].sort((a, b) => byText(a[0], b[0]));

/** The most-used entry of a histogram: highest count, the lowest value on a tie. */
function dominant<K extends number | string>(rows: readonly [K, number][]): [K, number] | undefined {
  return [...rows].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
}

function measuredRules(t: Totals): MeasuredRule[] {
  const out: MeasuredRule[] = [];
  const frames = t.autoFrames + t.rawFrames;
  if (frames > 0) out.push({ id: "layout.auto-layout", category: "layout", statement: "Build frames with auto-layout", measured: { on: t.autoFrames, of: frames } });
  const fills = t.boundFills + t.rawFills;
  if (fills > 0) out.push({ id: "color.token-bound-fills", category: "color", statement: "Bind solid fills to a colour token", measured: { on: t.boundFills, of: fills } });
  const histograms = [
    ["spacing.dominant", "spacing", "Use the dominant spacing step", numRows(t.spacing), sum(t.spacing), "px"],
    ["radius.dominant", "radius", "Use the dominant corner radius", numRows(t.radius), sum(t.radius), "px"],
  ] as const;
  for (const [id, category, statement, rows, total, unit] of histograms) {
    const top = dominant(rows);
    if (top !== undefined) out.push({ id, category, statement: `${statement} (${top[0]}${unit})`, measured: { on: top[1], of: total, value: top[0] } });
  }
  const font = dominant(strRows(t.fonts));
  if (font !== undefined) out.push({ id: "typography.dominant", category: "typography", statement: `Set text in ${font[0]}`, measured: { on: font[1], of: sum(t.fonts), value: font[0] } });
  const component = dominant(strRows(t.components));
  if (component !== undefined) out.push({ id: "components.most-used", category: "components", statement: `Build with ${component[0]}`, measured: { on: component[1], of: sum(t.components), value: component[0] } });
  return out;
}

/** The machine form of one synthesis: the totals the Markdown is rendered from, plus the measured rules. */
export function conventionsDocOf(t: Totals, ds: DsScale | undefined, source: string): ConventionsDoc {
  return {
    schema: CONVENTIONS_SCHEMA, source,
    designSystem: ds === undefined ? null : { spacing: [...ds.spacing].sort((a, b) => a - b), radius: [...ds.radius].sort((a, b) => a - b), fonts: [...ds.fonts].sort(byText) },
    totals: {
      sections: t.sections, walkedSections: t.walkedSections, screens: t.screens, nodesWalked: t.nodesWalked,
      autoFrames: t.autoFrames, rawFrames: t.rawFrames, boundFills: t.boundFills, rawFills: t.rawFills,
      spacing: numRows(t.spacing), radius: numRows(t.radius), fonts: strRows(t.fonts), components: strRows(t.components),
      truncated: [...t.truncated], missing: [...t.missing], perSection: t.perSection.map((s) => ({ ...s })),
    },
    deviations: buildConventionsDoc(t, ds, source).deviations,
    rules: measuredRules(t),
  };
}

const totalsOf = (t: ConventionsDoc["totals"]): Totals => ({ ...t, spacing: new Map(t.spacing), radius: new Map(t.radius), fonts: new Map(t.fonts), components: new Map(t.components) });

/** The rules a document's totals give: the only source of the `rule` nodes. The stored `rules` list is never read as a fact. */
export const derivedRules = (doc: ConventionsDoc): MeasuredRule[] => measuredRules(totalsOf(doc.totals));

/** The Markdown of a conventions document: the only function that produces `CONVENTIONS.md`. */
export function renderConventionsMarkdown(doc: ConventionsDoc): string {
  const totals = totalsOf(doc.totals);
  const ds: DsScale | undefined = doc.designSystem === null ? undefined : { spacing: new Set(doc.designSystem.spacing), radius: new Set(doc.designSystem.radius), fonts: new Set(doc.designSystem.fonts), present: true };
  return buildConventionsDoc(totals, ds, doc.source).md;
}

export const serializeConventions = (doc: ConventionsDoc): string => `${JSON.stringify(doc, null, 2)}\n`;

/** Writes the pair together, the Markdown rendered from the JSON and from nothing else: the two cannot describe different measurements. */
export function writeConventionsPair(outDir: string, doc: ConventionsDoc): void {
  mkdirSync(join(outDir, "design"), { recursive: true });
  writeFileSync(join(outDir, CONVENTIONS_MD_REL), renderConventionsMarkdown(doc), "utf8");
  writeFileSync(join(outDir, CONVENTIONS_JSON_REL), serializeConventions(doc), "utf8");
}

/** A parsed `design/conventions.json`, or the first thing wrong with it. */
export function parseConventionsDoc(raw: unknown): ConventionsDoc | string {
  const o = raw as Partial<ConventionsDoc> | null;
  if (o === null || typeof o !== "object" || o.schema !== CONVENTIONS_SCHEMA) return `schema must be ${CONVENTIONS_SCHEMA}`;
  if (typeof o.source !== "string" || o.totals === undefined || !Array.isArray(o.rules) || typeof o.deviations !== "number") return "missing source, totals, deviations or rules";
  const t = o.totals as ConventionsDoc["totals"];
  for (const key of ["spacing", "radius", "fonts", "components", "truncated", "missing", "perSection"] as const) if (!Array.isArray(t[key])) return `totals.${key} must be a list`;
  for (const key of ["sections", "walkedSections", "screens", "nodesWalked", "autoFrames", "rawFrames", "boundFills", "rawFills"] as const) if (typeof t[key] !== "number") return `totals.${key} must be a number`;
  const rows = (list: unknown, key: "number" | "string"): boolean => (list as unknown[]).every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === key && typeof r[1] === "number");
  for (const key of ["spacing", "radius"] as const) if (!rows(t[key], "number")) return `totals.${key} must be rows of [number, count]`;
  for (const key of ["fonts", "components"] as const) if (!rows(t[key], "string")) return `totals.${key} must be rows of [name, count]`;
  for (const r of o.rules) if (typeof r?.id !== "string" || typeof r.statement !== "string" || typeof r.measured?.on !== "number" || typeof r.measured.of !== "number") return "a rule needs id, statement and measured on/of";
  return o as ConventionsDoc;
}
