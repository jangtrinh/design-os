/**
 * `ui evidence lint` rules r4 (every recorded exit= is 0 or accounted for in
 * deviations.md) and r6 (a red-probe line exists somewhere). Both read
 * gates.txt (or gates/*.txt) and, for r6, falsification.txt too.
 */
import { readFileSync } from "node:fs";
import { fail, pass, type RuleResult, type WalkedFile } from "./build-evidence-rules-shared.js";

export function findGatesFiles(files: WalkedFile[]): WalkedFile[] {
  return files.filter((f) => /(^|\/)gates\.txt$/i.test(f.rel) || /(^|\/)gates\/[^/]+\.txt$/i.test(f.rel));
}
export function findFalsificationFiles(files: WalkedFile[]): WalkedFile[] {
  return files.filter((f) => /(^|\/)falsification\.txt$/i.test(f.rel));
}

const EXIT_LINE_RE = /\bexit=(\d+)\b/;

/**
 * Keywords a nonzero exit's block can be "accounted for" by in deviations.md:
 * bracketed rule ids (`[low-contrast]`), a "<name>: … FAIL" summary line, and
 * the CLI subcommand itself (`cli.js gate` -> "gate").
 */
function keywordsOf(block: string): string[] {
  const out = new Set<string>();
  for (const m of block.matchAll(/\[([a-z0-9-]+)\]/gi)) out.add((m[1] as string).toLowerCase());
  for (const m of block.matchAll(/^\s*([a-z][a-z0-9-]*):\s.*\b(FAIL|error)/gim)) out.add((m[1] as string).toLowerCase());
  const cmd = /cli\.js\s+([a-z][a-z0-9-]*)/i.exec(block);
  if (cmd) out.add((cmd[1] as string).toLowerCase());
  return [...out];
}

export function ruleR4(files: WalkedFile[], deviationsText: string | undefined): RuleResult {
  const id = "r4";
  const title = "gates.txt exists, names an inlined variant, and every exit= is 0 or listed in deviations.md";
  const gatesFiles = findGatesFiles(files);
  if (gatesFiles.length === 0) return fail(id, title, "no gates.txt (or gates/*.txt) found");
  const combined = gatesFiles.map((f) => readFileSync(f.abs, "utf8")).join("\n");
  if (!/inlined/i.test(combined)) return fail(id, title, "gates.txt never names an inlined variant", gatesFiles.map((f) => f.rel));

  const lines = combined.split(/\r?\n/);
  const unaccounted: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = EXIT_LINE_RE.exec((lines[i] as string).trim());
    if (!m || Number(m[1]) === 0) continue;
    let start = i;
    while (start > 0 && !(lines[start] as string).trim().startsWith("$ ")) start--;
    const block = lines.slice(start, i + 1).join("\n");
    const keywords = keywordsOf(block);
    const accounted = deviationsText !== undefined && keywords.some((k) => deviationsText.toLowerCase().includes(k));
    if (!accounted) unaccounted.push(`exit=${m[1]} at line ${i + 1} (${keywords.join(", ") || "no command context found"})`);
  }
  return unaccounted.length === 0 ? pass(id, title, gatesFiles.map((f) => f.rel)) : fail(id, title, unaccounted.join(" | "), unaccounted);
}

const RED_PROBE_MARKERS = /(self-probe|falsif|deliberat|mutat|must (report|go red|be)|red[- ]probe)/i;

export function ruleR6(files: WalkedFile[]): RuleResult {
  const id = "r6";
  const title = "a red-probe line exists in gates.txt or falsification.txt";
  const candidates = [...findGatesFiles(files), ...findFalsificationFiles(files)];
  if (candidates.length === 0) return fail(id, title, "no gates.txt or falsification.txt found");
  for (const f of candidates) {
    const text = readFileSync(f.abs, "utf8");
    if (RED_PROBE_MARKERS.test(text) && /exit=[1-9]/.test(text)) return pass(id, title, [f.rel]);
  }
  return fail(
    id,
    title,
    "no deliberately-bad-input, non-zero exit found (looked for self-probe/falsification/mutated wording next to exit=<N>, N != 0)",
    candidates.map((f) => f.rel),
  );
}
