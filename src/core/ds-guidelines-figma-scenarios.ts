/**
 * DS Guidelines Pack — how a scenario reads in the Figma bundle (pure, no fs).
 *
 * The canonical pack keeps `> QUESTION(<id>): <prompt> — evidence: <refs>` lines: they are the machine's
 * handle on a slot. Figma's agent reads the bundle as guidance, so the bundle shows each scenario as
 *
 *   ### <title>
 *   _Evidence: <refs, comma-separated>_
 *   **Do:** … **Don't:** … **Why:** …
 *
 * with the QUESTION line and the slot id dropped. A look-alike-names slot has no title heading in the pack,
 * so its prompt becomes the heading and its member names (the `component:` spans of the prompt) the evidence.
 */
import { missingAnswerParts } from "./ds-guidelines-slots.js";

const SLOT_RE = /^> QUESTION\([A-Za-z0-9._-]+\): (.*)$/;
const EVIDENCE_SUFFIX_RE = / — evidence: (.*)$/;
const EVIDENCE_LINE_RE = /^_Evidence: .*_$/;
const COMPONENT_SPAN_RE = /`component:[^`]+`/g;
const ANSWER_LABEL_RE = /^\s*(?:[-*]\s+)?\*\*(?:Do|Don't|Why):\*\*/;

/** Rewrite the QUESTION lines of one section body into the bundle's scenario shape. */
export function renderScenarioLines(body: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of body) {
    const slot = SLOT_RE.exec(line);
    if (slot === null) { out.push(line); continue; }
    const rest = slot[1] ?? "";
    const suffix = EVIDENCE_SUFFIX_RE.exec(rest);
    const prompt = suffix !== null ? rest.slice(0, suffix.index) : rest;
    const refs = suffix !== null ? (suffix[1] ?? "").split(", ").filter((r) => r !== "") : (prompt.match(COMPONENT_SPAN_RE) ?? []);
    const last = [...out].reverse().find((l) => l !== "");
    if (last === undefined || !last.startsWith("### ")) {
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(`### ${prompt}`);
    }
    if (refs.length > 0) out.push(`_Evidence: ${refs.join(", ")}_`);
  }
  return out;
}

/** Scenarios in a rendered bundle file that lack a complete answer: 1-based line of the evidence line + the title. */
export function openBundleScenarios(text: string): { line: number; title: string }[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const open: { line: number; title: string }[] = [];
  lines.forEach((l, i) => {
    if (!EVIDENCE_LINE_RE.test(l)) return;
    const region: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const x = lines[j] ?? "";
      if (x.startsWith("#") || EVIDENCE_LINE_RE.test(x)) break;
      if (x.trim() === "") {
        const next = lines.slice(j + 1).find((y) => y.trim() !== "");
        if (next === undefined || !ANSWER_LABEL_RE.test(next)) break;
      }
      region.push(x);
    }
    if (missingAnswerParts(region.join("\n")).length > 0) {
      open.push({ line: i + 1, title: (lines[i - 1] ?? "").replace(/^#+ /, "") });
    }
  });
  return open;
}
