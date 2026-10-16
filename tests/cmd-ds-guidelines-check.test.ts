import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const FIXTURE = join(import.meta.dirname, "fixtures", "ds-guidelines", "basic");
const NOW = "2026-10-15T00:00:00Z";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
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

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A private project copy with a freshly built pack — the fixture itself is never written. */
function builtProject(): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-check-"));
  scratch.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  const built = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
  expect(built.code).toBe(0);
  return { dir, pack: join(dir, "design", "guidelines") };
}

interface Finding { code: string; severity: string; file: string; line: number; message: string }
interface CheckData { findings: Finding[]; errorCount: number; filesChecked: number; termSpansUnchecked: number }
const checkJson = (dir: string, extra: string[] = []): { code: number; data: CheckData } => {
  const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json", ...extra]);
  const data = (JSON.parse(r.out) as { data: CheckData }).data;
  // Open slots are expected in a fresh pack (covered by the scenarios tests); these assertions are about everything else.
  data.findings = data.findings.filter((f) => f.code !== "OPEN_QUESTION");
  return { code: r.code, data };
};

/** Append text to a pack file and return the 1-based line the appended text starts on. */
function appendLine(file: string, text: string): number {
  const before = readFileSync(file, "utf8");
  writeFileSync(file, `${before}\n${text}\n`);
  return before.split("\n").length + 1;
}

describe("ui ds guidelines check — names", () => {
  it("a freshly built pack is clean (exit 0)", () => {
    const { dir } = builtProject();
    const r = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^ds guidelines check: .* — 0 error\(s\)(, \d+ warning\(s\))?$/m);
    const j = checkJson(dir);
    expect(j.code).toBe(0);
    expect(j.data.findings).toEqual([]);
    expect(j.data.filesChecked).toBe(5);
  });

  it("G-CHECK-NAME: an invented component span is UNKNOWN_NAME with file:line (exit 1)", () => {
    const { dir, pack } = builtProject();
    const line = appendLine(join(pack, "components.md"), "Prefer `component:Buton/Primary` for the main action.");

    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.code).toBe(1);
    expect(text.out).toMatch(new RegExp(`^ {2}✗ \\[UNKNOWN_NAME\\] components\\.md:${line}: .*component:Buton/Primary`, "m"));
    expect(text.out).toMatch(/did you mean `component:Button\/Primary`\?/);

    const j = checkJson(dir);
    expect(j.code).toBe(1);
    expect(j.data.errorCount).toBe(1);
    expect(j.data.findings[0]).toMatchObject({ code: "UNKNOWN_NAME", severity: "error", file: "components.md", line });
  });

  it("G-CHECK-NAME: an invented token span is UNKNOWN_NAME; the real names stay green", () => {
    const { dir, pack } = builtProject();
    const file = join(pack, "vocabulary.md");
    appendLine(file, "Use `token:color.brand` and `component:Button/Primary` together.");
    expect(checkJson(dir).code).toBe(0);

    const line = appendLine(file, "Never use `token:color.surface-basee` here.");
    const j = checkJson(dir);
    expect(j.code).toBe(1);
    expect(j.data.findings).toHaveLength(1);
    expect(j.data.findings[0]).toMatchObject({ code: "UNKNOWN_NAME", file: "vocabulary.md", line });
    expect(j.data.findings[0]?.message).toContain("token:color.surface-basee");
  });

  it("only explicit spans are linted: plain backticks never false-positive, term spans are counted not judged", () => {
    const { dir, pack } = builtProject();
    appendLine(join(pack, "components.md"), "Code like `Buton/Primary`, `npm run build` or `token` is ordinary text; `term:Space` awaits a glossary.");
    const j = checkJson(dir);
    expect(j.code).toBe(0);
    expect(j.data.findings).toEqual([]);
    expect(j.data.termSpansUnchecked).toBe(1);
  });
});

