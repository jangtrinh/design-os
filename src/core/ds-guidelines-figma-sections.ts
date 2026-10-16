/**
 * DS Guidelines Pack — splitting canonical pack files into bundle sections (pure, no fs).
 *
 * Provenance is compressed here: the generated-block comment markers are dropped (each rule keeps
 * its own id and source reference in its line). `## ` headings inside a generated block — the soul
 * stance copies its own — are content, not structure.
 */
import { BLOCK_CLOSE, BLOCK_OPEN_PREFIX } from "./ds-guidelines-render.js";
import type { BSection, Unit } from "./ds-guidelines-budget.js";

export interface RawSection {
  /** The `## …` line, or null for the preamble before the first heading. */
  heading: string | null;
  /** Lines under the heading with generated markers removed and blank edges trimmed. */
  body: string[];
  /** Ids of the generated blocks that sat in this section. */
  blockIds: string[];
}

function trimBlankEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out[0] === "") out.shift();
  while (out[out.length - 1] === "") out.pop();
  return out;
}

export function splitSections(text: string): RawSection[] {
  const sections: RawSection[] = [{ heading: null, body: [], blockIds: [] }];
  let inBlock = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const current = sections[sections.length - 1] as RawSection;
    if (line.startsWith(BLOCK_OPEN_PREFIX)) {
      inBlock = true;
      const id = /\bid=(\S+)/.exec(line)?.[1];
      if (id !== undefined) current.blockIds.push(id);
      continue;
    }
    if (line === BLOCK_CLOSE) { inBlock = false; continue; }
    if (!inBlock && /^## \S/.test(line)) { sections.push({ heading: line, body: [], blockIds: [] }); continue; }
    current.body.push(line);
  }
  const trimmed = sections.map((s) => ({ ...s, body: trimBlankEdges(s.body) }));
  return trimmed.filter((s, i) => i > 0 || s.body.length > 0);
}

const SINCE_RE = /\(since (\d{4}-\d{2}-\d{2})/;
const RULING_ID_RE = /^- \*\*([^*]+)\*\*/;
const TERM_ID_RE = /^- `term:([^`]+)`/;

/** A section whose `- ` bullets are individually droppable (rulings, terms); other lines stay as `pre`. */
export function listSection(raw: RawSection, heading: string | null = raw.heading): BSection {
  const pre: string[] = [];
  const units: Unit[] = [];
  for (const line of raw.body) {
    if (!line.startsWith("- ")) { pre.push(line); continue; }
    const term = TERM_ID_RE.exec(line)?.[1];
    const id = RULING_ID_RE.exec(line)?.[1] ?? (term !== undefined ? `term:${term}` : line.slice(2, 40));
    units.push({ id, lines: [line], weight: 1, since: SINCE_RE.exec(line)?.[1] ?? "" });
  }
  return { heading, pre: trimBlankEdges(pre), units, trimmable: true };
}

/** A section that is dropped as one piece (a grammar section, the soul stance). */
export function wholeSection(raw: RawSection, id: string, weight: number): BSection {
  return { heading: raw.heading, pre: [], units: [{ id, lines: raw.body, weight, since: "" }], trimmable: true };
}

/** A section that is copied as it is and never trimmed. */
export function fixedSection(raw: RawSection, heading: string | null = raw.heading): BSection {
  return { heading, pre: raw.body, units: [], trimmable: false };
}
