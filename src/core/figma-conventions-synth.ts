/**
 * Convention synthesis — the pure orchestrator (zero-network, zero-LLM).
 *
 * C7 companion to figma-ds-ingest (C0): C0 extracts the DS *vocabulary*
 * (tokens/components); this module learns the applied *grammar* — how real
 * screens actually USE the system — from a `figma-agent scan-conventions`
 * usage-dna.json, and compiles it into a `CONVENTIONS.md` of measured DO/DON'T
 * plus optional "prefers / avoids" memory insights.
 *
 * When a DTCG tokens.json is supplied (--ds), the measured values are
 * cross-referenced against the DS scale/grid so REAL deviations (off-grid
 * spacing, off-scale radius, stray fonts, raw/unbound fills) are separated from
 * valid on-scale values. Deterministic: identical usage-dna + tokens → identical
 * CONVENTIONS.md bytes. The command wrapper owns all filesystem I/O + memory
 * seeding; this module is a value → value transform.
 */
import { buildConventionsDoc, deriveInsights } from "./figma-conventions-emit.js";
import type { Totals } from "./figma-conventions-emit.js";

/** Typed failure for a malformed usage-dna.json or --ds tokens.json (shape, not syntax). */
export class ConvSynthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ConvSynthError";
    this.code = code;
  }
}

/** One section's aggregated convention DNA — the scan-conventions element shape. */
export interface SectionDNA {
  section?: string;
  missing?: boolean;
  id?: string;
  screens?: number;
  nodesWalked?: number;
  truncated?: boolean;
  fills?: { bound?: number; raw?: number; tokenizedPct?: number };
  layout?: { autolayoutFrames?: number; rawFrames?: number };
  topComponents?: Record<string, number>;
  radiusHist?: Record<string, number>;
  spacingHist?: Record<string, number>;
  fonts?: Record<string, number>;
  sampleScreens?: Array<{ name?: string; layout?: string; gap?: number | null }>;
}

/** The DS scale a usage value is validated against (from a DTCG tokens.json). */
export interface DsScale {
  spacing: Set<number>;
  radius: Set<number>;
  fonts: Set<string>; // lowercased families
  present: boolean;
}

export interface SynthResult {
  conventionsMd: string;
  insights: string[];
  stats: {
    sections: number;
    walkedSections: number;
    screens: number;
    autoPct: number;
    tokenizedPct: number;
    deviations: number;
    truncated: string[];
    missing: string[];
  };
}

// ─── Parse + validate usage-dna.json ──────────────────────────────────────────

/** Validate the parsed usage-dna.json into a typed SectionDNA[], or throw BAD_DNA. */
export function parseDnaFile(json: unknown): SectionDNA[] {
  if (!Array.isArray(json)) {
    throw new ConvSynthError("BAD_DNA", "usage-dna.json must be a JSON array of per-section DNA objects (is this a scan-conventions output?)");
  }
  for (const el of json) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) {
      throw new ConvSynthError("BAD_DNA", "each usage-dna entry must be an object");
    }
    const o = el as Record<string, unknown>;
    if (o["missing"] !== true && typeof o["section"] !== "string") {
      throw new ConvSynthError("BAD_DNA", "each walked usage-dna entry needs a 'section' name (or missing:true)");
    }
  }
  return json as SectionDNA[];
}

// ─── Parse the optional DS scale from a DTCG tokens.json ──────────────────────

const RADIUS_CATS = ["radius", "radii", "corner", "rounded"];
const SPACING_CATS = ["space", "spacing", "gap", "pad", "margin", "inset"];

function pxNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /^(-?\d+(?:\.\d+)?)px$/.exec(v.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

/** Build a DsScale from a DTCG token tree (Record<cat, Record<tok, leaf>>), or throw BAD_DS. */
export function parseDsScale(json: unknown): DsScale {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new ConvSynthError("BAD_DS", "--ds must be a DTCG tokens.json object (category → token → leaf)");
  }
  const scale: DsScale = { spacing: new Set(), radius: new Set(), fonts: new Set(), present: false };
  const tree = json as Record<string, unknown>;
  for (const cat of Object.keys(tree)) {
    if (cat.startsWith("$")) continue; // DTCG group metadata
    const group = tree[cat];
    if (group === null || typeof group !== "object") continue;
    const catL = cat.toLowerCase();
    const isRadius = RADIUS_CATS.some((h) => catL.includes(h));
    const isSpacing = SPACING_CATS.some((h) => catL.includes(h));
    for (const tok of Object.keys(group as Record<string, unknown>)) {
      const leaf = (group as Record<string, unknown>)[tok];
      if (leaf === null || typeof leaf !== "object") continue;
      scale.present = true;
      const l = leaf as Record<string, unknown>;
      const type = l["$type"];
      if (type === "fontFamily" && typeof l["$value"] === "string") {
        scale.fonts.add(l["$value"].toLowerCase());
      } else if (type === "dimension") {
        const n = pxNumber(l["$value"]);
        if (n === null) continue; // an alias ("{...}") — its literal target is captured elsewhere
        if (isRadius) scale.radius.add(n);
        else if (isSpacing) scale.spacing.add(n);
      }
    }
  }
  return scale;
}

// ─── Aggregate across sections ────────────────────────────────────────────────

function addHist(target: Map<number, number>, hist: Record<string, number> | undefined): void {
  if (hist === undefined) return;
  for (const [k, c] of Object.entries(hist)) {
    const n = Number(k);
    if (!Number.isFinite(n)) continue;
    target.set(n, (target.get(n) ?? 0) + c);
  }
}

function addStrHist(target: Map<string, number>, hist: Record<string, number> | undefined): void {
  if (hist === undefined) return;
  for (const [k, c] of Object.entries(hist)) target.set(k, (target.get(k) ?? 0) + c);
}

function pct(part: number, whole: number): number {
  return Math.round((100 * part) / (whole || 1));
}

/** Roll every section's DNA up into one Totals bundle (deterministic, order-preserving). */
export function aggregate(dna: SectionDNA[]): Totals {
  const t: Totals = {
    sections: dna.length,
    walkedSections: 0,
    screens: 0,
    nodesWalked: 0,
    autoFrames: 0,
    rawFrames: 0,
    boundFills: 0,
    rawFills: 0,
    spacing: new Map(),
    radius: new Map(),
    fonts: new Map(),
    components: new Map(),
    truncated: [],
    missing: [],
    perSection: [],
  };
  for (const s of dna) {
    if (s.missing === true) {
      t.missing.push(s.id ?? "?");
      continue;
    }
    t.walkedSections += 1;
    const auto = s.layout?.autolayoutFrames ?? 0;
    const raw = s.layout?.rawFrames ?? 0;
    const bound = s.fills?.bound ?? 0;
    const rawFill = s.fills?.raw ?? 0;
    t.screens += s.screens ?? 0;
    t.nodesWalked += s.nodesWalked ?? 0;
    t.autoFrames += auto;
    t.rawFrames += raw;
    t.boundFills += bound;
    t.rawFills += rawFill;
    addHist(t.spacing, s.spacingHist);
    addHist(t.radius, s.radiusHist);
    addStrHist(t.fonts, s.fonts);
    addStrHist(t.components, s.topComponents);
    if (s.truncated === true) t.truncated.push(s.section ?? "?");
    t.perSection.push({
      name: s.section ?? "?",
      screens: s.screens ?? 0,
      nodesWalked: s.nodesWalked ?? 0,
      truncated: s.truncated === true,
      tokenizedPct: s.fills?.tokenizedPct ?? pct(bound, bound + rawFill),
      autoPct: pct(auto, auto + raw),
    });
  }
  return t;
}

// ─── Orchestrate ──────────────────────────────────────────────────────────────

/** Transform a validated usage-dna (+ optional DS scale) into CONVENTIONS.md + insights. */
export function synthesizeConventions(dna: SectionDNA[], ds: DsScale | undefined, source: string): SynthResult {
  const totals = aggregate(dna);
  const { md, deviations } = buildConventionsDoc(totals, ds, source);
  const insights = deriveInsights(totals, ds, deviations);
  return {
    conventionsMd: md,
    insights,
    stats: {
      sections: totals.sections,
      walkedSections: totals.walkedSections,
      screens: totals.screens,
      autoPct: pct(totals.autoFrames, totals.autoFrames + totals.rawFrames),
      tokenizedPct: pct(totals.boundFills, totals.boundFills + totals.rawFills),
      deviations,
      truncated: totals.truncated,
      missing: totals.missing,
    },
  };
}
