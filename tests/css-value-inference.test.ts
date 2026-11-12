/**
 * Value inference for CSS-sourced values: a number written without its leading zero is the same number, and a
 * font-family stack is a fontFamily token. Values that are not one leaf (calc, cubic-bezier, shadows, multi-value
 * shorthands) stay unmappable and listed.
 */
import { describe, expect, it } from "vitest";
import { importFlatTokens, inferToken } from "../src/core/token-import.js";
import { ingestCssTokens } from "../src/core/css-token-ingest.js";
import { emitCss } from "../src/core/token-emit.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import type { CustomPropertyObservation } from "../src/core/designmd-token-extractor.js";

const cp = (name: string, value: string, selector = ":root"): CustomPropertyObservation => ({ name, value, sources: ["a.css:L1"], selectors: [selector] });

describe("a number without its leading zero is the same number", () => {
  it.each([
    ["ds-motion-fast", ".1s", "0.1s", "duration"],
    ["ds-motion-base", ".15s", "0.15s", "duration"],
    ["ds-motion-slow", "0.3s", "0.3s", "duration"],
    ["ds-motion-quick", "150ms", "150ms", "duration"],
    ["ds-radius", ".5rem", "0.5rem", "dimension"],
    ["ds-radius-lg", "-.25rem", "-0.25rem", "dimension"],
    ["ds-space", "0.5rem", "0.5rem", "dimension"],
  ])("%s: %s is typed %s as %s", (name, raw, value, type) => {
    expect(inferToken("", name, raw)).toEqual({ $value: value, $type: type });
  });

  it("a bare .8 is the number 0.8", () => {
    expect(inferToken("", "ds-opacity-muted", ".8")).toEqual({ $value: 0.8, $type: "number" });
  });

  it("a time value under a name that is no duration keeps being refused", () => {
    expect(inferToken("", "ds-thing", ".1s")).toEqual({ skip: 'unmappable string value ".1s"' });
  });
});

describe("a font-family stack is a fontFamily token", () => {
  it.each([
    ['"Inter", system-ui, sans-serif'],
    ['"Inter",system-ui,sans-serif'],
    ["Inter, system-ui, sans-serif"],
    ["'Segoe UI', Roboto, sans-serif"],
    ["ui-monospace, SFMono-Regular, monospace"],
    ['"Geist Mono", monospace'],
    ['-apple-system, BlinkMacSystemFont, "Segoe UI (mu)", system-ui, Roboto, sans-serif'],
    ['-apple-system, "Helvetica Neue", sans-serif'],
  ])("%s under a name with no family hint", (stack) => {
    expect(inferToken("", "ds-font-sans", stack)).toEqual({ $value: stack, $type: "fontFamily" });
  });

  it.each([
    ["breadcrumb-sep", '"/"'],
    ["quote-open", '"\\201C"'],
    ["feature-settings", '"cv02","cv03","cv11"'],
    ["grid-areas", '"header header","main side"'],
  ])("%s: the quoted strings %s are not a font stack: no family hint, no generic family", (name, value) => {
    expect(inferToken("", name, value)).toEqual({ skip: `unmappable string value "${value.slice(0, 24)}"` });
  });

  it("the CSS door lists them, as before, and ds import of a flat file skips them", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--breadcrumb-sep", '"/"'), cp("--feature-settings", '"cv02","cv03","cv11"'), cp("--grid-areas", '"header header","main side"'),
    ]);
    expect(tree).toEqual({});
    expect(unverified.map((u) => u.name)).toEqual(["--breadcrumb-sep", "--feature-settings", "--grid-areas"]);
    const flat = importFlatTokens({ layout: { "breadcrumb-sep": '"/"', "grid-areas": '"header header","main side"', "font-sans": '"Inter"' } });
    expect(flat.stats.skippedKeys.map((k) => k.key)).toEqual(["layout.breadcrumb-sep", "layout.grid-areas"]);
    expect(flat.dtcg["layout"]).toEqual({ "font-sans": { $value: '"Inter"', $type: "fontFamily" } });
  });

  it.each([
    ["ds-font-sans", '"Inter"'],
    ["ds-font-body", '"Inter", "Helvetica Neue"'],
    ["ds-x", '"Inter", sans-serif'],
    ["ds-x", '-apple-system, BlinkMacSystemFont, "Segoe UI (mu)", system-ui, sans-serif'],
  ])("%s: %s stays a font stack", (name, value) => {
    expect(inferToken("", name, value)).toEqual({ $value: value, $type: "fontFamily" });
  });

  it("the type does not depend on the name", () => {
    expect(inferToken("", "ds-x", '"Inter", system-ui, sans-serif')).toEqual({ $value: '"Inter", system-ui, sans-serif', $type: "fontFamily" });
  });

  it.each([
    ["none"], ["auto"], ["inherit"], ["flex"], ["0 0"], ["0 1px 2px #000, 0 2px 4px #111"], ["0 1px 2px rgba(0,0,0,.1)"],
    ["calc(1rem + 2px)"], ["cubic-bezier(.4,0,.2,1)"], ["var(--a, var(--b))"], ['var(--font-sans, "Inter", sans-serif)'],
    ["1px solid #000, 2px"], ["red, blue"], ["Inter"], ["-1px, monospace"], ["- , serif"], ["auto, monospace"], ["Helvetica Neue, Arial"],
  ])("%s is not a font stack and stays unmappable", (value) => {
    expect(inferToken("", "ds-thing", value)).toEqual({ skip: `unmappable string value "${value.slice(0, 24)}"` });
  });

  it("the ingest writes the stack as a fontFamily token and an alias to it follows its type", () => {
    const { tree, stats, unverified } = ingestCssTokens([
      cp("--ds-font-sans", '"Inter",system-ui,sans-serif'),
      cp("--ds-font-body", "var(--ds-font-sans)"),
    ]);
    expect(tree["font"]).toEqual({
      "ds-font-body": { $value: "{font.ds-font-sans}", $type: "fontFamily", $extensions: { "design-os.custom-property": "--ds-font-body" } },
      "ds-font-sans": { $value: '"Inter",system-ui,sans-serif', $type: "fontFamily", $extensions: { "design-os.custom-property": "--ds-font-sans" } },
    });
    expect(stats).toEqual({ primitives: 1, semantics: 1, skipped: 0 });
    expect(unverified).toEqual([]);
  });

  it("ui tokens compile --target css emits a valid font-family value from it", () => {
    const { tree } = ingestCssTokens([cp("--ds-font-sans", '"Inter",system-ui,sans-serif')]);
    const css = emitCss(resolveTokens(parseTokenFile(tree)));
    expect(css.split("\n").filter((l) => l.includes("font-sans"))).toEqual(['  --font-ds-font-sans: "Inter",system-ui,sans-serif;']);
  });
});

describe("what stays listed", () => {
  it("calc(), cubic-bezier(), a shadow and a multi-value shorthand are skipped, each named", () => {
    const { tree, stats, unverified } = ingestCssTokens([
      cp("--ds-calc", "calc(1rem + 2px)"),
      cp("--ds-ease", "cubic-bezier(.4,0,.2,1)"),
      cp("--ds-shadow", "0 1px 2px rgba(0,0,0,.1)"),
      cp("--ds-pair", "0 0"),
      cp("--ds-gap", ".5rem"),
    ]);
    expect(Object.keys(tree)).toEqual(["dimension"]);
    expect(stats.skipped).toBe(4);
    expect(unverified.map((u) => u.name).sort()).toEqual(["--ds-calc", "--ds-ease", "--ds-pair", "--ds-shadow"]);
  });
});
