/**
 * `classifySelector` — the selector shapes a packaged, minified token sheet uses for its base and its themes,
 * and the selectors that must stay unmapped so a component's local variables are never promoted to tokens.
 */
import { describe, expect, it } from "vitest";
import { classifySelector } from "../src/core/css-selector-mode.js";

const BASE = { kind: "base" };
const UNMAPPED = { kind: "unmapped" };
const modes = (...names: string[]): unknown => ({ kind: "modes", names });

describe("base selectors", () => {
  it.each([":root", "html", "body", ":host", "@theme", "@theme inline", "@theme static"])("%s is the base", (s) => {
    expect(classifySelector(s)).toEqual(BASE);
  });

  it.each([
    ":where(:root)",
    ":where(:root,:host)",
    ":is(:root, :host)",
    ":where(:root,:host,.ds-root:not([data-theme] *))",
  ])("the wrapper %s is classified by its inner list: base", (s) => {
    expect(classifySelector(s)).toEqual(BASE);
  });

  it("a top-level list whose first member is a base wrapper and whose second is a theme is the base", () => {
    expect(classifySelector(":where(:root,:host,.x-root:not([data-theme] *)),[data-theme=light]")).toEqual(BASE);
  });
});

describe("mode selectors", () => {
  it.each([
    ['.dark', "dark"],
    ['[data-theme="paper"]', "paper"],
    ["[data-theme='paper']", "paper"],
    ["[data-theme=paper]", "paper"],
    ["[data-theme=dark]", "dark"],
    ["@media (prefers-color-scheme: dark)", "dark"],
  ])("%s is mode %s", (s, name) => {
    expect(classifySelector(s)).toEqual(modes(name));
  });

  it.each([
    [':root[data-theme="dark"]', "dark"],
    [":root[data-theme=dark]", "dark"],
    ["html.dark", "dark"],
    [":root.dark", "dark"],
    ["html[data-theme=dark]", "dark"],
    ["html[data-theme='paper']", "paper"],
  ])("the compound %s of one base selector and one theme qualifier is mode %s", (s, name) => {
    expect(classifySelector(s)).toEqual(modes(name));
  });

  it("a wrapper holding only themes yields those modes", () => {
    expect(classifySelector(":where([data-theme=dark],.dark)")).toEqual(modes("dark"));
    expect(classifySelector(":is([data-theme=light], [data-theme=paper])")).toEqual(modes("light", "paper"));
  });

  it("a list of modes yields every mode, in order, once", () => {
    expect(classifySelector('[data-theme="dark"], [data-theme="classic"], .dark')).toEqual(modes("dark", "classic"));
  });

  it("a comma inside parentheses does not split the list", () => {
    // `:where(.a,[data-theme=dark])` is ONE functional selector: its inner list holds a mode and a component class.
    expect(classifySelector(":where([data-theme=dark],.card)")).toEqual(modes("dark"));
    expect(classifySelector("[data-theme=dark],:not(.a,.b)")).toEqual(modes("dark"));
  });
});

describe("base wins over modes in one list", () => {
  it("a base member beats a mode member", () => {
    expect(classifySelector(":root, .dark")).toEqual(BASE);
    expect(classifySelector("[data-theme=dark], :root")).toEqual(BASE);
  });
});

describe("selectors that stay unmapped", () => {
  it.each([
    ".card",
    ".ds-s-xs",
    ".dark .card",
    ":root .card",
    ":where(.card)",
    "[data-state=open]",
    ":host(.x)",
    "",
    ":where()",
    ".x-root:not([data-theme] *)",
    ":root .dark",
    "html [data-theme=dark]",
    ":root > [data-theme=dark]",
    ":where(:root) :is(.card)",
    ":where(:root):not(.card)",
    ":where(.dark) :is(.x)",
    ":where(:root) > :is(.card)",
    ":is(:root).card",
  ])("%j is unmapped", (s) => {
    expect(classifySelector(s)).toEqual(UNMAPPED);
  });

  it("a component class beside a base is still listed by the caller as part of a base list", () => {
    // The list holds a base member, so the declaration applies to the base; the component class adds nothing.
    expect(classifySelector(":root, .card")).toEqual(BASE);
  });
});
