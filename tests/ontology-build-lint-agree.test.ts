/**
 * Build and lint name the same facts, and a next action is printed only when it succeeds as printed: a graph error and
 * open questions are both named by both commands; the lint's action for questions only `ui ontology build` raises is
 * `ui ontology build`; a project with no app root is not told to answer a question that does not exist.
 */
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { WORKSPACE_TWO_APPS, projectFrom } from "./ds-surface-helpers.js";
import { build, editRegistry, json, lint, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const termProject = (): string => { const p = ring1Project(); write(p, "CONTEXT.md", "# G\n\n**Card**:\nA card.\n"); return p; };
const findings = (p: string): { code: string; message: string }[] => json(lint(p).out).data!["findings"];
const pending = (p: string): string => capture(["onboard", "questions", "--format", "claude", "--cwd", p]).out;

describe("a graph error and open questions together", () => {
  const both = (): string => { const p = termProject(); editRegistry(p, (r) => { r.components.push({ ...r.components[0]! }); }); return p; };
  it("the build names the graph error and says how many questions are open, writing nothing", () => {
    const p = both();
    const before = hashTree(p);
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_DUPLICATE_ID");
    expect(json(done.out).error!.message).toMatch(/1 cluster\(s\) also await an owner ruling \(inferred-links\)/);
    expect(hashTree(p)).toBe(before);
  });
  it("the lint names both facts", () => {
    const codes = findings(both()).map((f) => f.code);
    expect(codes).toContain("ONTOLOGY_DUPLICATE_ID");
    expect(codes).toContain("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
  });
});

describe("the next action of the lint works as printed", () => {
  it("questions only the build raises: the lint says to run ui ontology build, and that command then lists them", () => {
    const p = termProject();
    const blocked = findings(p).find((f) => f.code === "ONBOARD_BLOCKED_NEEDS_OWNER_RULING")!;
    expect(blocked.message).toContain("run ui ontology build: it raises the questions and writes nothing until they are answered");
    expect(pending(p)).not.toContain("inferred-links"); // what the old action found: nothing
    expect(build(p).code).toBe(1);
    expect(pending(p)).toContain("inferred-links");
  });
  it("while blocked, a missing file is not cured by 'ui ontology build' alone: the questions come first", () => {
    const stale = findings(termProject()).find((f) => f.code === "ONTOLOGY_STALE")!;
    expect(stale.message).toContain("answer the open questions first");
  });
  it("questions that ui onboard questions already lists: the lint names that command, and it lists them", () => {
    const p = projectFrom(WORKSPACE_TWO_APPS);
    const blocked = findings(p).find((f) => f.code === "ONBOARD_BLOCKED_NEEDS_OWNER_RULING")!;
    expect(blocked.message).toContain("ui onboard questions --format claude");
    expect(blocked.message).not.toContain("run ui ontology build");
    expect(pending(p)).toContain("app-roots");
  });
});

describe("a project with no app root", () => {
  it("is told so, in the file and on the screen, and not told to answer an app-roots question", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    const note = JSON.stringify(ontologyOf(p).sources.find((s) => s.kind === "screen"));
    expect(note).toContain("no app root found; the code door is not read");
    expect(note).not.toContain("app-roots question");
    expect(pending(p)).not.toContain("app-roots");
  });
  it("two nested app roots keep the action, and it lists the question", () => {
    const p = projectFrom(WORKSPACE_TWO_APPS);
    const note = (json(build(p).out).data!["wouldWrite"].sources as { kind: string; note: string }[]).find((s) => s.kind === "screen")!.note;
    expect(note).toContain("ui onboard questions --format claude");
    expect(pending(p)).toContain("app-roots");
  });
});
