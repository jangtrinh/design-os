/**
 * `ui reuse-plan check` — exit codes, the --json envelope, and Markdown robustness
 * (escaped pipes, spacing, CRLF, BOM, backticks, fenced blocks), plus the committed fixtures.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";

const FIX = fileURLToPath(new URL("./fixtures/reuse-plan/", import.meta.url));
const PROJECT = join(FIX, "project");

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

let scratch: string;
let n = 0;
beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "reuse-plan-md-")); });
// Every temp dir below lives inside `scratch`, so this one removal cleans the whole file.
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
function planFile(text: string): string {
  const p = join(scratch, `plan-${++n}.md`);
  writeFileSync(p, text, "utf8");
  return p;
}
interface Env { ok: boolean; error?: { code: string }; data?: { findings: { code: string; line: number }[]; screens: { reuse: number; total: number }[]; dsNew: { name: string; reason: string }[] } }
function json(text: string, dir = PROJECT): { code: number; env: Env } {
  const r = capture(["reuse-plan", "check", planFile(text), "--dir", dir, "--json"]);
  return { code: r.code, env: JSON.parse(r.out) as Env };
}

const HEAD = "| Slot | Rung | Use | Reason |\n|---|---|---|---|\n";

describe("exit codes and envelope", () => {
  it("0 = ok, 1 = findings; the envelope stays ok:true with the findings inside", () => {
    expect(capture(["reuse-plan", "check", join(FIX, "ok.md"), "--dir", PROJECT]).code).toBe(0);
    const r = capture(["reuse-plan", "check", join(FIX, "broken.md"), "--dir", PROJECT, "--json"]);
    expect(r.code).toBe(1);
    const env = JSON.parse(r.out) as Env;
    expect(env.ok).toBe(true);
    expect(env.data?.findings.length).toBeGreaterThan(5);
  });

  it("2 = cannot run: no registry under --dir (text and JSON)", () => {
    const empty = mkdtempSync(join(scratch, "empty-"));
    const file = join(FIX, "ok.md");
    const t = capture(["reuse-plan", "check", file, "--dir", empty]);
    expect(t.code).toBe(2);
    expect(t.err).toContain("registry");
    const j = capture(["reuse-plan", "check", file, "--dir", empty, "--json"]);
    expect(j.code).toBe(2);
    const env = JSON.parse(j.out) as Env;
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("REGISTRY_NOT_FOUND");
  });

  it("2 = cannot run: registry has the kernel root shape but a bad body, or a nameless component", () => {
    for (const body of ['{"version":"1","components":"nope"}', '{"version":"1","components":[{"category":"x"}]}']) {
      const bad = mkdtempSync(join(scratch, "bad-"));
      mkdirSync(join(bad, "design"));
      writeFileSync(join(bad, "design", "component-registry.json"), body, "utf8");
      const j = capture(["reuse-plan", "check", join(FIX, "ok.md"), "--dir", bad, "--json"]);
      expect(j.code, body).toBe(2);
      expect((JSON.parse(j.out) as Env).error?.code, body).toBe("BAD_REGISTRY");
    }
  });

  it("2 = cannot run: a foreign or unparseable component-registry.json is reported, not read", () => {
    const bad = mkdtempSync(join(scratch, "foreign-"));
    mkdirSync(join(bad, "design"));
    writeFileSync(join(bad, "design", "component-registry.json"), "{ not json", "utf8");
    const t = capture(["reuse-plan", "check", join(FIX, "ok.md"), "--dir", bad]);
    expect(t.code).toBe(2);
    expect(t.err).toContain("was not read");
  });

  it("2 = cannot run: plan file missing", () => {
    const j = capture(["reuse-plan", "check", join(scratch, "does-not-exist.md"), "--dir", PROJECT, "--json"]);
    expect(j.code).toBe(2);
    expect((JSON.parse(j.out) as Env).error?.code).toBe("FILE_NOT_FOUND");
  });

  it("usage errors exit 1: no file, no subcommand, unknown subcommand, unknown flag", () => {
    expect(capture(["reuse-plan", "check", "--json"]).code).toBe(1);
    expect(capture(["reuse-plan", "--json"]).code).toBe(1);
    expect(capture(["reuse-plan", "bogus", "--json"]).code).toBe(1);
    const f = capture(["reuse-plan", "check", join(FIX, "ok.md"), "--dir", PROJECT, "--nope", "--json"]);
    expect(f.code).toBe(1);
    expect((JSON.parse(f.out) as Env).error?.code).toBe("UNKNOWN_FLAG");
  });

  it("--dir defaults to the current directory", () => {
    const prev = process.cwd();
    process.chdir(PROJECT);
    try {
      expect(capture(["reuse-plan", "check", join(FIX, "ok.md")]).code).toBe(0);
    } finally { process.chdir(prev); }
  });
});

describe("Markdown robustness", () => {
  it("escaped pipes inside a cell stay in the cell", () => {
    const r = json(`## Screen: S\nPattern: Pattern/ListPage\n\n${HEAD}| a | 7 | ds-new: Yes \\| No toggle | label has a \\| bar |\n`);
    expect(r.code).toBe(0);
    expect(r.env.data?.dsNew).toEqual([{ name: "Yes | No toggle", reason: "label has a | bar", screen: "S", slot: "a", line: 6 }].map((x) => expect.objectContaining(x)));
  });

  it("extra spaces, tabs, alignment colons and rows without outer pipes", () => {
    const r = json(`##   Screen:    Spaced   \nPattern:    Pattern/ListPage   \n\n|  Slot | Rung |   Use | Reason  |\n| :--- | :-: | ---: | --- |\n|\theader\t|  3  |   Page header/Default   |   —   |\n  list | 3 | Table/Basic | —\n`);
    expect(r.code).toBe(0);
    expect(r.env.data?.screens[0]).toMatchObject({ reuse: 2, total: 2 });
  });

  it("CRLF line endings and a UTF-8 BOM", () => {
    const text = `\uFEFF## Screen: S\r\nPattern: Pattern/ListPage\r\n\r\n${HEAD.replace(/\n/g, "\r\n")}| a | 3 | Table/Basic | — |\r\n| b | 3 | Table/Basik | — |\r\n`;
    const r = json(text);
    expect(r.code).toBe(1);
    expect(r.env.data?.findings.map((f) => f.code)).toEqual(["UNKNOWN_COMPONENT"]);
    expect(r.env.data?.findings[0]?.line).toBe(7);
  });

  it("backticked names, bold Pattern label, bullet Pattern line", () => {
    for (const pattern of ["**Pattern:** `Pattern/ListPage`", "- Pattern: `Pattern/ListPage`", "__Pattern:__ Pattern/ListPage"]) {
      const r = json(`## Screen: S\n${pattern}\n\n${HEAD}| a | 3 | \`Table/Basic\` | — |\n| b | 5 | \`Filter bar/Default\` + \`Table/Dense\` | — |\n`);
      expect(r.code, pattern).toBe(0);
    }
  });

  it("an empty reason is — or - or blank, never a finding at rungs 3-6", () => {
    const rows = ["| a | 3 | Table/Basic | — |", "| b | 3 | Table/Dense | - |", "| c | 3 | Card/Summary |  |", "| d | 3 | Button/Primary | – |"];
    expect(json(`## Screen: S\nPattern: Pattern/ListPage\n\n${HEAD}${rows.join("\n")}\n`).code).toBe(0);
  });

  it("fenced code blocks are ignored, so a plan can quote the format", () => {
    const text = "```\n## Screen: Example\n| a | 3 | Nope | — |\n```\n\n## Screen: Real\nPattern: Pattern/ListPage\n\n" + HEAD + "| a | 3 | Table/Basic | — |\n";
    const r = json(text);
    expect(r.code).toBe(0);
    expect(r.env.data?.screens).toHaveLength(1);
  });

  it("a deeper heading inside a screen does not end it; a same-level heading does", () => {
    const inside = json(`## Screen: S\nPattern: Pattern/ListPage\n\n### Slots\n\n${HEAD}| a | 3 | Table/Basic | — |\n`);
    expect(inside.code).toBe(0);
    const after = json(`## Screen: S\nPattern: Pattern/ListPage\n\n${HEAD}| a | 3 | Table/Basic | — |\n\n## Notes\n\n${HEAD}| b | 3 | Table/Basic | — |\n`);
    expect(after.env.data?.findings.map((f) => f.code)).toEqual(["ROW_OUTSIDE_SCREEN"]);
  });

  it("control characters in author text cannot forge output lines", () => {
    const file = planFile(`## Screen: S\nPattern: Pattern/ListPage\n\n${HEAD}| a | 3 | Table/Bas\u001b[2Jic\u0007 | — |\n`);
    const t = capture(["reuse-plan", "check", file, "--dir", PROJECT]);
    expect(t.out).not.toContain("\u001b");
    expect(t.out).not.toContain("\u0007");
  });
});

describe("committed fixtures", () => {
  it("ok.md: reuse 4/5 on the list screen, 2/2 on the detail screen, one ds-new item", () => {
    const r = capture(["reuse-plan", "check", join(FIX, "ok.md"), "--dir", PROJECT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("reuse: 4/5");
    expect(r.out).toContain("reuse: 2/2");
    expect(r.out).toContain("ds-new: Owner chip");
  });

  it("broken.md: every planned defect is reported, once each", () => {
    const r = capture(["reuse-plan", "check", join(FIX, "broken.md"), "--dir", PROJECT, "--json"]);
    const found = (JSON.parse(r.out) as Env).data?.findings.map((f) => f.code) ?? [];
    expect(found).toEqual([
      "UNKNOWN_PATTERN", "UNKNOWN_COMPONENT", "UNKNOWN_COMPONENT", "NEW_MISSING_PREFIX",
      "NEW_WITHOUT_REASON", "NOT_NEW", "UNRESOLVED_TOKEN", "BAD_RUNG",
      "MISSING_PATTERN", "EMPTY_SCREEN", "PATTERN_NONE_NO_REASON",
    ]);
  });
});
