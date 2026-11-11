/**
 * Small guards: `--out` / `--file` stay inside the project through symbolic links, `..x.json` is a file name, a refusal
 * never prints the absolute project path, a directory is refused before anything is written; the Figma bridge reason
 * covers every provenance another door wrote; feature ids cannot collide; and the screens-meta / ruling guards.
 */
import { existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, codeProject, editRegistry, json, lint, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const scratch = (): string => mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-paths-"));
const meta = (p: string, screens: Record<string, unknown>): void => write(p, "design/knowledge/screens.meta.json", JSON.stringify({ schema: "screens-meta/1", at: 1, screens, unassigned: [] }));

describe("--out and --file", () => {
  it("a symbolic link inside the project that points outside is refused for both", () => {
    const p = ring1Project();
    const outside = scratch();
    symlinkSync(outside, join(p, "design", "out-link"));
    for (const [flag, run] of [["out", build], ["file", lint]] as const) {
      const done = run(p, `--${flag}`, "design/out-link/o.json");
      expect(done.code, flag).toBe(1);
      expect(json(done.out).error).toMatchObject({ code: "BAD_ARG" });
    }
    expect(existsSync(join(outside, "o.json"))).toBe(false);
  });
  it("a file whose name starts with two dots is inside the project", () => {
    const p = ring1Project();
    expect(build(p, "--out", "..x.json").code).toBe(0);
    expect(existsSync(join(p, "..x.json"))).toBe(true);
    expect(lint(p, "--file", "..x.json").code).toBe(0);
  });
  it("the refusal prints the path as given and never the absolute project path", () => {
    const p = ring1Project();
    const done = build(p, "--out", "../escape.json");
    expect(json(done.out).error!.message).toContain("'../escape.json'");
    expect(done.out).not.toContain(p);
    expect(lint(p, "--file", "../escape.json").out).not.toContain(p);
  });
  it("--out naming a directory is refused before anything is written, leaving no temporary file", () => {
    const p = ring1Project();
    const done = build(p, "--out", "design");
    expect(done.code).toBe(1);
    expect(json(done.out).error!.message).toContain("must be a file");
    expect(existsSync(join(p, "design.tmp"))).toBe(false);
    expect(existsSync(join(p, "design", "knowledge", "ontology.json"))).toBe(false);
  });
});

describe("the Figma bridge reason covers every provenance another door wrote", () => {
  it("a synthetic-approved record never ties either, and the line says another door wrote it", () => {
    const p = ring1Project();
    editRegistry(p, (r) => { r.components.find((c) => c["name"] === "Card")!["provenance"] = { kind: "synthetic-approved", sourceRef: "x", sha256: "c".repeat(64), reason: "approved by the owner" }; });
    expect(build(p).code).toBe(0);
    const r = ontologyOf(p).linkReports.find((x) => x.link === "uses-component")!;
    expect(ontologyOf(p).links.some((l) => l.kind === "uses-component" && l.to === "component:Card")).toBe(false);
    expect(r.details.join(" ")).toContain("match only a record another door wrote");
  });
});

describe("feature ids cannot collide", () => {
  it("(a/b, c) and (a, b/c) are two nodes, with % and / encoded inside each part", () => {
    const p = ring1Project();
    meta(p, { x: { app: "a/b", feature: "c", figmaId: "5:1" }, y: { app: "a", feature: "b/c", figmaId: "5:2" }, z: { app: "100%", feature: "plain", figmaId: "none" } });
    expect(build(p).code).toBe(0);
    const ids = ontologyOf(p).nodes.filter((n) => n.kind === "feature").map((n) => n.id);
    expect(ids).toEqual(["feature:100%25/plain", "feature:a%2Fb/c", "feature:a/b%2Fc"]);
    const links = ontologyOf(p).links.filter((l) => l.kind === "belongs-to").map((l) => `${l.from}>${l.to}`);
    expect(links).toContain("screen:5:1>feature:a%2Fb/c");
    expect(links).toContain("screen:5:2>feature:a/b%2Fc");
  });
  it("a name without those characters keeps its id", () => {
    const p = ring1Project();
    meta(p, { x: { app: "web", feature: "checkout", figmaId: "5:1" } });
    build(p);
    expect(ontologyOf(p).nodes.map((n) => n.id)).toContain("feature:web/checkout");
  });
});

describe("guards that had no test", () => {
  it("a screens-meta entry never ties to a screen of the code door, even when its figmaId is that screen's id", () => {
    const p = codeProject();
    meta(p, { x: { app: "web", feature: "home", figmaId: "src/pages/home.tsx" } });
    expect(build(p).code).toBe(0);
    const o = ontologyOf(p);
    expect(o.nodes.some((n) => n.id === "screen:src/pages/home.tsx")).toBe(true);
    expect(o.links.some((l) => l.kind === "belongs-to" && l.from === "screen:src/pages/home.tsx")).toBe(false);
    expect(o.linkReports.find((r) => r.link === "belongs-to")!.unresolved).toBe(1);
  });
  it("a ruling with no scope is counted, with its reason, in the ruling source", () => {
    const p = ring1Project();
    write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings: [{ id: "R-1", text: "t" }] }));
    build(p);
    expect((ontologyOf(p).sources.find((s) => s.kind === "ruling") as unknown as { leftOut: Record<string, number> }).leftOut).toEqual({ "scope: ruling with no scope": 1 });
  });
});
