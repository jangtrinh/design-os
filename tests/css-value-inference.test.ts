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

describe("a number without its leading zero is typed, and stored as written", () => {
  it.each([
    ["ds-motion-fast", ".1s", ".1s", "duration"],
    ["ds-motion-base", ".15s", ".15s", "duration"],
    ["ds-motion-slow", "0.3s", "0.3s", "duration"],
    ["ds-motion-quick", "150ms", "150ms", "duration"],
    ["ds-radius", ".5rem", ".5rem", "dimension"],
    ["ds-radius-lg", "-.25rem", "-.25rem", "dimension"],
    ["ds-space", "0.5rem", "0.5rem", "dimension"],
  ])("%s: %s is typed %s as %s", (name, raw, value, type) => {
    expect(inferToken("", name, raw)).toEqual({ $value: value, $type: type });
  });

  it("a flat file is imported with the bytes it has: .5rem stays .5rem", () => {
    const flat = importFlatTokens({ dimension: { radius: ".5rem", gap: "0.25rem" }, motion: { fast: ".1s" } });
    expect(flat.dtcg["dimension"]).toEqual({ radius: { $value: ".5rem", $type: "dimension" }, gap: { $value: "0.25rem", $type: "dimension" } });
    expect(flat.dtcg["motion"]).toEqual({ fast: { $value: ".1s", $type: "duration" } });
  });

  it("a bare .8 is the number 0.8", () => {
    expect(inferToken("", "ds-opacity-muted", ".8")).toEqual({ $value: 0.8, $type: "number" });
  });

  it("a time value under a name that is no duration keeps being refused", () => {
    expect(inferToken("", "ds-thing", ".1s")).toEqual({ skip: 'unmappable string value ".1s"' });
  });
});

const GENERICS = ["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji", "fangsong"];
const unmapped = (value: string): { skip: string } => ({ skip: `unmappable string value "${value.slice(0, 24)}"` });

describe("a font-family stack needs the family hint in its name, a value that fits, and positive evidence", () => {
  it.each([
    ["font-synthesis", "weight style"],
    ["font-palette", "dark"],
    ["font-display", '"swap"'],
    ["font-transform", "uppercase"],
    ["font-brand", '"Acme Sans"'],
    ["font-kerning", "normal"],
    ["font-case", "uppercase"],
    ["font-code", '"monospace"'],
    ["font-variant-emoji", "emoji"],
  ])("%s: %s has the hint but no evidence of a family list, so it is not typed", (name, value) => {
    expect(inferToken("", name, value)).toEqual(unmapped(value));
  });

  it.each([
    ["font-sans", '"Inter", sans-serif'],
    ["font-mono", "ui-monospace, Menlo, monospace"],
    ["font-family-brand", '"Acme Sans"'],
    ["brand-typeface", '"Acme Sans"'],
    ["font-sans", "SANS-SERIF"],
    ["ds-font-family", '"Inter", "Helvetica Neue"'],
  ])("%s: %s is typed (the name says family or typeface, or an unquoted generic keyword is in the list)", (name, value) => {
    expect(inferToken("", name, value)).toEqual({ $value: value, $type: "fontFamily" });
  });

  it.each(GENERICS)("the generic keyword %s is evidence on its own, under a font name, unquoted and in any case", (kw) => {
    expect(inferToken("", "font-x", `"Acme", ${kw}`)).toEqual({ $value: `"Acme", ${kw}`, $type: "fontFamily" });
    expect(inferToken("", "font-x", kw.toUpperCase())).toEqual({ $value: kw.toUpperCase(), $type: "fontFamily" });
    expect(inferToken("", "font-x", `"${kw}"`)).toEqual(unmapped(`"${kw}"`));
  });

  it("the flat import applies the same rule", () => {
    const flat = importFlatTokens({ type: {
      "font-sans": '"Inter", sans-serif', "font-family-brand": '"Acme Sans"', "font-brand": '"Acme Sans"', "font-transform": "uppercase", "font-code": '"monospace"',
    } });
    expect(Object.keys(flat.dtcg["type"] ?? {})).toEqual(["font-sans", "font-family-brand"]);
    expect(flat.stats.skippedKeys.map((k) => k.key)).toEqual(["type.font-brand", "type.font-transform", "type.font-code"]);
  });

  it("the CSS door writes the typed ones and lists the others", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--font-synthesis", "weight style"), cp("--font-palette", "dark"), cp("--font-display", '"swap"'), cp("--font-transform", "uppercase"),
      cp("--font-brand", '"Acme Sans"'), cp("--font-sans", '"Inter", sans-serif'),
    ]);
    expect(Object.keys(tree["font"] ?? {})).toEqual(["font-sans"]);
    expect(unverified.map((u) => u.name)).toEqual(["--font-synthesis", "--font-palette", "--font-display", "--font-transform", "--font-brand"]);
  });
});

