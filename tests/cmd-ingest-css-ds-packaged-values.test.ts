/**
 * The code door on a packaged theme, values: `.1s` and `.5rem` are typed, a font stack is a fontFamily token that
 * `ui tokens compile --target css` emits as a valid `font-family` value, and the values that are not one leaf
 * (shadow, easing) stay listed. Goes through the built CLI.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DIST_CLI, runBuilt, writeSheets } from "./css-door-packaged-theme-fixture.js";

const built = existsSync(DIST_CLI);
let root = "";
let tokensFile = "";
let unverified: { name: string; reason: string }[] = [];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ease-css-door-values-"));
  if (!built) return;
  const { html, css } = writeSheets(join(root, "sheets"));
  const extractFile = join(root, "t.json");
  const e = runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root);
  if (e.code !== 0) throw new Error(`extract-tokens failed: ${e.err}${e.out}`);
  const r = runBuilt(["ingest-css-ds", extractFile, "--out", join(root, "out"), "--json"], root);
  const env = JSON.parse(r.out) as { data: { tokens: string; unverified: { name: string; reason: string }[] } };
  tokensFile = env.data.tokens;
  unverified = env.data.unverified;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

const read = (): Record<string, Record<string, { $value: unknown; $type: string }>> => JSON.parse(readFileSync(tokensFile, "utf8"));

describe.skipIf(!built)("ui ingest-css-ds values on a packaged theme (built CLI)", () => {
  it("types .1s, .15s as durations and .5rem as a dimension, with the leading zero written out", () => {
    const t = read();
    expect(t["duration"]?.["ds-motion-fast"]).toEqual({ $value: "0.1s", $type: "duration" });
    expect(t["duration"]?.["ds-motion-base"]).toEqual({ $value: "0.15s", $type: "duration" });
    expect(t["dimension"]?.["ds-radius"]).toEqual({ $value: "0.5rem", $type: "dimension" });
  });

  it("writes the font stack as a fontFamily token and types the alias to it as a fontFamily", () => {
    const t = read();
    expect(t["font"]?.["ds-font-sans"]).toEqual({ $value: '"Inter",system-ui,sans-serif', $type: "fontFamily" });
    expect(t["font"]?.["font-sans"]).toEqual({ $value: "{font.ds-font-sans}", $type: "fontFamily" });
    expect(t["color"]?.["font-sans"]).toBeUndefined();
  });

  it("compiles the font stack to a valid font-family declaration", () => {
    const r = runBuilt(["tokens", "compile", tokensFile], root);
    expect(r.code).toBe(0);
    const decls = r.out.split("\n").filter((l) => /font-sans:/.test(l));
    expect(decls.length).toBe(2);
    for (const d of decls) expect(d).toMatch(/^ {2}--[a-z-]+: (?:"Inter",system-ui,sans-serif|var\(.+\));$|^ {2}--[a-z-]+: "Inter",system-ui,sans-serif;$/);
  });

  it("still lists the shadow and the easing, each with its value", () => {
    const named = unverified.filter((u) => u.name === "--ds-shadow" || u.name === "--ds-ease");
    expect(named).toEqual([
      { name: "--ds-ease", reason: "unmappable value on every declaration (e.g. 'cubic-bezier(.4,0,.2,1)')" },
      { name: "--ds-shadow", reason: "unmappable value on every declaration (e.g. '0 1px 2px rgba(0,0,0,.1)')" },
    ]);
  });
});
