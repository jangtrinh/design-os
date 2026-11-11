/**
 * Codex reads at most 32,768 bytes of project instructions by default. `ui agents init` refuses, before anything is
 * written, an AGENTS.md that would exceed it; `ui agents check` reports a file that grew past it. The limit is measured
 * on the bytes of the whole file, the kernel's own section included.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODEX_PROJECT_DOC_MAX_BYTES } from "../src/core/agents-doc-limit.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { builtRing1, printedCommands } from "./ontology-query-helpers.js";
import { check, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const LIMIT = 32768;
const agents = (p: string): string => join(p, "AGENTS.md");
/** The bytes the agents section takes in a clean project (the file is the section and one newline). */
function sectionBytes(): number {
  const p = builtRing1();
  expect(init(p, "--runtimes", "codex").code).toBe(0);
  return statSync(agents(p)).size - 1;
}
/** A project whose own AGENTS.md holds exactly `outside` bytes of text, so the result is `outside + 2 + section + 1`. */
function withOwnText(outside: number): string {
  const p = builtRing1();
  writeFileSync(agents(p), "x".repeat(outside));
  return p;
}

describe("the limit is the runtime's default", () => {
  it("is 32,768 bytes", () => { expect(CODEX_PROJECT_DOC_MAX_BYTES).toBe(LIMIT); });
});

describe("ui agents init measures the file that would result", () => {
  /** Measured inside each test: the studio home is pinned only once a test runs, and it changes the agent names. */
  const dims = (): { section: number; fits: number } => { const section = sectionBytes(); return { section, fits: LIMIT - section - 3 }; };
  it("exactly at the limit: written; one byte over: refused with the three numbers, nothing written", () => {
    const { section, fits } = dims();
    const ok = withOwnText(fits);
    expect(init(ok, "--runtimes", "codex").code).toBe(0);
    expect(statSync(agents(ok)).size).toBe(LIMIT);
    const over = withOwnText(fits + 1);
    const before = hashTree(over);
    const done = init(over, "--json");
    expect(done.code).toBe(1);
    const err = JSON.parse(done.out).error as { code: string; message: string };
    expect(err.code).toBe("AGENTS_DOC_OVER_LIMIT");
    expect(err.message).toContain("would read only the first 32768 bytes of AGENTS.md and the agents section would be cut");
    expect(err.message).toContain(`${fits + 4} bytes`);
    expect(err.message).toContain(`${section} bytes`);
    expect(hashTree(over)).toBe(before);
    expect(existsSync(join(over, ".claude"))).toBe(false);
  });
  it("every way out the refusal prints succeeds when run as printed, and a shorter roster is one that fits", () => {
    const { fits } = dims();
    const p = withOwnText(fits + 1);
    const done = init(p);
    expect(done.code).toBe(1);
    const ways = printedCommands(done.err, p);
    expect(ways.length).toBe(2);
    expect(ways[0]!.slice(0, 5)).toEqual(["agents", "init", "--runtimes", "claude,antigravity", "--dir"]);
    expect(ways[1]![2]).toBe("--roster");
    for (const argv of ways) {
      const q = withOwnText(fits + 1);
      expect(capture([...argv.slice(0, -1), q]).code, argv.join(" ")).toBe(0);
      expect(statSync(agents(q)).size <= LIMIT).toBe(true);
    }
  });
  it("carries --force and the runtimes of the refused run into the ways out", () => {
    const { fits } = dims();
    const p = withOwnText(fits + 1);
    const done = init(p, "--force", "--runtimes", "codex,claude");
    const ways = printedCommands(done.err, p);
    for (const argv of ways) expect(argv).toContain("--force");
    expect(ways[0]).toContain("claude");
    expect(ways[0]).not.toContain("codex");
  });
  it("counts the kernel's own section: it, the person's text and the agents section together", () => {
    const { section } = dims();
    const p = builtRing1();
    expect(capture(["init", "--runtime", "codex", "--cwd", p]).code).toBe(0);
    const kernel = readFileSync(agents(p), "utf8");
    const room = LIMIT - section - 3 - Buffer.byteLength(kernel) - 2;
    writeFileSync(agents(p), `${kernel.trimEnd()}\n\n${"x".repeat(room)}`);
    expect(init(p, "--runtimes", "codex", "--json").code).toBe(0);
    expect(statSync(agents(p)).size).toBeLessThanOrEqual(LIMIT);
    const q = builtRing1();
    capture(["init", "--runtime", "codex", "--cwd", q]);
    writeFileSync(agents(q), `${readFileSync(agents(q), "utf8").trimEnd()}\n\n${"x".repeat(room + 2)}`);
    const refused = init(q, "--runtimes", "codex", "--json");
    expect(JSON.parse(refused.out).error.code).toBe("AGENTS_DOC_OVER_LIMIT");
  });
  it("a runtime list without codex never looks at the limit", () => {
    expect(init(withOwnText(LIMIT * 2), "--runtimes", "claude").code).toBe(0);
  });
});

describe("ui agents check reports a file that grew past the limit", () => {
  it("an error with the same code; it writes nothing and prints no command that would write", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "codex").code).toBe(0);
    writeFileSync(agents(p), `${readFileSync(agents(p), "utf8")}\n${"x".repeat(LIMIT)}`);
    const before = hashTree(p);
    const got = check(p);
    expect(got.code).toBe(1);
    const hit = got.data.findings.filter((f) => f.checkId === "AGENTS_DOC_OVER_LIMIT");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe("error");
    expect(hashTree(p)).toBe(before);
  });
});