describe("a font-family stack is a fontFamily token: the name decides, the value only has to fit", () => {
  it.each([
    ['"Inter", system-ui, sans-serif'],
    ['"Inter",system-ui,sans-serif'],
    ["Inter, system-ui, sans-serif"],
    ["'Segoe UI', Roboto, sans-serif"],
    ["ui-monospace, SFMono-Regular, monospace"],
    ['"Geist Mono", monospace'],
    ['-apple-system, BlinkMacSystemFont, "Segoe UI (mu)", system-ui, Roboto, sans-serif'],
  ])("%s under a name that carries a family hint and a generic keyword", (stack) => {
    expect(inferToken("", "ds-font-sans", stack)).toEqual({ $value: stack, $type: "fontFamily" });
  });

  it("the real names of the app all carry a hint and are typed", () => {
    for (const name of ["mu-font-sans", "font-sans", "font-mu-mono", "mu-font-display"]) {
      expect(inferToken("", name, 'ui-monospace, "SF Mono", Menlo, monospace')).toEqual({ $value: 'ui-monospace, "SF Mono", Menlo, monospace', $type: "fontFamily" });
    }
  });

  it.each([
    ["breadcrumb-sep", '"/"'],
    ["quote-open", '"\\201C"'],
    ["feature-settings", '"cv02","cv03","cv11"'],
    ["grid-areas", '"header header","main side"'],
    ["display-mode", "math"],
    ["emoji-style", "emoji"],
    ["ds-x", '"Inter", sans-serif'],
    ["ds-x", '-apple-system, BlinkMacSystemFont, "Segoe UI (mu)", system-ui, sans-serif'],
    ["ds-x", '"Inter"'],
    ["ds-x", "serif"],
  ])("%s: %s has no family hint in its name, so it is not typed", (name, value) => {
    expect(inferToken("", name, value)).toEqual({ skip: `unmappable string value "${value.slice(0, 24)}"` });
  });

  it.each([
    ["font-icon-close", '"\\2715"'],
    ["icon-font-glyph", '"\\e900"'],
    ["font-sep", '"/"'],
    ["font-feature-settings", '"cv02","cv11"'],
    ["font-variation-settings", '"wght" 400'],
    ["font-size-name", '"cv02","cv11"'],
    ["font-x", "auto, monospace"],
    ["font-display", "swap"],
  ])("%s: %s carries a hint but the value does not fit (escape, no letter, a feature or keyword), so it is not typed", (name, value) => {
    expect(inferToken("", name, value)).toEqual({ skip: `unmappable string value "${value.slice(0, 24)}"` });
  });

  it("the CSS door lists them, as before, and ds import of a flat file skips them", () => {
    const { tree, unverified } = ingestCssTokens([
      cp("--breadcrumb-sep", '"/"'), cp("--feature-settings", '"cv02","cv03","cv11"'), cp("--grid-areas", '"header header","main side"'),
      cp("--display-mode", "math"), cp("--emoji-style", "emoji"), cp("--font-icon-close", '"\\2715"'), cp("--icon-font-glyph", '"\\e900"'),
      cp("--font-feature-settings", '"cv02","cv11"'),
    ]);
    expect(tree).toEqual({});
    expect(unverified.map((u) => u.name)).toEqual([
      "--breadcrumb-sep", "--feature-settings", "--grid-areas", "--display-mode", "--emoji-style", "--font-icon-close", "--icon-font-glyph", "--font-feature-settings",
    ]);
    const flat = importFlatTokens({ layout: { "breadcrumb-sep": '"/"', "grid-areas": '"header header","main side"', "font-sans": '"Inter", sans-serif', "emoji-style": "emoji" } });
    expect(flat.stats.skippedKeys.map((k) => k.key)).toEqual(["layout.breadcrumb-sep", "layout.grid-areas", "layout.emoji-style"]);
    expect(flat.dtcg["layout"]).toEqual({ "font-sans": { $value: '"Inter", sans-serif', $type: "fontFamily" } });
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
