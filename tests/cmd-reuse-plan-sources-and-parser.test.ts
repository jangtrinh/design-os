/**
 * `ui reuse-plan check` — rung-2 templates, pattern sources, parser silent losses, and
 * the --tokens / --file flags.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { capture, check, codes, planFile, screen, FILES, FLAT, PROJECT } from "./helpers/reuse-plan-kit.js";

const HEAD = "| Slot | Rung | Use | Reason |\n|---|---|---|---|\n";

describe("rung 2 must be a template", () => {
  it("registry with Pattern/*: a plain component at rung 2 is RUNG2_NOT_TEMPLATE", () => {
    expect(codes(check(screen(["| s | 2 | Table/Basic | — |"])).data)).toEqual(["RUNG2_NOT_TEMPLATE"]);
    expect(check(screen(["| s | 2 | Pattern/DetailPage | — |"])).code).toBe(0);
    const d = check(screen(["| s | 2 | Pattern/DetailPag | — |"])).data;
    expect(codes(d)).toEqual(["UNKNOWN_COMPONENT"]);
    expect(d.findings[0]?.message).toContain("did you mean 'Pattern/DetailPage'");
  });

  it("the rung-2 did-you-mean offers templates, never plain components", () => {
    const d = check(screen(["| s | 2 | Table/Basik | — |"])).data;
    expect(codes(d)).toEqual(["UNKNOWN_COMPONENT"]);
    expect(d.findings[0]?.message).not.toContain("Table/Basic");
  });

  it("pattern files only: a file stem passes, a registered master is not a template", () => {
    expect(check(screen(["| s | 2 | detail-page | — |"], "list-page"), FILES).code).toBe(0);
    expect(codes(check(screen(["| s | 2 | Page content / Orders · List | — |"], "list-page"), FILES).data)).toEqual(["RUNG2_NOT_TEMPLATE"]);
  });

  it("no templates anywhere: any registered name is accepted at rung 2", () => {
    expect(check(screen(["| s | 2 | Table / Row | — |"], "Page content / Orders · List"), FLAT).code).toBe(0);
  });
});

describe("Pattern line sources", () => {
  it("a design/patterns file stem resolves and the output names the source", () => {
    const r = check(screen(["| s | 3 | Table / Row | — |"], "list-page"), FILES);
    expect(r.code).toBe(0);
    expect(r.data.screens[0]).toMatchObject({ pattern: "list-page", patternSource: "design/patterns" });
    const t = capture(["reuse-plan", "check", r.file, "--dir", FILES]).out;
    expect(t).toContain("pattern: list-page (design/patterns)");
  });

  it("a registered master resolves too, as a registry source", () => {
    const r = check(screen(["| s | 3 | Table / Row | — |"], "Page content / Orders · List"), FILES);
    expect(r.code).toBe(0);
    expect(r.data.screens[0]?.patternSource).toBe("registry");
  });

  it("did-you-mean spans both sources; README is not a pattern", () => {
    const d = check(screen(["| s | 3 | Table / Row | — |"], "list-pag"), FILES).data;
    expect(codes(d)).toEqual(["UNKNOWN_PATTERN"]);
    expect(d.findings[0]?.message).toContain("did you mean 'list-page'");
    expect(codes(check(screen(["| s | 3 | Table / Row | — |"], "README"), FILES).data)).toEqual(["UNKNOWN_PATTERN"]);
    const d2 = check(screen(["| s | 3 | Table / Row | — |"], "Page content / Orders · Lst"), FILES).data;
    expect(d2.findings[0]?.message).toContain("Page content / Orders · List");
  });

  it("registry Pattern/* names still resolve as registry templates", () => {
    expect(check(screen(["| s | 3 | Table/Basic | — |"], "Pattern/DetailPage")).data.screens[0]?.patternSource).toBe("registry");
  });
});

describe("parser silent losses", () => {
  it("fences close only on the same character and at least the opening length", () => {
    const text = [
      "## Screen: A", "Pattern: Pattern/ListPage", "", HEAD + "| x | 3 | Table/Basic | — |", "",
      "````md", "```", "## Screen: Hidden", "| x | 3 | Hidden/Thing | — |", "```", "````", "",
      "~~~", "````", "## Screen: AlsoHidden", "~~~", "",
      "## Screen: Real", "Pattern: Bogus", "", HEAD + "| x | 3 | Bogus/Thing | — |", "",
    ].join("\n");
    const d = check(text).data;
    expect(d.screens.map((s) => s.name)).toEqual(["A", "Real"]);
    expect(codes(d)).toEqual(["UNKNOWN_PATTERN", "UNKNOWN_COMPONENT"]);
  });

  it("SCREEN_HEADING_MALFORMED: a heading about a screen without the Screen: form; its rows are not attributed elsewhere", () => {
    const text = screen(["| x | 3 | Table/Basic | — |"]) + "\n### Screen B\nPattern: Pattern/ListPage\n\n" + HEAD + "| y | 3 | Table/Basic | — |\n";
    const d = check(text).data;
    expect(codes(d)).toEqual(["SCREEN_HEADING_MALFORMED", "ROW_OUTSIDE_SCREEN"]);
    expect(d.screens).toHaveLength(1);
  });

  it("a heading that merely contains another word is untouched", () => {
    const d = check("# Notes on screens\n\n" + screen(["| x | 3 | Table/Basic | — |"])).data;
    expect(codes(d)).toEqual([]);
  });

  it("DUPLICATE_PATTERN: a second Pattern line in one screen", () => {
    const text = "## Screen: S\nPattern: Pattern/ListPage\nPattern: Pattern/DetailPage\n\n" + HEAD + "| x | 3 | Table/Basic | — |\n";
    const d = check(text).data;
    expect(codes(d)).toEqual(["DUPLICATE_PATTERN"]);
    expect(d.findings[0]?.line).toBe(3);
  });

  it("UNSUPPORTED_TABLE: an HTML table inside or outside a screen is reported, never skipped", () => {
    const html = "<table><tr><td>body</td><td>3</td><td>Totally/Unknown</td><td>—</td></tr></table>\n";
    expect(codes(check(screen(["| x | 3 | Table/Basic | — |"]) + "\n" + html).data)).toEqual(["UNSUPPORTED_TABLE"]);
    expect(codes(check(html + "\n" + screen(["| x | 3 | Table/Basic | — |"])).data)).toEqual(["UNSUPPORTED_TABLE"]);
  });
});

describe("--tokens and --file", () => {
  const rung6 = screen(["| g | 6 | spacing.4 | — |"], "Page content / Orders · List");

  it("--tokens overrides the default token file, and the header names the file checked", () => {
    const tokens = join(PROJECT, "design", "design.tokens.json");
    const r = check(rung6, FLAT, ["--tokens", tokens]);
    expect(r.code).toBe(0);
    expect(r.data.tokens).toBe(tokens);
    const t = capture(["reuse-plan", "check", r.file, "--dir", FLAT, "--tokens", tokens]).out;
    expect(t).toContain(`tokens: ${tokens}`);
  });

  it("the default token file is <dir>/design/design.tokens.json and is named even when unused", () => {
    const r = check(screen(["| s | 3 | Table/Basic | — |"]));
    expect(r.data.tokens).toBe(join(PROJECT, "design", "design.tokens.json"));
  });

  it("a --tokens path that does not exist is an UNRESOLVED_TOKEN finding naming it", () => {
    const d = check(rung6, FLAT, ["--tokens", join(FLAT, "nope.json")]).data;
    expect(codes(d)).toEqual(["UNRESOLVED_TOKEN"]);
    expect(d.findings[0]?.message).toContain("nope.json");
  });

  it("--file reads the same registry `ui registry lookup --file` reads", () => {
    const reg = join(PROJECT, "design", "component-registry.json");
    const file = planFile(screen(["| s | 3 | Table/Basic | — |"]));
    const r = capture(["reuse-plan", "check", file, "--dir", FLAT, "--file", reg, "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.registry).toBe(reg);
    const missing = capture(["reuse-plan", "check", file, "--file", join(FLAT, "none.json"), "--json"]);
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.out).error.code).toBe("REGISTRY_NOT_FOUND");
  });

  it("a flag without a value is BAD_ARG (exit 1)", () => {
    const file = planFile(screen(["| s | 3 | Table/Basic | — |"]));
    for (const flag of ["--tokens", "--file"]) {
      const r = capture(["reuse-plan", "check", file, "--dir", PROJECT, flag, "--json"]);
      expect(r.code, flag).toBe(1);
      expect(JSON.parse(r.out).error.code, flag).toBe("BAD_ARG");
    }
  });
});
