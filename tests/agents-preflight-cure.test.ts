/**
 * A cure is validated by the pre-flight of the command it names. `ui agents check` prints a regenerate command only for
 * the runtimes `ui agents init` would write, and says the rest in words with the number of bytes that makes it
 * actionable; the size refusal of `ui agents init` offers no shorter roster, and the check's finding states the same
 * numbers as the refusal on the same file.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { extractCommands } from "./agents-walker-extract.js";
import { check, claudeFile, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const LIMIT = 32768;
const nums = (text: string): { total: number; outside: number; section: number } => {
  const n = (re: RegExp): number => Number(re.exec(text)?.[1] ?? NaN);
  return { total: n(/AGENTS\.md (?:would be|is) (\d+) bytes/), outside: n(/outside the agents section is (\d+) bytes/), section: n(/, the agents section is (\d+) bytes/) };
};

/** All three runtimes generated, then the person's own text grows until AGENTS.md is `over` bytes past the limit. */
function bigProject(over: number): string {
  const p = builtRing1();
  expect(init(p).code).toBe(0);
  const file = join(p, "AGENTS.md");
  const text = readFileSync(file, "utf8");
  writeFileSync(file, `${text.trimEnd()}\n\n${"x".repeat(LIMIT + over - Buffer.byteLength(text) - 2)}\n`);
  expect(statSync(file).size).toBe(LIMIT + over);
  return p;
}
/** Every command a text tells the reader to run, ready to run in the project. */
const printed = (text: string, p: string): string[][] => extractCommands(text).map((a) => [...a, "--dir", p]);
const refusedCodes = (argv: string[], p: string): string[] => {
  const copy = capture([...argv, "--dir", p, "--json"]);
  return copy.code === 0 ? [] : [(JSON.parse(copy.out) as { error: { code: string } }).error.code];
};

describe("the size refusal of ui agents init", () => {
  it("offers no shorter roster: its ways out are the other runtimes with the whole roster named, and the bytes to shorten by", () => {
    const p = bigProject(1000);
    const done = init(p, "--force");
    expect(done.code).toBe(1);
    expect(done.err).not.toMatch(/--roster (?!designer,curator,figma-hand)/);
    expect(done.err).toContain("or shorten the project's own text in AGENTS.md by at least 1000 bytes");
    const ways = printed(done.err, p);
    expect(ways).toHaveLength(1);
    expect(capture(ways[0] as string[]).code).toBe(0);
  });
  it("the file after the way out is still one whose only printed action is words, not a refused command", () => {
    const p = bigProject(1000);
    capture(printed(init(p, "--force").err, p)[0] as string[]);
    const got = capture(["agents", "check", "--dir", p]);
    expect(got.out).toContain("AGENTS_DOC_OVER_LIMIT");
    for (const argv of printed(got.out, p)) expect(refusedCodes(argv, p), argv.join(" ")).toEqual([]);
  });
});

describe("the check never prints a cure the pre-flight of ui agents init would refuse", () => {
  it("a stale Claude file in a project whose AGENTS.md is too large: the cure names the writable runtimes, the Codex part is said in words with a number", () => {
    const p = bigProject(1000);
    const agent = join(p, claudeFile(p, "designer"));
    writeFileSync(agent, readFileSync(agent, "utf8").replace("You are", "You were"));
    const got = check(p);
    const stale = got.data.findings.find((f) => f.checkId === "agent-stale")!;
    expect(stale.message).toContain("regenerate it: ui agents init --force --runtimes claude,antigravity");
    expect(stale.message).not.toMatch(/--runtimes [a-z,]*codex/);
    expect(stale.message).toContain("The Codex section cannot be regenerated");
    expect(stale.message).toContain("by at least 1000 bytes");
    for (const f of got.data.findings) for (const argv of printed(f.message, p)) expect(refusedCodes(argv, p), argv.join(" ")).toEqual([]);
    const cure = printed(stale.message, p)[0] as string[];
    expect(capture(cure).code).toBe(0);
    expect(check(p).data.findings.map((f) => f.checkId)).toEqual(["AGENTS_DOC_OVER_LIMIT"]);
  });
  it("a finding that concerns only the refused Codex section gets the words and no command", () => {
    const p = bigProject(1000);
    const file = join(p, "AGENTS.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("You are", "You were"));
    const finding = check(p).data.findings.find((f) => f.checkId === "AGENTS_ROSTER_DRIFT")!;
    expect(printed(finding.message, p)).toEqual([]);
    expect(finding.message).toContain("by at least 1000 bytes");
  });
});

describe("the size facts add up, and the check states the same ones as the refusal", () => {
  it("outside + section + separator is the file size, in the refusal of a file that has no section yet", () => {
    const p = builtRing1();
    writeFileSync(join(p, "AGENTS.md"), "x".repeat(LIMIT));
    const done = init(p, "--runtimes", "codex");
    const n = nums(done.err);
    const sep = Number(/and the (\d+) separator bytes/.exec(done.err)?.[1] ?? 0);
    expect(sep).toBe(3);
    expect(n.outside + n.section + sep).toBe(n.total);
    expect(done.err).toContain(`the last ${n.total - LIMIT} bytes of the file would not be read`);
  });
  it("on a file with a section, the refusal and the check give the same three numbers", () => {
    const p = bigProject(1000);
    const refusal = nums(init(p, "--force").err);
    const finding = nums(check(p).data.findings.find((f) => f.checkId === "AGENTS_DOC_OVER_LIMIT")!.message);
    expect(finding).toEqual(refusal);
    expect(finding.outside + finding.section).toBe(LIMIT + 1000);
  });
  it("the check's finding does not say the section is cut", () => {
    const p = bigProject(1000);
    const message = check(p).data.findings.find((f) => f.checkId === "AGENTS_DOC_OVER_LIMIT")!.message;
    expect(message).not.toMatch(/section (may be|would be|is) cut/);
    expect(message).toContain("the last 1000 bytes of the file are not read");
  });
});
