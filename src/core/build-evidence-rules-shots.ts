/**
 * `ui evidence lint` rules r1 (probe partner exists) and r2 (required widths
 * present as a PNG). Also exports the screenshot→probe pairing this shares
 * with r3/r7 (evidence-rules-probe.ts) — one resolver, not two.
 *
 * Real evidence folders vary the probe filename AND the JSON shape (read-first
 * step 5): a per-width sidecar (`full-1440.json`), a generic `probe-1440.json`,
 * a single `probe.json` keyed by `widths["1440"]`, or a single `probes.json`
 * keyed by `"full-1440"`. All four are accepted; nothing here decodes the PNG.
 */
import { readJsonSafe, type WalkedFile } from "./build-evidence-rules-shared.js";
import { fail, pass, skip, type RuleResult } from "./build-evidence-rules-shared.js";

export interface ScreenshotRef {
  rel: string;
  abs: string;
  /** Directory containing the PNG, relative to the evidence root ("" for root). */
  dir: string;
  /** Filename stem before "-<width>.png". */
  stem: string;
  width: number;
}

export interface ProbeMatch {
  screenshot: ScreenshotRef;
  jsonRel: string;
  data: Record<string, unknown>;
}

const PNG_WIDTH_RE = /^(.*)-(\d+)\.png$/i;

/** Every PNG anywhere in the tree whose name ends "-<width>.png". */
export function findScreenshots(files: WalkedFile[]): ScreenshotRef[] {
  const out: ScreenshotRef[] = [];
  for (const f of files) {
    const slash = f.rel.lastIndexOf("/");
    const base = slash === -1 ? f.rel : f.rel.slice(slash + 1);
    const dir = slash === -1 ? "" : f.rel.slice(0, slash);
    const m = PNG_WIDTH_RE.exec(base);
    if (!m) continue;
    out.push({ rel: f.rel, abs: f.abs, dir, stem: m[1] as string, width: Number(m[2]) });
  }
  return out;
}

function objAt(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (obj === null || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/**
 * Resolve the probe JSON that documents one screenshot, trying (same dir, then
 * the evidence root) x (stem-matched file, probe-<width>.json, probe.json's
 * widths[width], probes.json's "<stem>-<width>" key). First hit wins.
 */
export function resolveProbePartner(shot: ScreenshotRef, allFiles: WalkedFile[]): ProbeMatch | undefined {
  const byRel = new Map(allFiles.map((f) => [f.rel, f] as const));
  for (const d of [shot.dir, ""]) {
    const prefix = d ? `${d}/` : "";
    const sidecar = byRel.get(`${prefix}${shot.stem}-${shot.width}.json`);
    if (sidecar) {
      const data = readJsonSafe(sidecar.abs);
      if (data !== null && typeof data === "object") return { screenshot: shot, jsonRel: sidecar.rel, data: data as Record<string, unknown> };
    }
    const perWidth = byRel.get(`${prefix}probe-${shot.width}.json`);
    if (perWidth) {
      const data = readJsonSafe(perWidth.abs);
      if (data !== null && typeof data === "object") return { screenshot: shot, jsonRel: perWidth.rel, data: data as Record<string, unknown> };
    }
    const generic = byRel.get(`${prefix}probe.json`);
    if (generic) {
      const parsed = readJsonSafe(generic.abs);
      const byWidth = objAt(objAt(parsed, "widths"), String(shot.width));
      if (byWidth) return { screenshot: shot, jsonRel: generic.rel, data: byWidth };
    }
    const plural = byRel.get(`${prefix}probes.json`);
    if (plural) {
      const parsed = readJsonSafe(plural.abs);
      const byStem = objAt(parsed, `${shot.stem}-${shot.width}`);
      if (byStem) return { screenshot: shot, jsonRel: plural.rel, data: byStem };
    }
  }
  return undefined;
}

/** Every screenshot paired with its resolved probe JSON, dropping unresolved ones. */
export function resolveAllProbes(files: WalkedFile[]): ProbeMatch[] {
  const out: ProbeMatch[] = [];
  for (const shot of findScreenshots(files)) {
    const m = resolveProbePartner(shot, files);
    if (m) out.push(m);
  }
  return out;
}

export function ruleR1(files: WalkedFile[]): RuleResult {
  const id = "r1";
  const title = "one probe JSON beside every screenshot PNG";
  const shots = findScreenshots(files);
  if (shots.length === 0) return skip(id, title, "no width-suffixed screenshot PNGs found (e.g. full-1440.png)");
  const missing = shots.filter((s) => resolveProbePartner(s, files) === undefined).map((s) => s.rel);
  return missing.length === 0
    ? pass(id, title, shots.map((s) => s.rel))
    : fail(id, title, `no probe JSON found for: ${missing.join(", ")}`, missing);
}

export function ruleR2(files: WalkedFile[], widths: number[]): RuleResult {
  const id = "r2";
  const title = "every required width present as a PNG";
  const present = new Set(findScreenshots(files).map((s) => s.width));
  const missing = widths.filter((w) => !present.has(w));
  return missing.length === 0
    ? pass(id, title)
    : fail(id, title, `no screenshot PNG for width(s): ${missing.join(", ")}`);
}
