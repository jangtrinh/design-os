/**
 * An empty result is not a success: a non-empty input that yields zero tokens exits 1 with its own code, writes nothing
 * and names the next action; a successful run carries a ledger whose sum equals the input count, and no alias is
 * written pointing at a property that was left out.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestCssTokens } from "../src/core/css-token-ingest.js";
import type { CustomPropertyObservation } from "../src/core/designmd-token-extractor.js";
import { capture } from "./owner-rulings-helpers.js";
import { DIST_CLI, runBuilt, writeSheets } from "./css-door-packaged-theme-fixture.js";

const cp = (name: string, value: string, selector: string, source = "a.css:L1"): CustomPropertyObservation => ({ name, value, sources: [source], selectors: [selector] });
const scratch = (): string => mkdtempSync(join(tmpdir(), "ease-css-door-ledger-"));
const extractFileOf = (dir: string, customProperties: CustomPropertyObservation[]): string => {
  const p = join(dir, "t.json");
  writeFileSync(p, JSON.stringify({ colors: [], fonts: [], customProperties }), "utf8");
  return p;
};
type Env = { ok: boolean; command: string; error?: { code: string; message: string }; data?: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const parse = (out: string): Env => JSON.parse(out) as Env;

describe("the ledger of the ingest", () => {
  it("accounts for every input property exactly once: written as a primitive or an alias, or left out for one named reason", () => {
    const { ledger, stats } = ingestCssTokens([
      cp("--a", "#111", ":root"),
      cp("--b", "var(--a)", ":root"),
      cp("--c", "calc(1rem + 2px)", ":root"),
      cp("--d", "#222", ".card"),
      cp("--e", "#333", "[data-theme=dark]"),
      cp("--f", "var(--missing)", ":root"),
      cp("--g", "var(--e)", ":root"),
      cp("--a", "#000", "[data-theme=dark]"),
    ]);
    expect(ledger).toEqual({
      properties: 7,
      declarations: 8,
      written: { primitives: 1, semantics: 1 },
      leftOut: {
        "value is not one typed leaf (calc, a shadow, an easing, a multi-value shorthand)": 1,
        "declared only under unrecognised selectors": 1,
        "declared only under a theme or mode, so it has no base value": 1,
        "alias names a property that is not in the input": 1,
        "alias names a property that was left out": 1,
      },
    });
    expect(ledger.written.primitives + ledger.written.semantics + Object.values(ledger.leftOut).reduce((a, b) => a + b, 0)).toBe(ledger.properties);
    expect(stats).toEqual({ primitives: 1, semantics: 1, skipped: 5 });
  });

  it("writes no alias that points at a property that was left out, and lists it", () => {
    const { tree, unverified } = ingestCssTokens([cp("--e", "#333", "[data-theme=dark]"), cp("--g", "var(--e)", ":root")]);
    expect(tree).toEqual({});
    expect(unverified.filter((u) => u.name === "--g")).toEqual([{ name: "--g", reason: "alias names '--e', which was left out" }]);
  });

  it("an alias in a mode that names a property left out drops that mode value only, and says so", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--base", "#111", ":root"),
      cp("--gone", "#333", ".card"),
      cp("--x", "#fff", ":root"),
      cp("--x", "var(--gone)", "[data-theme=dark]"),
    ]);
    expect(tree["color"]?.["x"]).toEqual({ $value: "#fff", $type: "color", $extensions: { "design-os.custom-property": "--x" } });
    expect(unverified.filter((u) => u.name === "--x")).toEqual([{ name: "--x", reason: "mode 'dark' not written: it names '--gone', which was left out" }]);
  });

  it("an input without custom properties is an empty ledger, not an error", () => {
    const dir = scratch();
    const r = capture(["ingest-css-ds", extractFileOf(dir, []), "--out", join(dir, "o"), "--json"]);
    expect(r.code).toBe(0);
    expect(parse(r.out).data?.["ledger"]).toEqual({ properties: 0, declarations: 0, written: { primitives: 0, semantics: 0 }, leftOut: {} });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("zero tokens from a non-empty input", () => {
  const selectors = [".card", ".card-body", ".btn", ".nav", ".tab", ".modal", ".chip"];
  const props = (): CustomPropertyObservation[] =>
    selectors.flatMap((sel, i) => Array.from({ length: 7 - i }, (_, k) => cp(`--${sel.slice(1)}-${k}`, `${k + 1}px`, sel)));

  it("exits 1 with its own code, writes no tokens.json, and names the five largest unrecognised selectors with their counts", () => {
    const dir = scratch();
    const out = join(dir, "o");
    const r = capture(["ingest-css-ds", extractFileOf(dir, props()), "--out", out, "--json"]);
    expect(r.code).toBe(1);
    const env = parse(r.out);
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("NO_TOKENS_WRITTEN");
    expect(existsSync(join(out, "tokens.json"))).toBe(false);
    expect(existsSync(out)).toBe(false);
    expect(env.error?.message).toBe(
      "no token was written from 28 custom properties. Selectors not recognised, by declarations: '.card' (7), '.card-body' (6), '.btn' (5), '.nav' (4), '.tab' (3). " +
        "The base selector of the theme is among them, or the wrong CSS files were passed.",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("in text mode the same message goes to stderr and the exit code is 1", () => {
    const dir = scratch();
    const r = capture(["ingest-css-ds", extractFileOf(dir, [cp("--a", "1px", ".card"), cp("--b", "2px", ".card")]), "--out", join(dir, "o")]);
    expect(r.code).toBe(1);
    expect(r.err).toBe(
      "ui: no token was written from 2 custom properties. Selectors not recognised, by declarations: '.card' (2). " +
        "The base selector of the theme is among them, or the wrong CSS files were passed.\n",
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("with nothing but theme-only declarations it still fails, and names no selector it did not fail to recognise", () => {
    const dir = scratch();
    const r = capture(["ingest-css-ds", extractFileOf(dir, [cp("--a", "#111", "[data-theme=dark]")]), "--out", join(dir, "o"), "--json"]);
    expect(r.code).toBe(1);
    expect(parse(r.out).error?.message).toBe(
      "no token was written from 1 custom property. Every declaration sits under a theme or mode selector: no base selector (:root, :host, html, @theme) was found, " +
        "so the CSS file that holds it was not passed, or the wrong files were passed.",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

const built = existsSync(DIST_CLI);
let root = "";
beforeAll(() => { root = scratch(); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(!built)("the built CLI on a packaged theme (ledger and the empty result)", () => {
  it("a successful run carries a ledger whose sum equals the input count", () => {
    const { html, css } = writeSheets(join(root, "sheets"));
    const extractFile = join(root, "t.json");
    expect(runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root).code).toBe(0);
    const entries = (JSON.parse(readFileSync(extractFile, "utf8")) as { customProperties: unknown[] }).customProperties.length;
    const r = runBuilt(["ingest-css-ds", extractFile, "--out", join(root, "out"), "--json"], root);
    expect(r.code).toBe(0);
    const ledger = parse(r.out).data?.["ledger"];
    expect(ledger).toEqual({
      properties: 17,
      declarations: entries,
      written: { primitives: 7, semantics: 4 },
      leftOut: {
        "value is not one typed leaf (calc, a shadow, an easing, a multi-value shorthand)": 2,
        "declared only under unrecognised selectors": 3,
        "alias names a property that is not in the input": 1,
      },
    });
    // surface x3 and text x3 (base, dark, paper), seven single ones, three component-local, five aliases
    expect(entries).toBe(21);
  });

  it("the text output prints the ledger line", () => {
    const { html, css } = writeSheets(join(root, "text-sheets"));
    const extractFile = join(root, "text.json");
    expect(runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root).code).toBe(0);
    const r = runBuilt(["ingest-css-ds", extractFile, "--out", join(root, "text-out")], root);
    expect(r.code).toBe(0);
    expect(r.out.split("\n").find((l) => l.startsWith("  ledger:"))).toBe(
      "  ledger: 17 properties in = 7 primitive(s) + 4 semantic(s) + 1 left out (alias names a property that is not in the input) + 3 left out (declared only under unrecognised selectors) + " +
        "2 left out (value is not one typed leaf (calc, a shadow, an easing, a multi-value shorthand))",
    );
  });

  it("only the component sheet of the package: exit 1, nothing written, the selectors named", () => {
    const only = ".ds-card{--ds-card-pad:1rem;--ds-card-gap:.5rem}.ds-s-xs{--ds-local-size:12px}";
    const { html, css } = writeSheets(join(root, "only"), { "components.css": only });
    const extractFile = join(root, "only.json");
    expect(runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root).code).toBe(0);
    const out = join(root, "only-out");
    const r = runBuilt(["ingest-css-ds", extractFile, "--out", out, "--json"], root);
    expect(r.code).toBe(1);
    const env = parse(r.out);
    expect(env.error?.code).toBe("NO_TOKENS_WRITTEN");
    expect(env.error?.message).toContain("'.ds-card' (2), '.ds-s-xs' (1)");
    expect(existsSync(join(out, "tokens.json"))).toBe(false);
  });
});
