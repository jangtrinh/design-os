/**
 * DS Guidelines Pack — `grammar.md` (CONVENTIONS.md) and the soul summary for `overview.md`
 * (pure, no fs).
 *
 * Grammar is COPIED, never re-derived: every section of CONVENTIONS.md that carries DO/DON'T
 * lines is reproduced verbatim inside a generated block. The soul summary is capped, with a
 * pointer to the full file, so a long stance cannot crowd the pack.
 */
import { blockPart, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type { FilePart, GuidelineFile, OptionalInput, RuleEntry, SkippedSource } from "./ds-guidelines-model.js";

/** Soul lines copied into the overview (from the first stance heading); the rest stays in soul.md. */
export const SOUL_LINE_CAP = 40;

const DO_DONT = /\*\*(DO|DON'T)\b/;

/** `## Heading` sections of a markdown file, bodies trimmed of blank edges; text before the first is dropped. */
function sections(text: string): { heading: string; body: string[] }[] {
  const out: { heading: string; body: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h !== null) out.push({ heading: h[1] ?? "", body: [] });
    else out[out.length - 1]?.body.push(line.replace(/\s+$/, ""));
  }
  for (const s of out) {
    while (s.body[0] === "") s.body.shift();
    while (s.body[s.body.length - 1] === "") s.body.pop();
  }
  return out;
}

export function buildGrammarFile(conventions: OptionalInput, skipped: SkippedSource[]): GuidelineFile {
  const head = textPart("# Grammar");
  const notMeasured = (why: string): GuidelineFile => ({
    path: "grammar.md",
    parts: [head, blockPart("grammar.status", [`Grammar not measured yet — run \`ui synthesize-conventions\` on a usage-dna.json to add the measured DO/DON'T lines here. (${why})`])],
  });
  if (conventions.text === undefined) {
    skipped.push({ path: conventions.path, reason: "file not found — grammar.md says 'not measured yet'" });
    return notMeasured("no CONVENTIONS.md in the project");
  }
  const measured = sections(conventions.text).filter((s) => s.body.some((l) => DO_DONT.test(l)));
  if (measured.length === 0) {
    skipped.push({ path: conventions.path, reason: "no DO/DON'T sections found — grammar.md says 'not measured yet'" });
    return notMeasured("CONVENTIONS.md holds no DO/DON'T lines");
  }

  const usedBlocks = new Set<string>();
  const usedRules = new Set<string>();
  const parts: FilePart[] = [head, textPart("Measured house style: how real screens use this design system. Copied verbatim from CONVENTIONS.md — never re-derived.")];
  for (const s of measured) {
    const base = slug(s.heading) || "section";
    // A rule is a DO or DON'T statement: a bullet, or the bold label that introduces a table.
    const rules: RuleEntry[] = s.body
      .filter((l) => DO_DONT.test(l) && (l.startsWith("- ") || l.startsWith("**")))
      .map((l, i) => ({
        id: uniqueId(`grammar.${base}.${i + 1}`, usedRules),
        text: l,
        sources: [{ path: conventions.path, section: s.heading }],
      }));
    parts.push(textPart(`## ${s.heading}`));
    parts.push(blockPart(uniqueId(`grammar.${base}`, usedBlocks), s.body, rules));
  }
  return { path: "grammar.md", parts };
}

/** Lines of the soul's stance sections: frontmatter, comments and empty placeholder bullets removed. */
function stanceLines(text: string): { status?: string; lines: string[]; truncated: boolean } {
  let body = text.replace(/\r\n/g, "\n");
  let status: string | undefined;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(body);
  if (fm !== null) {
    status = /^status:\s*(\S+)/m.exec(fm[1] ?? "")?.[1];
    body = body.slice(fm[0].length);
  }
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  const lines = body.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => !/^\s*[-*]\s*$/.test(l));
  const first = lines.findIndex((l) => /^##\s/.test(l));
  if (first < 0) return { ...(status !== undefined ? { status } : {}), lines: [], truncated: false };
  const collapsed = lines.slice(first).filter((l, i, all) => !(l === "" && (all[i - 1] === "" || i === all.length - 1)));
  return {
    ...(status !== undefined ? { status } : {}),
    lines: collapsed.slice(0, SOUL_LINE_CAP),
    truncated: collapsed.length > SOUL_LINE_CAP,
  };
}

/** Overview parts for the stance summary; empty when there is no soul (recorded as skipped). */
export function buildSoulParts(soul: OptionalInput, skipped: SkippedSource[]): FilePart[] {
  if (soul.text === undefined) {
    skipped.push({ path: soul.path, reason: "file not found — overview has no stance summary" });
    return [];
  }
  const stance = stanceLines(soul.text);
  if (stance.lines.length === 0) {
    skipped.push({ path: soul.path, reason: "no stance sections (## headings) found — overview has no stance summary" });
    return [];
  }
  const lines = [
    ...(stance.status !== undefined ? [`Status: ${stance.status}`, ""] : []),
    ...stance.lines,
    ...(stance.truncated ? ["", `… capped at ${SOUL_LINE_CAP} lines.`] : []),
    "",
    `Full stance: ${soul.path}`,
  ];
  return [textPart("## Design stance"), blockPart("overview.soul", lines)];
}
