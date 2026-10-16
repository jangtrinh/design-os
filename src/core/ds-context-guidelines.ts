/**
 * `ds context --include guidelines` — the guidelines pack as a budgeted context block (pure, no fs).
 *
 * Emits the pack's file index, the anti-pattern scenario titles (with each slot's status) and the
 * tier-A rulings (id + text). The section bounds ITSELF to `--max-bytes`: rulings are dropped from
 * the tail first, then scenario titles, never the file index, and the drop is stated in the block.
 * An absent pack omits the section; a pack whose manifest cannot be read says so in one line.
 */
import { parseSlots } from "./ds-guidelines-slots.js";

export interface GuidelinesContextInput {
  /** Text of guidelines.manifest.json. */
  manifestText: string;
  antiPatternsText?: string;
  rulingsText?: string;
}

export interface GuidelinesStructured {
  generatedAt: string;
  ruleCount: number;
  openQuestions: number;
  seal: string;
  files: { path: string; bytes: number }[];
  scenarios: { id: string; title: string; status: string }[];
  rulings: { id: string; text: string }[];
  dropped: { rulings: number; scenarios: number };
}

/** What the section shows for a pack: structured data, or `unreadable` for a damaged manifest. */
export type GuidelinesBlock = GuidelinesStructured | "unreadable";

const OTHER_HEADING = "## Other library-wide rulings";
const RULING_LINE = /^- \*\*([^*]+)\*\* — (.*)$/;
const RULING_TAIL = /\s*\((?:since|source)[^)]*\)\s*$/;
const RULING_STEPS = [40, 20, 10, 5, 0];
const SCENARIO_STEPS = [10, 5, 0];
const STATUS = { open: "open", partial: "partial", filled: "answered" } as const;

const bytesOf = (text: string): number => Buffer.byteLength(text, "utf8");
const thousands = (n: number): string => n.toLocaleString("en-US");

function tierARulings(text: string | undefined): { id: string; text: string }[] {
  if (text === undefined) return [];
  const out: { id: string; text: string }[] = [];
  let skipping = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("## ")) skipping = line.trimEnd() === OTHER_HEADING;
    const m = skipping ? null : RULING_LINE.exec(line);
    if (m !== null) out.push({ id: m[1] ?? "", text: (m[2] ?? "").replace(RULING_TAIL, "") });
  }
  return out;
}

function scenarios(text: string | undefined): { id: string; title: string; status: string }[] {
  if (text === undefined) return [];
  const lines = text.split("\n");
  return parseSlots(text).map((s) => {
    let title = s.id;
    for (let i = s.line - 2; i >= 0; i--) {
      if ((lines[i] ?? "").startsWith("### ")) { title = (lines[i] ?? "").slice(4).trim(); break; }
    }
    return { id: s.id, title, status: STATUS[s.status] };
  });
}

/** Markdown for the section; `body` omits empty sub-sections. */
export function guidelinesMarkdown(g: GuidelinesStructured, maxBytes: number): string {
  const lines = [
    `## Guidelines pack (design/guidelines, built ${g.generatedAt.slice(0, 10)}, ${g.ruleCount} rule(s), ${g.openQuestions} open question(s))`,
    "",
    ...(g.seal === "unverified" ? ["_Seal: unverified — the pack was built from a store that no longer matched its sealed hashes._", ""] : []),
    "### Files",
    ...g.files.map((f) => `- ${f.path} (${thousands(f.bytes)} B)`),
    "",
  ];
  if (g.scenarios.length > 0) lines.push("### Scenarios", ...g.scenarios.map((s) => `- ${s.title} (${s.id}) — ${s.status}`), "");
  if (g.rulings.length > 0) lines.push("### Library-wide rulings (tier A)", ...g.rulings.map((r) => `- ${r.id} — ${r.text}`), "");
  const { rulings, scenarios: s } = g.dropped;
  if (rulings + s > 0) {
    lines.push(`_dropped to fit --max-bytes ${maxBytes}: ${rulings} ruling(s)${s > 0 ? `, ${s} scenario title(s)` : ""}_`, "");
  }
  return lines.join("\n");
}

/** Markdown for the section, hard-truncated (as the other sections are) if even the bare index is too big. */
export function guidelinesMarkdownBounded(g: GuidelinesStructured, maxBytes: number): string {
  const md = guidelinesMarkdown(g, maxBytes);
  if (bytesOf(md) <= maxBytes) return md;
  return Buffer.from(md, "utf8").subarray(0, Math.max(0, maxBytes - 15)).toString("utf8") + "\n…(truncated)\n";
}

/**
 * The block for a pack, shrunk to `maxBytes` by dropping rulings first (keeping the head of the
 * file), then scenario titles; `measure` says how big a candidate is in the caller's format.
 * Undefined input = no pack = no section.
 */
export function summarizeGuidelines(
  input: GuidelinesContextInput | undefined,
  maxBytes: number,
  measure: (g: GuidelinesStructured) => number,
): GuidelinesBlock | null {
  if (input === undefined) return null;
  let manifest: { generatedAt?: unknown; ruleCount?: unknown; openQuestions?: unknown; seal?: { status?: unknown }; files?: { path?: unknown; bytes?: unknown }[] };
  try { manifest = JSON.parse(input.manifestText) as typeof manifest; } catch { return "unreadable"; }
  if (typeof manifest !== "object" || manifest === null || !Array.isArray(manifest.files)) return "unreadable";

  const allScenarios = scenarios(input.antiPatternsText);
  const allRulings = tierARulings(input.rulingsText);
  const base: GuidelinesStructured = {
    generatedAt: typeof manifest.generatedAt === "string" ? manifest.generatedAt : "",
    ruleCount: typeof manifest.ruleCount === "number" ? manifest.ruleCount : 0,
    openQuestions: typeof manifest.openQuestions === "number" ? manifest.openQuestions : 0,
    seal: typeof manifest.seal?.status === "string" ? manifest.seal.status : "verified",
    files: manifest.files.flatMap((f) => (typeof f.path === "string" ? [{ path: f.path, bytes: typeof f.bytes === "number" ? f.bytes : 0 }] : [])),
    scenarios: allScenarios, rulings: allRulings, dropped: { rulings: 0, scenarios: 0 },
  };
  const at = (rulings: number, scen: number): GuidelinesStructured => ({
    ...base,
    scenarios: allScenarios.slice(0, scen), rulings: allRulings.slice(0, rulings),
    dropped: { rulings: allRulings.length - Math.min(rulings, allRulings.length), scenarios: allScenarios.length - Math.min(scen, allScenarios.length) },
  });
  // Rulings shrink first (scenarios whole), then scenario titles (rulings gone).
  const rulingLimits = [...new Set([allRulings.length, ...RULING_STEPS.filter((n) => n < allRulings.length)])];
  const scenarioLimits = [...new Set([allScenarios.length, ...SCENARIO_STEPS.filter((n) => n < allScenarios.length)])];
  const candidates = [...rulingLimits.map((r) => at(r, allScenarios.length)), ...scenarioLimits.slice(1).map((s) => at(0, s))];
  return candidates.find((c) => measure(c) <= maxBytes) ?? at(0, 0);
}

export const guidelinesMeasure = {
  markdown: (maxBytes: number) => (g: GuidelinesStructured): number => bytesOf(guidelinesMarkdown(g, maxBytes)),
  json: (g: GuidelinesStructured): number => bytesOf(JSON.stringify(g)),
};
