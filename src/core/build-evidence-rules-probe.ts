/**
 * `ui evidence lint` rules r3 (scroll <= inner) and r7 (font actually rendered).
 * Both read the probe JSON pairing resolved by evidence-rules-shots.ts — one
 * screenshot/probe pass, two checks — because real probes name the same two
 * measurements under different keys (read-first step 5): scrollWidth/innerWidth
 * (stage2 shots) vs scrollW/innerW (persona probe.json widths[]) vs scrollW/width
 * (persona probe-<width>.json). All three are accepted.
 */
import { resolveAllProbes, type ProbeMatch } from "./build-evidence-rules-shots.js";
import { fail, pass, skip, type RuleResult, type WalkedFile } from "./build-evidence-rules-shared.js";

function numeric(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function scrollOf(data: Record<string, unknown>): number | undefined {
  return numeric(data["scrollWidth"]) ?? numeric(data["scrollW"]) ?? numeric(data["scroll"]);
}
function innerOf(data: Record<string, unknown>): number | undefined {
  return numeric(data["innerWidth"]) ?? numeric(data["innerW"]) ?? numeric(data["width"]) ?? numeric(data["viewportWidth"]);
}

export function ruleR3(files: WalkedFile[]): RuleResult {
  const id = "r3";
  const title = "probe JSON carries scrollWidth/innerWidth (or scrollW/width) and scroll <= inner";
  const pairs = resolveAllProbes(files);
  if (pairs.length === 0) return skip(id, title, "no probe JSON resolved for any screenshot (see r1)");
  const bad: string[] = [];
  for (const p of pairs) {
    const scroll = scrollOf(p.data);
    const inner = innerOf(p.data);
    if (scroll === undefined || inner === undefined) {
      bad.push(`${p.screenshot.rel}: ${p.jsonRel} has no scrollWidth/innerWidth (or scrollW/width) pair`);
    } else if (scroll > inner) {
      bad.push(`${p.screenshot.rel}: ${p.jsonRel} scroll ${scroll} > inner ${inner} (horizontal overflow)`);
    }
  }
  return bad.length === 0 ? pass(id, title, pairs.map((p) => p.jsonRel)) : fail(id, title, bad.join(" | "), bad);
}

const FONT_KEYS = ["fontsCheck", "firstFamilyRenders", "fontCheck", "fontOk", "fontsLoaded"] as const;

/**
 * A font-check value passes only as a bare `true`, or an object whose every
 * value is `true` (one probe checking several faces, e.g. `{serif: true,
 * sans: true}`). Anything else — `false`, a non-boolean, or an object with any
 * non-true member — fails, naming the offending key so the operator does not
 * have to open the JSON to find it.
 */
function fontCheckVerdict(data: Record<string, unknown>): { seen: boolean; ok: boolean; badKey?: string } {
  for (const k of FONT_KEYS) {
    if (!(k in data)) continue;
    const v = data[k];
    if (typeof v === "boolean") return { seen: true, ok: v, badKey: v ? undefined : k };
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const bad = Object.entries(v as Record<string, unknown>).find(([, member]) => member !== true);
      return { seen: true, ok: bad === undefined, badKey: bad ? `${k}.${bad[0]}` : undefined };
    }
    return { seen: true, ok: false, badKey: k };
  }
  return { seen: false, ok: false };
}

export function ruleR7(files: WalkedFile[], deviationsText: string | undefined): RuleResult {
  const id = "r7";
  const title = "probe font check is true, or the PNG set is marked fallback-face in deviations.md";
  const pairs = resolveAllProbes(files);
  if (pairs.length === 0) return skip(id, title, "no probe JSON resolved for any screenshot (see r1)");
  let sawKey = false;
  const bad: string[] = [];
  for (const p of pairs) {
    const v = fontCheckVerdict(p.data);
    if (!v.seen) continue;
    sawKey = true;
    if (!v.ok) {
      const fallbackNoted = deviationsText !== undefined && /fallback/i.test(deviationsText);
      if (!fallbackNoted) bad.push(`${p.screenshot.rel}: ${p.jsonRel} font check fails at '${v.badKey}' and deviations.md does not mention a fallback face`);
    }
  }
  if (!sawKey) return skip(id, title, "no probe JSON carries a font-check key (fontsCheck / firstFamilyRenders / fontCheck / fontOk / fontsLoaded)");
  return bad.length === 0 ? pass(id, title) : fail(id, title, bad.join(" | "), bad);
}

export type { ProbeMatch };
