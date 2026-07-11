/**
 * Design-system diff + semver classifier (Track: DESIGN-OS T1).
 *
 * Two materialised DS states in → a classified change report out. Pure: no fs, no
 * git, no network. The host materialises `base`/`head` (e.g. `git show REF:…`) and
 * hands them in, exactly like `memory-events.ts` stays pure while the impl does I/O.
 *
 * The moat is that "visual breaking change" (EightShapes) becomes COMPUTABLE, not a
 * gut call: a colour change is breaking when its perceptual distance ΔEOK exceeds a
 * threshold, a dimension change when its magnitude exceeds a percentage. Below those,
 * it's a patch. API changes (a removed token, a dropped variant/state) are breaking
 * by structure. DS bump = the max severity across every change.
 */
import { hexToOKLCH } from "./color-convert.js";
import type { ResolvedToken, ResolvedMap, TokenType } from "./token-model.js";

export type Severity = "breaking" | "additive" | "patch" | "none";
export type Bump = "major" | "minor" | "patch" | "none";

/** OKLab JND ≈ 0.02; below this a colour nudge is imperceptible → patch. */
export const DEFAULT_COLOR_TOLERANCE = 0.02;
/** A dimension change under 5% shifts no layout → patch. */
export const DEFAULT_DIMENSION_TOLERANCE_PCT = 5;

export interface DiffComponent {
  name: string;
  category: string;
  tokensUsed: string[];
  variants?: string[];
  states?: string[];
  markup?: string;
}

export interface DsState {
  tokens: ResolvedMap;
  components: DiffComponent[];
}

export interface TokenChange {
  path: string;
  type: TokenType;
  from: string;
  to: string;
  severity: Severity;
  reason: string;
  deltaE?: number;
}

export interface ComponentChange {
  name: string;
  severity: Severity;
  variants: { added: string[]; removed: string[] };
  states: { added: string[]; removed: string[] };
  tokensUsed: { added: string[]; removed: string[] };
  markupChanged: boolean;
  reasons: string[];
}

export interface DsDiff {
  classification: Severity;
  recommendedBump: Bump;
  recommendedVersion?: string;
  tokens: {
    added: { path: string; type: TokenType; value: string }[];
    removed: { path: string; type: TokenType; value: string }[];
    changed: TokenChange[];
  };
  components: {
    added: string[];
    removed: string[];
    changed: ComponentChange[];
  };
  /** A component still references a token that head removed — forces major. */
  dangling: { component: string; token: string }[];
}

// ─── value helpers ──────────────────────────────────────────────────────────────

