/**
 * `ui reuse-plan check` — rung-2 templates, pattern sources, parser silent losses, and
 * the --tokens / --file flags.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { capture, check, codes, planFile, screen, BARE, FILES, FLAT, PROJECT } from "./helpers/reuse-plan-kit.js";

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

  it("pattern files: a file stem and a template-category master pass, a plain registered component does not", () => {
    expect(check(screen(["| s | 2 | detail-page | — |"], "list-page"), FILES).code).toBe(0);
    expect(check(screen(["| s | 2 | Page content / Orders · List | — |"], "list-page"), FILES).code).toBe(0);
    expect(codes(check(screen(["| s | 2 | Table / Row | — |"], "list-page"), FILES).data)).toEqual(["RUNG2_NOT_TEMPLATE"]);
  });
});

describe("one template set for the Pattern line and rung 2", () => {
  it("registry records whose category looks like a page, template, pattern, layout or screen are templates", () => {
    expect(check(screen(["| s | 2 | Page content / Orders · Detail | — |"], "Page content / Orders · List"), FLAT).code).toBe(0);
    expect(codes(check(screen(["| s | 3 | Table / Row | — |"], "Table / Row"), FLAT).data)).toEqual(["PATTERN_NOT_TEMPLATE"]);
    expect(codes(check(screen(["| s | 2 | Table / Row | — |"], "Page content / Orders · List"), FLAT).data)).toEqual(["RUNG2_NOT_TEMPLATE"]);
  });

  it("each template-like category word counts, and a Pattern/* name counts whatever its category", () => {
    for (const name of ["Orders / Detail frame", "Orders / Overview", "Orders / Wizard", "Orders / Dialog"]) {
      expect(check(screen(["| s | 3 | Table / Row | — |"], name), FLAT).code, name).toBe(0);
    }
    const r = check(screen(["| s | 2 | Pattern/WizardPage | — |"], "Pattern/WizardPage"));
    expect(r.code).toBe(0);
    expect(r.data.screens[0]?.patternSource).toBe("registry");
  });

  it("the did-you-mean offers templates only once a template set exists", () => {
    const unknown = check(screen(["| s | 3 | Table / Row | — |"], "Page content / Orders · Lis"), FLAT).data;
    expect(unknown.findings[0]?.message).toContain("Page content / Orders · List");
    const miss = check(screen(["| s | 3 | Table / Row | — |"], "Table / Rw"), FLAT).data;
    expect(miss.findings[0]?.message).not.toContain("'Table / Row'");
  });

  it("no template declared anywhere: any registered name is accepted on both, with one counted warning per run", () => {
    const two = "## Screen: A\nPattern: Orders / Summary\n\n" + HEAD + "| s | 2 | Filter / Chips | — |\n\n## Screen: B\nPattern: Table / Row\n\n" + HEAD + "| s | 3 | Table / Row | — |\n";
    const r = check(two, BARE);
    expect(r.code).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.data.warnings.map((w) => w.code)).toEqual(["NO_TEMPLATES_DECLARED"]);
    expect(r.data.warningCount).toBe(1);
    const t = capture(["reuse-plan", "check", r.file, "--dir", BARE]).out;
    expect(t).toContain("NO_TEMPLATES_DECLARED");
  });

  it("a named Pattern alone triggers the warning too", () => {
    const r = check(screen(["| s | 3 | Table / Row | — |"], "Orders / Summary"), BARE);
    expect(r.code).toBe(0);
    expect(r.data.warnings.map((w) => w.code)).toEqual(["NO_TEMPLATES_DECLARED"]);
  });

  it("rung 2 alone triggers the warning; a plan that names no template never does", () => {
    const rung2 = check(screen(["| s | 2 | Table / Row | — |"], "none — one-off dialog"), BARE);
    expect(rung2.code).toBe(0);
    expect(rung2.data.warnings.map((w) => w.code)).toEqual(["NO_TEMPLATES_DECLARED"]);
    const quiet = check(screen(["| s | 3 | Table / Row | — |"], "none — one-off dialog"), BARE);
    expect(quiet.data.warnings).toEqual([]);
  });

  it("with no template set an unknown name still has the all-names did-you-mean", () => {
    const d = check(screen(["| s | 3 | Table / Row | — |"], "Table / Rwo"), BARE).data;
    expect(codes(d)).toEqual(["UNKNOWN_PATTERN"]);
    expect(d.findings[0]?.message).toContain("Table / Row");
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

  it("a fence opener may be indented by at most 3 spaces; 4 is code, not a fence", () => {
    const tail = "\n## Screen: B\nPattern: Bogus\n\n" + HEAD + "| x | 3 | Bogus/Thing | — |\n";
    const four = check(screen(["| a | 3 | Table/Basic | — |"]) + "\n    ```" + tail).data;
    expect(four.screens.map((s) => s.name)).toEqual(["S", "B"]);
    expect(codes(four)).toEqual(["UNKNOWN_PATTERN", "UNKNOWN_COMPONENT"]);
    const three = check(screen(["| a | 3 | Table/Basic | — |"]) + "\n   ```\n   ```" + tail).data;
    expect(three.screens.map((s) => s.name)).toEqual(["S", "B"]);
    const fourClose = check(screen(["| a | 3 | Table/Basic | — |"]) + "\n```\n    ```" + tail).data;
    expect(codes(fourClose)).toEqual(["FENCE_UNCLOSED"]);
  });

  it("FENCE_UNCLOSED names the opening line, and the swallowed screen is reported rather than silently lost", () => {
    const text = screen(["| a | 3 | Table/Basic | — |"]) + "\n```\nunclosed\n\n## Screen: B\nPattern: Bogus\n\n" + HEAD + "| x | 3 | Bogus/Thing | — |\n";
    const d = check(text).data;
    expect(codes(d)).toEqual(["FENCE_UNCLOSED"]);
    expect(d.findings[0]?.line).toBe(8);
    expect(d.findings[0]?.message).toContain("line 8");
  });

  it("SCREEN_NAME_EMPTY and DUPLICATE_SCREEN", () => {
    const empty = check("## Screen:\nPattern: Pattern/ListPage\n\n" + HEAD + "| x | 3 | Table/Basic | — |\n").data;
    expect(codes(empty)).toEqual(["SCREEN_NAME_EMPTY"]);
    const one = "Pattern: Pattern/ListPage\n\n" + HEAD + "| x | 3 | Table/Basic | — |\n";
    const dup = check(`## Screen: Orders\n${one}\n## Screen:  orders \n${one}`).data;
    expect(codes(dup)).toEqual(["DUPLICATE_SCREEN"]);
    expect(dup.findings[0]?.message).toContain("line 1");
    expect(dup.findings[0]?.line).toBe(8);
    expect(codes(check(`## Screen: Orders\n${one}\n## Screen: Order detail\n${one}`).data)).toEqual([]);
  });

  it("SCREEN_HEADING_MALFORMED: a heading about a screen without the Screen: form; its rows are not attributed elsewhere", () => {
    const text = screen(["| x | 3 | Table/Basic | — |"]) + "\n### Screen B\nPattern: Pattern/ListPage\n\n" + HEAD + "| y | 3 | Table/Basic | — |\n";
    const d = check(text).data;
    expect(codes(d)).toEqual(["SCREEN_HEADING_MALFORMED", "ROW_OUTSIDE_SCREEN"]);
    expect(d.screens).toHaveLength(1);
  });

  it("a heading that merely contains the word elsewhere is untouched", () => {
    for (const title of ["# Notes on screens", "# Same screen with the mistakes an agent makes", "## Screens overview", "## The Screen-less plan"]) {
      expect(codes(check(`${title}\n\n` + screen(["| x | 3 | Table/Basic | — |"])).data), title).toEqual([]);
    }
  });

  it("a heading that starts with Screen in any other form is flagged, emphasis included", () => {
    for (const title of ["### Screen B", "## **Screen B**", "## Screen — Orders", "## screen 2", "## Screen"]) {
      expect(codes(check(`${title}\n\n` + screen(["| x | 3 | Table/Basic | — |"])).data), title).toEqual(["SCREEN_HEADING_MALFORMED"]);
    }
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
