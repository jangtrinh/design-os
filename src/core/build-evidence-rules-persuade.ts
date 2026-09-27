/**
 * `ui build-evidence` rule r8 — "Persuade evidence". Applies only to a
 * Persuade-style folder (build-loop.md's r1-r7 cover any evidence folder;
 * this one adds the marketing-page-specific proof: two contact sheets, a
 * critic verdict, and a scroll-story probe). Triggered when the folder holds
 * contact-sheet-build.png, concept.md, or the caller passes `--mode persuade`
 * — everything else (an "Operate" folder) reports r8 SKIPPED.
 *
 * The scroll-story check greps for REPORT_MARKERS from scroll-story-kernel.ts
 * — the same constants `ui scroll-story`'s text report emits — so the emitter
 * and this linter cannot drift into checking different text.
 */
import { readFileSync } from "node:fs";
import { fail, pass, skip, type RuleResult, type WalkedFile } from "./build-evidence-rules-shared.js";
import { REPORT_MARKERS } from "./scroll-story-kernel.js";

const RUBRIC_RE = /\b\d{1,2}\s*\/\s*16\b/;
const VERDICT_RE = /\b(SHIP-CANDIDATE|REVISE|REJECT)\b/;

function baseNameIs(f: WalkedFile, name: string): boolean {
  return f.rel.toLowerCase() === name.toLowerCase() || f.rel.toLowerCase().endsWith(`/${name.toLowerCase()}`);
}

export function isPersuadeFolder(files: WalkedFile[], mode: string | undefined): boolean {
  if (mode === "persuade") return true;
  return files.some((f) => baseNameIs(f, "contact-sheet-build.png") || baseNameIs(f, "concept.md"));
}

function readTextSafe(f: WalkedFile): string | undefined {
  try {
    return readFileSync(f.abs, "utf8");
  } catch {
    return undefined;
  }
}

function checkContactSheets(files: WalkedFile[]): string[] {
  const problems: string[] = [];
  if (!files.some((f) => baseNameIs(f, "contact-sheet-build.png"))) problems.push("missing contact-sheet-build.png");

  const hasBar = files.some((f) => baseNameIs(f, "contact-sheet-bar.png"));
  if (hasBar) return problems;
  const notCaptured = files.find((f) => baseNameIs(f, "contact-sheet-bar.NOT-CAPTURED.txt"));
  if (!notCaptured) {
    problems.push("missing contact-sheet-bar.png (or contact-sheet-bar.NOT-CAPTURED.txt naming the error)");
  } else if ((readTextSafe(notCaptured) ?? "").trim().length === 0) {
    problems.push("contact-sheet-bar.NOT-CAPTURED.txt is empty (must record the capture error)");
  }
  return problems;
}

function checkCritic(files: WalkedFile[]): string[] {
  const criticFiles = files.filter((f) => /(^|\/)critic-[^/]+\.md$/i.test(f.rel));
  if (criticFiles.length === 0) return ["no critic-*.md file found"];
  const ok = criticFiles.some((f) => {
    const text = readTextSafe(f);
    return text !== undefined && RUBRIC_RE.test(text) && VERDICT_RE.test(text);
  });
  return ok ? [] : ["critic-*.md found but none carries a rubric total N/16 and a SHIP-CANDIDATE|REVISE|REJECT verdict"];
}

function checkScrollStory(files: WalkedFile[]): string[] {
  const ok = files.some((f) => {
    if (!/scroll-story/i.test(f.rel)) return false;
    const text = readTextSafe(f);
    return text !== undefined && text.includes(REPORT_MARKERS.staticRun) && text.includes(REPORT_MARKERS.layoutVariance);
  });
  return ok
    ? []
    : [`no scroll-story probe output found (expected a file whose name contains "scroll-story" and whose text carries both "${REPORT_MARKERS.staticRun}" and "${REPORT_MARKERS.layoutVariance}")`];
}

export function ruleR8(files: WalkedFile[], mode: string | undefined): RuleResult {
  const id = "r8";
  const title = "Persuade evidence: both contact sheets, a critic verdict, and the scroll-story probe";
  if (!isPersuadeFolder(files, mode)) return skip(id, title, "not a Persuade folder (no contact-sheet-build.png, concept.md, or --mode persuade)");

  const problems = [...checkContactSheets(files), ...checkCritic(files), ...checkScrollStory(files)];
  return problems.length === 0 ? pass(id, title) : fail(id, title, problems.join(" | "), problems);
}
