/**
 * DS Guidelines Pack — scenario slots (T6) and answer preservation (pure, no fs).
 *
 *   > QUESTION(<slot-id>): <prompt> — evidence: <ids>
 *   **Do:** … **Don't:** … **Why:** …          (written by the host, never by the binary)
 *
 * A slot is OPEN with no answer, FILLED when its answer (the lines right under it) holds all of Do /
 * Don't / Why (they may share a line), and PARTIAL otherwise. A rebuild carries every answer — partial ones too — to
 * the slot with the same id; an answer whose slot is gone goes to the orphans file, never away.
 */
import { compareText } from "./ds-guidelines-model.js";
import { BLOCK_OPEN_PREFIX } from "./ds-guidelines-render.js";

export const ORPHANS_FILE = "guidelines.orphans.md";

const SLOT_LINE_RE = /^> QUESTION\(([A-Za-z0-9._-]+)\): (.*)$/;
const ANSWER_LABEL_RE = /^\s*(?:[-*]\s+)?\*\*(?:Do|Don't|Why):\*\*/;
const ANSWER_PARTS = [
  { label: "**Do:**", re: /\*\*Do:\*\*/ },
  { label: "**Don't:**", re: /\*\*Don't:\*\*/ },
  { label: "**Why:**", re: /\*\*Why:\*\*/ },
] as const;

export interface ParsedSlot {
  id: string;
  prompt: string;
  /** 1-based line of the `> QUESTION(` line. */
  line: number;
  /** The answer region, blank edges trimmed (empty = unanswered). */
  answer: string[];
  /** Labels of the Do / Don't / Why parts the answer lacks. */
  missing: string[];
  status: "open" | "partial" | "filled";
}

/** Every slot in a rendered file. An answer runs to the next heading, slot or generated block. */
export function parseSlots(text: string): ParsedSlot[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const slots: ParsedSlot[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = SLOT_LINE_RE.exec(lines[i] ?? "");
    if (m === null) continue;
    // The answer is the run of lines right under the slot. A blank line ends it unless another
    // Do/Don't/Why line follows, so prose written later elsewhere in the file is never an answer.
    const region: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j] ?? "";
      if (l.startsWith("#") || l.startsWith(BLOCK_OPEN_PREFIX) || SLOT_LINE_RE.test(l)) break;
      if (l.trim() === "") {
        const next = lines.slice(j + 1).find((x) => x.trim() !== "");
        if (next === undefined || !ANSWER_LABEL_RE.test(next)) break;
      }
      region.push(l);
    }
    const joined = region.join("\n");
    const missing = ANSWER_PARTS.filter((p) => !p.re.test(joined)).map((p) => p.label);
    slots.push({
      id: m[1] ?? "", prompt: m[2] ?? "", line: i + 1, answer: region, missing,
      status: region.length === 0 ? "open" : missing.length === 0 ? "filled" : "partial",
    });
  }
  return slots;
}

/** Insert carried answers directly under their slots' QUESTION lines (fresh files hold no answers). */
export function injectAnswers(content: string, answers: ReadonlyMap<string, readonly string[]>): string {
  if (answers.size === 0) return content;
  const out: string[] = [];
  for (const line of content.split("\n")) {
    out.push(line);
    const id = SLOT_LINE_RE.exec(line)?.[1];
    const answer = id !== undefined ? answers.get(id) : undefined;
    if (answer !== undefined) out.push(...answer);
  }
  return out.join("\n");
}

export interface ExistingAnswer {
  id: string;
  file: string;
  line: number;
  prompt: string;
  lines: string[];
}

/** Every answered slot (complete or not) across an existing pack, in file then slot order. */
export function collectAnswers(files: readonly { path: string; text: string }[]): ExistingAnswer[] {
  return [...files]
    .sort((a, b) => compareText(a.path, b.path))
    .flatMap((f) => parseSlots(f.text).filter((s) => s.answer.length > 0)
      .map((s) => ({ id: s.id, file: f.path, line: s.line, prompt: s.prompt, lines: s.answer })));
}

const ORPHANS_HEADER = [
  "# Orphaned answers",
  "",
  "These answers belonged to slots the pack no longer seeds. Move each one into a current slot or delete it;",
  "nothing in this file is checked, and a rebuild only ever appends to it.",
  "",
].join("\n");

export const orphanEntryCount = (text: string): number => (text.match(/^## orphan: /gm) ?? []).length;

/** `id` + answer text of every entry already in an orphans file: what must not be appended twice. */
function knownOrphans(text: string): Set<string> {
  const known = new Set<string>();
  for (const chunk of text.split(/^## orphan: /m).slice(1)) {
    const id = /^(\S+)/.exec(chunk)?.[1] ?? "";
    const afterPrompt = /\n\nSlot prompt: [^\n]*\n\n([\s\S]*)$/.exec(chunk)?.[1] ?? "";
    known.add(`${id}\u0000${afterPrompt.trim()}`);
  }
  return known;
}

/**
 * Append the new orphans to the existing orphans file (or start one). An answer already parked
 * there (same slot id, same text) is not appended again, so a rebuild is idempotent.
 * Undefined = nothing to write.
 */
export function renderOrphans(existing: string | undefined, orphans: readonly ExistingAnswer[]): string | undefined {
  if (existing === undefined && orphans.length === 0) return undefined;
  const base = existing ?? ORPHANS_HEADER;
  const known = knownOrphans(base);
  const fresh = orphans.filter((o) => {
    const key = `${o.id}\u0000${o.lines.join("\n").trim()}`;
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  if (fresh.length === 0) return base;
  const entries = fresh.map((o) =>
    `\n## orphan: ${o.id} (was ${o.file}:${o.line})\n\nSlot prompt: ${o.prompt}\n\n${o.lines.join("\n")}\n`);
  return base.trimEnd() + "\n" + entries.join("");
}
