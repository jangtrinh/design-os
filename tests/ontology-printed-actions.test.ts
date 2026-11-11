/**
 * A next action is printed only when it works as printed: every `ui ...` command that `ui ontology lint` prints is run
 * as printed, before the first build and after it, and none of them answers that nothing is pending.
 */
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { build, fullProject } from "./ontology-helpers.js";

const PRINTED = /\bui (onboard questions(?: --format claude)?|ontology build)\b/g;
/** Every command the lint text prints, run as printed, in the order the text prints them (a sentence "run A, then B" is a sequence), on a copy of the project. */
function runPrinted(p: string): { command: string; text: string }[] {
  const text = capture(["ontology", "lint", "--dir", p]).out;
  const copy = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-printed-"));
  cpSync(p, copy, { recursive: true });
  return [...text.matchAll(PRINTED)].map((m) => m[1]!).filter((c, i, all) => all.indexOf(c) === i).map((command) => {
    const args = command.split(" ");
    const done = capture([...args, args[0] === "onboard" ? "--cwd" : "--dir", copy]);
    return { command, text: `${done.out}${done.err}` };
  });
}
const pairLine = (p: string): string => capture(["ontology", "lint", "--dir", p]).out.split("\n").find((l) => l.includes("candidate pair(s) await"))!;

describe("the commands the lint prints work as printed", () => {
  it("before the first build, with candidate pairs waiting", () => {
    const p = fullProject();
    const ran = runPrinted(p);
    expect(ran.length).toBeGreaterThan(0);
    for (const r of ran) expect(r.text, r.command).not.toMatch(/nothing is pending|NO_PENDING_QUESTIONS/);
  });
  it("the count of candidate pairs names no command: nothing is pending before the first build", () => {
    expect(pairLine(fullProject())).not.toMatch(/\bui /);
  });
  it("after one build", () => {
    const p = fullProject();
    build(p);
    const ran = runPrinted(p);
    expect(ran.length).toBeGreaterThan(0);
    for (const r of ran) expect(r.text, r.command).not.toMatch(/nothing is pending|NO_PENDING_QUESTIONS/);
  });
});