function valueStr(t: ResolvedToken): string {
  const v = t.value;
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Perceptual distance in OKLab (ΔEOK ≈ euclidean). null when either side isn't hex. */
export function colorDeltaE(a: string, b: string): number | null {
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return null;
  const toLab = (hex: string): [number, number, number] => {
    const { l, c, h } = hexToOKLCH(hex);
    const rad = (h * Math.PI) / 180;
    return [l, c * Math.cos(rad), c * Math.sin(rad)];
  };
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

const DIM_RE = /^(-?\d*\.?\d+)(px|rem|em|%)$/;

/** Percent magnitude of a dimension change, or null when either side is unparseable. */
export function dimensionDeltaPct(a: string, b: string): number | null {
  const ma = DIM_RE.exec(a.trim());
  const mb = DIM_RE.exec(b.trim());
  if (ma === null || mb === null || ma[2] !== mb[2]) return null; // unit change handled as breaking upstream
  const na = Number.parseFloat(ma[1] as string);
  const nb = Number.parseFloat(mb[1] as string);
  if (na === 0) return nb === 0 ? 0 : Infinity;
  return Math.abs((nb - na) / na) * 100;
}

// ─── token classification ─────────────────────────────────────────────────────────

function classifyTokenChange(
  from: ResolvedToken,
  to: ResolvedToken,
  colorTol: number,
  dimTolPct: number,
): TokenChange | null {
  const f = valueStr(from);
  const t = valueStr(to);
  if (from.type === to.type && f === t) return null; // unchanged

  const base = { path: to.path, type: to.type, from: f, to: t };
  if (from.type !== to.type) {
    return { ...base, severity: "breaking", reason: `$type changed ${from.type} → ${to.type}` };
  }
  if (to.type === "color") {
    const dE = colorDeltaE(f, t);
    if (dE === null) return { ...base, severity: "breaking", reason: "colour value changed (non-hex — cannot measure)" };
    return dE <= colorTol
      ? { ...base, severity: "patch", reason: `sub-perceptual colour nudge (ΔE ${dE.toFixed(3)})`, deltaE: dE }
      : { ...base, severity: "breaking", reason: `perceptible colour change (ΔE ${dE.toFixed(3)} > ${colorTol})`, deltaE: dE };
  }
  if (to.type === "dimension") {
    const pct = dimensionDeltaPct(f, t);
    if (pct === null) return { ...base, severity: "breaking", reason: "dimension unit changed" };
    return pct <= dimTolPct
      ? { ...base, severity: "patch", reason: `sub-threshold dimension change (${pct.toFixed(1)}%)` }
      : { ...base, severity: "breaking", reason: `layout-affecting dimension change (${pct.toFixed(1)}% > ${dimTolPct}%)` };
  }
  // fontWeight / fontFamily / duration / number / composite: any value change is a contract change.
  return { ...base, severity: "breaking", reason: `${to.type} value changed` };
}

const RANK: Record<Severity, number> = { breaking: 3, additive: 2, patch: 1, none: 0 };
function maxSeverity(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}
function bumpFor(s: Severity): Bump {
  return s === "breaking" ? "major" : s === "additive" ? "minor" : s === "patch" ? "patch" : "none";
}

function setDiff(a: readonly string[] = [], b: readonly string[] = []): { added: string[]; removed: string[] } {
  const A = new Set(a), B = new Set(b);
  return { added: [...B].filter((x) => !A.has(x)).sort(), removed: [...A].filter((x) => !B.has(x)).sort() };
}

// ─── main ───────────────────────────────────────────────────────────────────────

export function diffDesignSystem(
  base: DsState,
  head: DsState,
  opts: { colorTolerance?: number; dimensionTolerancePct?: number; baseVersion?: string } = {},
): DsDiff {
  const colorTol = opts.colorTolerance ?? DEFAULT_COLOR_TOLERANCE;
  const dimTolPct = opts.dimensionTolerancePct ?? DEFAULT_DIMENSION_TOLERANCE_PCT;

  const baseTok = new Map(base.tokens.map((t) => [t.path, t]));
  const headTok = new Map(head.tokens.map((t) => [t.path, t]));

  const added = [...headTok.keys()].filter((p) => !baseTok.has(p)).sort()
    .map((p) => { const t = headTok.get(p) as ResolvedToken; return { path: p, type: t.type, value: valueStr(t) }; });
  const removed = [...baseTok.keys()].filter((p) => !headTok.has(p)).sort()
    .map((p) => { const t = baseTok.get(p) as ResolvedToken; return { path: p, type: t.type, value: valueStr(t) }; });
  const changed: TokenChange[] = [];
  for (const [path, ht] of [...headTok].sort((a, b) => a[0].localeCompare(b[0]))) {
    const bt = baseTok.get(path);
    if (bt === undefined) continue;
    const c = classifyTokenChange(bt, ht, colorTol, dimTolPct);
    if (c !== null) changed.push(c);
  }

  let sev: Severity = "none";
  if (added.length > 0) sev = maxSeverity(sev, "additive");
  if (removed.length > 0) sev = maxSeverity(sev, "breaking");
  for (const c of changed) sev = maxSeverity(sev, c.severity);

  // components
  const baseComp = new Map(base.components.map((c) => [c.name, c]));
  const headComp = new Map(head.components.map((c) => [c.name, c]));
  const compAdded = [...headComp.keys()].filter((n) => !baseComp.has(n)).sort();
  const compRemoved = [...baseComp.keys()].filter((n) => !headComp.has(n)).sort();
  const compChanged: ComponentChange[] = [];
  if (compAdded.length > 0) sev = maxSeverity(sev, "additive");
  if (compRemoved.length > 0) sev = maxSeverity(sev, "breaking");

  for (const [name, hc] of [...headComp].sort((a, b) => a[0].localeCompare(b[0]))) {
    const bc = baseComp.get(name);
    if (bc === undefined) continue;
    const variants = setDiff(bc.variants, hc.variants);
    const states = setDiff(bc.states, hc.states);
    const tokensUsed = setDiff(bc.tokensUsed, hc.tokensUsed);
    const markupChanged = bc.markup !== undefined && hc.markup !== undefined && bc.markup !== hc.markup;
    const reasons: string[] = [];
    let cs: Severity = "none";
    if (variants.removed.length > 0) { reasons.push(`variant(s) removed: ${variants.removed.join(", ")}`); cs = maxSeverity(cs, "breaking"); }
    if (states.removed.length > 0) { reasons.push(`state(s) removed: ${states.removed.join(", ")}`); cs = maxSeverity(cs, "breaking"); }
    if (variants.added.length > 0) { reasons.push(`variant(s) added: ${variants.added.join(", ")}`); cs = maxSeverity(cs, "additive"); }
    if (states.added.length > 0) { reasons.push(`state(s) added: ${states.added.join(", ")}`); cs = maxSeverity(cs, "additive"); }
    if (tokensUsed.added.length > 0 || tokensUsed.removed.length > 0) { reasons.push("tokensUsed changed"); cs = maxSeverity(cs, "patch"); }
    if (markupChanged && reasons.length === 0) { reasons.push("markup refactor (contract unchanged)"); cs = maxSeverity(cs, "patch"); }
    if (cs !== "none") {
      compChanged.push({ name, severity: cs, variants, states, tokensUsed, markupChanged, reasons });
      sev = maxSeverity(sev, cs);
    }
  }

  // cross-artifact: a component still referencing a removed token → dangling, force major
  const removedPaths = new Set(removed.map((r) => r.path));
  const dangling: { component: string; token: string }[] = [];
  for (const c of head.components) {
    for (const tok of c.tokensUsed) {
      if (removedPaths.has(tok)) dangling.push({ component: c.name, token: tok });
    }
  }
  if (dangling.length > 0) sev = maxSeverity(sev, "breaking");

  const recommendedBump = bumpFor(sev);
  const diff: DsDiff = {
    classification: sev,
    recommendedBump,
    tokens: { added, removed, changed },
    components: { added: compAdded, removed: compRemoved, changed: compChanged },
    dangling,
  };
  if (opts.baseVersion !== undefined) {
    const v = nextVersion(opts.baseVersion, recommendedBump);
    if (v !== null) diff.recommendedVersion = v;
  }
  return diff;
}

/** semver bump of `x.y.z` (leading `v` tolerated). null when unparseable. */
export function nextVersion(version: string, bump: Bump): string | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (m === null) return null;
  let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (bump === "major") { major += 1; minor = 0; patch = 0; }
  else if (bump === "minor") { minor += 1; patch = 0; }
  else if (bump === "patch") { patch += 1; }
  return `${major}.${minor}.${patch}`;
}
