/**
 * Principles index emitter — turns the headings of `design/principles.md` into the
 * machine index `design/principles.json`. The ONLY code that reads the principles prose;
 * every other consumer reads the JSON (Art. I: deterministic, no model call).
 *
 * Entry shape in the markdown: `### <ID> · <title>` followed by `- **Yields when:** …` and
 * `- **Test:** …` bullets. Headings without an id (worked examples, section titles) are skipped.
 */
export interface PrincipleEntry { id: string; title: string; yields_when: string; test: string }
export interface PrinciplesIndex { version: 1; source: string; principles: PrincipleEntry[] }
export interface IndexProblem { id: string | null; message: string }

const HEADING = /^###\s+([A-Z]{1,3}\d+)\s+·\s+(.+?)\s*$/;
const FIELD = /^-\s+\*\*(Yields when|Test):\*\*\s*(.*)$/;

/** Join a bullet's first line with the indented continuation lines that follow it. */
function field(lines: string[], from: number): { text: string; next: number } {
  const parts = [(FIELD.exec(lines[from]!)?.[2] ?? "").trim()];
  let i = from + 1;
  while (i < lines.length && /^\s+\S/.test(lines[i]!) && !FIELD.test(lines[i]!.trim())) parts.push(lines[i++]!.trim());
  return { text: parts.join(" ").replace(/\s+/g, " ").trim(), next: i };
}

export function buildPrinciplesIndex(markdown: string, source: string): { index: PrinciplesIndex; problems: IndexProblem[] } {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const principles: PrincipleEntry[] = [];
  const problems: IndexProblem[] = [];
  const seen = new Set<string>();
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i]!)) { fence = !fence; continue; }
    const head = fence ? null : HEADING.exec(lines[i]!);
    if (head === null) continue;
    const [, id, title] = head as unknown as [string, string, string];
    if (seen.has(id)) problems.push({ id, message: `duplicate principle id ${id}` });
    seen.add(id);
    const entry: Record<string, string> = {};
    let j = i + 1;
    while (j < lines.length && !/^#{1,3}\s/.test(lines[j]!)) {
      const m = FIELD.exec(lines[j]!);
      if (m === null) { j++; continue; }
      const got = field(lines, j);
      entry[m[1] === "Test" ? "test" : "yields_when"] = got.text;
      j = got.next;
    }
    for (const [key, label] of [["yields_when", "Yields when"], ["test", "Test"]] as const) {
      if (!entry[key]) problems.push({ id, message: `${id} has no "${label}" bullet — add \`- **${label}:** …\`` });
    }
    principles.push({ id, title, yields_when: entry["yields_when"] ?? "", test: entry["test"] ?? "" });
  }
  if (principles.length === 0) problems.push({ id: null, message: "no `### <ID> · <title>` principle headings found" });
  return { index: { version: 1, source, principles }, problems };
}

/** Canonical bytes of the index file: sorted-by-document, 2-space, trailing newline. */
export const serializePrinciplesIndex = (index: PrinciplesIndex): string => JSON.stringify(index, null, 2) + "\n";
