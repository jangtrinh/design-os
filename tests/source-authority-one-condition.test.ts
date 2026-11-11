/**
 * The `two-token-sources` lint finding and the `source-authority` question are one condition (design-token-sources.ts):
 * which files count as present, how `derived` is read and how the values compare are answered once, over the same view
 * of the project. Each input below once made them disagree. After the question is answered the finding says what to do
 * about the ruling and never sends the owner back to the question.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { TWO_SOURCES, keyOf, projectWith, submit } from "./project-kinds-helpers.js";
import { ui } from "./ksync-helpers.js";

type Finding = { checkId: string; fix: string; message: string };
const findings = (p: string): Finding[] => (JSON.parse(ui(["design", "lint", p, "--json"]).stdout) as { data: { findings: Finding[] } }).data.findings;
const twoSources = (p: string): Finding[] => findings(p).filter((f) => f.checkId === "two-token-sources");
const pending = (p: string): number => (JSON.parse(capture(["onboard", "--cwd", p, "--json", "--no-banner"]).out) as { data: { rulings: { pending: number } } }).data.rulings.pending;
const SOURCES_AND_FLOOR = { "package.json": "{}", "design/soul.md": "x", "design/principles.md": "x", ...TWO_SOURCES };

describe("the lint and the question agree on what is a second source", () => {
  it("both raise for two differing files", () => {
    const p = projectWith(SOURCES_AND_FLOOR);
    expect(twoSources(p)).toHaveLength(1);
    expect(pending(p)).toBe(1);
  });
  it("a gitignored second file is a second source for neither", () => {
    const p = projectWith({ ...SOURCES_AND_FLOOR, ".gitignore": "design/tokens.json\n" });
    execFileSync("git", ["-C", p, "init", "-q"]);
    expect(twoSources(p)).toEqual([]);
    expect(pending(p)).toBe(0);
  });
  it("a derived entry that fails the schema declares nothing, for both", () => {
    const p = projectWith({ ...SOURCES_AND_FLOOR, "design/design-dir.json": JSON.stringify({ version: 1, derived: [{ path: "design/design.tokens.json" }] }) });
    expect(findings(p).map((f) => f.checkId)).toContain("bad-manifest");
    expect(twoSources(p)).toHaveLength(1);
    expect(pending(p)).toBe(1);
  });
  it("a valid derived entry silences both", () => {
    const p = projectWith({ ...SOURCES_AND_FLOOR, "design/design-dir.json": JSON.stringify({ version: 1, derived: [{ path: "design/design.tokens.json", derived_from: "design/tokens.json" }] }) });
    expect(twoSources(p)).toEqual([]);
    expect(pending(p)).toBe(0);
  });
});

describe("the finding says what to do in each state of the question", () => {
  const answered = (choice: string): string => {
    const p = projectWith(SOURCES_AND_FLOOR);
    capture(["onboard", "questions", "--cwd", p]);
    const key = keyOf(p).find((k) => k.kind === "source-authority")!;
    expect(submit(p, [{ fingerprint: key.fingerprint, choice }]).code).toBe(0);
    return p;
  };
  it("before the answer it names the question", () => {
    const p = projectWith(SOURCES_AND_FLOOR);
    expect(twoSources(p)[0]!.fix).toBe("Answer the source-authority question: ui onboard questions — or keep one source: delete one of the two files, or declare design/design.tokens.json derived in design/design-dir.json");
    capture(["onboard", "questions", "--cwd", p]);
    expect(twoSources(p)[0]!.fix).toContain("ui onboard questions"); // raised and still open
  });
  it("after the answer it names the ruled file and never tells the owner to answer again", () => {
    const p = answered("authority:design/tokens.json");
    expect(pending(p)).toBe(0);
    const fix = twoSources(p)[0]!.fix;
    expect(fix).toBe("The owner ruled design/tokens.json is the source (design/design-dir.json, onboard.rulings): make design/design.tokens.json agree with it or remove it, or declare design/design.tokens.json derived");
    expect(fix).not.toContain("question");
  });
  it("when the sealed store is the ruled source the other file is the one to change, and nothing is called derived", () => {
    const fix = twoSources(answered("authority:design/design.tokens.json"))[0]!.fix;
    expect(fix).toBe("The owner ruled design/design.tokens.json is the source (design/design-dir.json, onboard.rulings): make design/tokens.json agree with it or remove it");
  });
  it("a manifest whose rulings cannot be read leaves the unanswered text", () => {
    const p = answered("authority:design/tokens.json");
    const manifest = join(p, "design", "design-dir.json");
    const doc = JSON.parse(readFileSync(manifest, "utf8")) as { onboard: { rulings: Record<string, unknown>[] } };
    doc.onboard.rulings[0]!["actor"] = "someone";
    writeFileSync(manifest, JSON.stringify(doc));
    expect(twoSources(p)[0]!.fix).toContain("Answer the source-authority question");
  });
});

describe("a per-file answer that names two sources, or none, is a malformed answer", () => {
  it("is refused BAD_ANSWER and nothing is recorded", () => {
    const p = projectWith(SOURCES_AND_FLOOR);
    capture(["onboard", "questions", "--cwd", p]);
    const key = keyOf(p).find((k) => k.kind === "source-authority")!;
    for (const value of ["authoritative", "not-authoritative"]) {
      const members = Object.fromEntries(key.perMemberAnswer!.members.map((m) => [m, value]));
      const r = submit(p, [{ fingerprint: key.fingerprint, choice: key.perMemberAnswer!.choice, members }]);
      expect(r.code).toBe(1);
      expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ANSWER");
    }
  });
});
