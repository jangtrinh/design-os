import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

const FIX = join(process.cwd(), "tests", "fixtures", "rulings");

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

const tmp = (): string => mkdtempSync(join(tmpdir(), "rulings-render-"));
const read = (dir: string, lang: string): string => readFileSync(join(dir, `rulings.${lang}.md`), "utf8");

describe("ui knowledge render", () => {
  it("writes en + vi; groups by category then id; vi translates only labels", () => {
    const dir = tmp();
    const r = capture(["knowledge", "render", join(FIX, "clean.json"), "--out", dir, "--lang", "en,vi"]);
    expect(r.code).toBe(0);
    const en = read(dir, "en");
    const vi = read(dir, "vi");
    expect(en.indexOf("## shell-chrome")).toBeLessThan(en.indexOf("## tables"));
    expect(en).toContain("- **`r-b-new`** — Tables right-align numeric columns.");
    expect(en).toContain("verified by: source");
    expect(vi).toContain("kiểm bởi: source");
    expect(vi).toContain("# Quy tắc thiết kế");
    // ruling text, ids, categories, sources are untouched in vi
    for (const kept of ["Tables right-align numeric columns.", "Old rule, replaced. SUPERSEDED by r-b-new for tables.", "`r-a-old`", "## tables (1)", "`anchors/live.md#heading`"]) {
      expect(vi).toContain(kept);
    }
    expect(vi).not.toContain("verified by");
  });

  it("is deterministic and independent of input order", () => {
    const doc = JSON.parse(readFileSync(join(FIX, "clean.json"), "utf8"));
    const shuffled = { ...doc, rulings: [...doc.rulings].reverse() };
    const path = join(tmp(), "shuffled.json");
    writeFileSync(path, JSON.stringify(shuffled), "utf8");
    const a = tmp(); const b = tmp(); const c = tmp();
    capture(["knowledge", "render", join(FIX, "clean.json"), "--out", a, "--lang", "en,vi"]);
    capture(["knowledge", "render", join(FIX, "clean.json"), "--out", b, "--lang", "en,vi"]);
    capture(["knowledge", "render", path, "--out", c, "--lang", "en,vi"]);
    for (const lang of ["en", "vi"]) {
      expect(read(b, lang)).toBe(read(a, lang));
      expect(read(c, lang)).toBe(read(a, lang));
    }
  });

  it("defaults to en only", () => {
    const dir = tmp();
    capture(["knowledge", "render", join(FIX, "clean.json"), "--out", dir]);
    expect(read(dir, "en")).toContain("# Rulings");
    expect(() => read(dir, "vi")).toThrow();
  });

  it("renders a ruling with a null since as 'unknown' instead of dropping it", () => {
    const doc = JSON.parse(readFileSync(join(FIX, "clean.json"), "utf8"));
    doc.rulings[0].since = null;
    const path = join(tmp(), "null-since.json");
    writeFileSync(path, JSON.stringify(doc), "utf8");
    const dir = tmp();
    expect(capture(["knowledge", "render", path, "--out", dir]).code).toBe(0);
    expect(read(dir, "en")).toContain("since: unknown");
  });

  it("rejects an unsupported language, a missing --out, and an invalid rulings file", () => {
    const dir = tmp();
    expect(capture(["knowledge", "render", join(FIX, "clean.json"), "--out", dir, "--lang", "fr", "--json"]).code).toBe(1);
    expect(capture(["knowledge", "render", join(FIX, "clean.json"), "--json"]).code).toBe(1);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ schema: "rulings/1", rulings: [{ id: "x" }] }), "utf8");
    const r = capture(["knowledge", "render", bad, "--out", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_RULINGS");
  });
});