describe("ui ds guidelines check — generated blocks", () => {
  it("G-CHECK-TAMPER: editing text inside a generated block is GENERATED_BLOCK_TAMPERED at the block's marker line", () => {
    const { dir, pack } = builtProject();
    const file = join(pack, "components.md");
    const lines = readFileSync(file, "utf8").split("\n");
    const markerIdx = lines.findIndex((l) => /^<!-- ds-guidelines:generated id=components\.button /.test(l));
    expect(markerIdx).toBeGreaterThanOrEqual(0);
    const target = lines.findIndex((l, i) => i > markerIdx && l.startsWith("- `component:Button/Primary`"));
    lines[target] = lines[target]!.replace("variants: solid", "variants: solid, gradient");
    writeFileSync(file, lines.join("\n"));

    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.code).toBe(1);
    expect(text.out).toMatch(new RegExp(`^ {2}✗ \\[GENERATED_BLOCK_TAMPERED\\] components\\.md:${markerIdx + 1}: .*components\\.button`, "m"));
    const j = checkJson(dir);
    expect(j.data.findings.map((f) => f.code)).toEqual(["GENERATED_BLOCK_TAMPERED"]);
  });

  it("an unterminated generated block is reported as tampered", () => {
    const { dir, pack } = builtProject();
    const file = join(pack, "overview.md");
    writeFileSync(file, readFileSync(file, "utf8").replace("<!-- /ds-guidelines:generated -->", ""));
    const j = checkJson(dir);
    expect(j.code).toBe(1);
    expect(j.data.findings).toContainEqual(expect.objectContaining({ code: "GENERATED_BLOCK_TAMPERED", file: "overview.md" }));
  });

  it("text outside generated blocks (host-filled slots) may change freely", () => {
    const { dir, pack } = builtProject();
    const file = join(pack, "components.md");
    const filled = readFileSync(file, "utf8").replace(
      /^> QUESTION\(confusable\.card-header-[0-9a-f]{8}\): .*$/m,
      "**Do:** use `component:Card/Header` inside a card.\n**Don't:** reuse it in a dialog.\n**Why:** the dialog has its own header.",
    );
    expect(filled).toMatch(/^\*\*Why:\*\*/m);
    writeFileSync(file, filled);
    expect(checkJson(dir).code).toBe(0);
  });
});

describe("ui ds guidelines check — failures and flags", () => {
  it("no pack -> PACK_NOT_FOUND", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-nopack-"));
    scratch.push(dir);
    cpSync(FIXTURE, dir, { recursive: true });
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("PACK_NOT_FOUND");
  });

  it("no design system -> DS_NOT_FOUND; tampered design system -> DS_TAMPERED", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-guidelines-nods-"));
    scratch.push(empty);
    const none = capture(["ds", "guidelines", "check", "--dir", empty, "--json"]);
    expect(JSON.parse(none.out).error.code).toBe("DS_NOT_FOUND");

    const { dir } = builtProject();
    const tokensPath = join(dir, "design", "design.tokens.json");
    writeFileSync(tokensPath, readFileSync(tokensPath, "utf8").replace("#2563EB", "#2563EC"));
    const bad = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out).error.code).toBe("DS_TAMPERED");
  });

  it("--out points check at another pack directory", () => {
    const { dir } = builtProject();
    const other = join(dir, "elsewhere");
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--out", other]).code).toBe(0);
    expect(existsSync(join(other, "overview.md"))).toBe(true);
    expect(capture(["ds", "guidelines", "check", "--dir", dir, "--out", other]).code).toBe(0);
  });

  it("rejects unknown flags and a build-only flag", () => {
    const { dir } = builtProject();
    const unknown = capture(["ds", "guidelines", "check", "--dir", dir, "--nope", "--json"]);
    expect(JSON.parse(unknown.out).error.code).toBe("UNKNOWN_FLAG");
    const now = capture(["ds", "guidelines", "check", "--dir", dir, "--now", NOW, "--json"]);
    expect(now.code).toBe(1);
    expect(JSON.parse(now.out).error.code).toBe("BAD_ARG");
  });
});
