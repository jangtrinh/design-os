/**
 * The lint shows what the build shows (the link reports, the stale owner-ruled pairs), `--out` and `--file` stay inside
 * the project, and the screen source keeps one status per door: a Figma scan never sensed for frames stays not sensed
 * next to a code door that was read, and the `uses-component` report keeps the reason.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, codeProject, json, lint, ontologyOf, ring1Project, write } from "./ontology-helpers.js";
import type { Scan } from "./ontology-helpers.js";

const RING1_SCAN = join(process.cwd(), "tests", "fixtures", "ontology", "ring1", "ds.json");

describe("the lint prints the link reports under the coverage table", () => {
  const unresolved = (): string => {
    const p = ring1Project();
    write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings: [{ id: "R-1", text: "Use `component:Ghost` and `component:Card`.", scope: "global", category: "x", source: ["t"] }, { id: "R-2", text: "t", scope: { apps: ["nope"] }, category: "x", source: ["t"] }] }));
    expect(build(p).code).toBe(0);
    return p;
  };
  it("text: a Links section with written, unresolved, not sensed and not checked, so two unresolved references are not a bare 'consistent'", () => {
    const out = capture(["ontology", "lint", "--dir", unresolved()]).out;
    expect(out).toContain("Coverage");
    expect(out).toMatch(/Links\n(.*\n)*\s+governs\s+\d+ written · 2 unresolved/);
    expect(out).toMatch(/checked-by\s+\d+ written · \d+ unresolved · \d+ not sensed · \d+ not checked/);
    expect(out.indexOf("Links")).toBeGreaterThan(out.indexOf("Coverage"));
  });
  it("--json carries linkReports", () => {
    const reports = json(lint(unresolved()).out).data!["linkReports"] as { link: string; unresolved: number }[];
    expect(reports.find((r) => r.link === "governs")!.unresolved).toBe(2);
    expect(reports.map((r) => r.link)).toContain("uses-component");
  });
  it("the owner-ruled pairs that no candidate matches are printed too", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", "# G\n\n**Card**:\nA card.\n");
    build(p);
    expect(submit(p, [{ fingerprint: keyOf(p).find((k) => k.kind === "inferred-links")!.fingerprint, choice: "link-all" }]).code).toBe(0);
    expect(build(p).code).toBe(0);
    write(p, "CONTEXT.md", "# G\n\n**Cards**:\nA card.\n");
    build(p);
    expect(capture(["ontology", "lint", "--dir", p]).out).toContain("1 owner-ruled pair(s) no longer match a candidate");
    const defines = (json(lint(p).out).data!["linkReports"] as { link: string; details: string[] }[]).find((r) => r.link === "defines")!;
    expect(defines.details.join(" ")).toContain("term:Card→component:Card");
  });
});

describe("--out and --file stay inside the project", () => {
  it("build refuses an --out outside the project, by name, and writes nothing there", () => {
    const p = ring1Project();
    const outside = join(dirname(p), `escaped-${Date.now()}.json`);
    for (const out of [`../escaped-${Date.now()}.json`, outside, "."]) {
      const done = build(p, "--out", out);
      expect(done.code, out).toBe(1);
      expect(json(done.out).error).toMatchObject({ code: "BAD_ARG" });
      expect(json(done.out).error!.message).toContain("inside the project");
    }
    expect(existsSync(outside)).toBe(false);
  });
  it("build accepts an absolute --out that is inside the project", () => {
    const p = ring1Project();
    expect(build(p, "--out", join(p, "out", "graph.json")).code).toBe(0);
    expect(existsSync(join(p, "out", "graph.json"))).toBe(true);
  });
  it("lint --file checks a file written by --out, and refuses a path outside the project", () => {
    const p = ring1Project();
    expect(build(p, "--out", "out/graph.json").code).toBe(0);
    expect(lint(p).code).toBe(1); // the default file does not exist
    const done = lint(p, "--file", "out/graph.json");
    expect(done.code).toBe(0);
    expect(json(lint(p, "--file", "../elsewhere.json").out).error).toMatchObject({ code: "BAD_ARG" });
    expect(readFileSync(join(p, "out/graph.json"), "utf8").length).toBeGreaterThan(0);
  });
});

describe("one status per door on the screen source", () => {
  const withUnsensedFigma = (): string => {
    const p = codeProject();
    const scan = JSON.parse(readFileSync(RING1_SCAN, "utf8")) as Scan;
    delete scan.frames;
    write(p, "design/ds.json", JSON.stringify(scan));
    expect(build(p).code).toBe(0);
    return p;
  };
  it("the Figma door stays not-sensed next to a code door that was read", () => {
    const screen = ontologyOf(withUnsensedFigma()).sources.find((s) => s.kind === "screen") as unknown as { status: string; doors: { door: string; status: string }[] };
    expect(screen.doors).toMatchObject([{ door: "figma", status: "not-sensed" }, { door: "code", status: "read" }]);
  });
  it("the uses-component report keeps the reason the Figma side was never sensed", () => {
    const r = ontologyOf(withUnsensedFigma()).linkReports.find((x) => x.link === "uses-component")!;
    expect(r.notSensedReason).toContain("never sensed for frames");
  });
  it("the text prints one line per door", () => {
    const out = capture(["ontology", "build", "--dir", withUnsensedFigma()]).out;
    expect(out).toMatch(/Figma\s+not-sensed/);
    expect(out).toMatch(/code\s+read/);
  });
});
