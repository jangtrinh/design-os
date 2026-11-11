/**
 * Guards that had no test, and next actions that are proven by running them. The `checked-by` row is proven by the gate
 * that really reads the rule source, not by matching source text; a refusal names both ways out with one full stop; the
 * ingest command a note prints is run as printed and puts its outputs where it says.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdherenceRules } from "../src/core/adherence-rules.js";
import { runGate } from "../src/core/gate.js";
import { CHECKED_BY } from "../src/core/ontology/gate-table.js";
import { usesComponentLinks } from "../src/core/ontology/link-uses-component.js";
import { capture } from "./owner-rulings-helpers.js";
import { answerScreenPages, build, json, must, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const DIST_CLI = join(process.cwd(), "dist", "cli.js");
const RING1_SCAN = join(process.cwd(), "tests", "fixtures", "ontology", "ring1", "ds.json");
const sourceNote = (p: string, kind: string): string => ontologyOf(p).sources.find((s) => s.kind === kind)!.note;

describe("a checked-by row is proven against the gate that reads the rule source", () => {
  it("a promoted token-ban rule is evaluated by the ds-usage family and by no other; the table names that family", () => {
    const p = ring1Project();
    const rules = loadAdherenceRules(join(p, "design")).binding.map((b) => b.rule);
    expect(rules.length).toBeGreaterThan(0);
    const banned = rules[0]!.tokens[0]!;
    const html = `<html><body><div style="background: ${banned}">x</div></body></html>`;
    const result = runGate(html, { dsUsage: { rules } });
    const hit = (family: string): string[] => (result.families[family as "ds-usage"]?.findings ?? []).map((f) => f.checkId).filter((id) => id.startsWith("token-ban/"));
    expect(hit("ds-usage")).toContain(`token-ban/${rules[0]!.id}`);
    for (const other of Object.keys(result.families).filter((f) => f !== "ds-usage")) expect(hit(other), other).toEqual([]);
    expect(CHECKED_BY.find((r) => r.kind === rules[0]!.kind)).toMatchObject({ origin: "adherence", family: "ds-usage" });
    expect(ontologyBuilt(p).links.filter((l) => l.kind === "checked-by").map((l) => `${l.from}>${l.to}`)).toContain(`rule:adherence:${rules[0]!.id}>gate:ds-usage`);
  });
  it("a gate run without the promoted rule finds nothing for it: the family reads the rule file, not a label", () => {
    const rules = loadAdherenceRules(join(ring1Project(), "design")).binding.map((b) => b.rule);
    const html = `<html><body><div style="background: ${rules[0]!.tokens[0]!}">x</div></body></html>`;
    expect((runGate(html, { dsUsage: { rules: [] } }).families["ds-usage"]?.findings ?? []).map((f) => f.checkId)).not.toContain(`token-ban/${rules[0]!.id}`);
  });
});
const ontologyBuilt = (p: string): ReturnType<typeof ontologyOf> => { expect(build(p).code).toBe(0); return ontologyOf(p); };

describe("guards the first review found green", () => {
  it("a ruling without an id or text is counted in the source line and is not a node", () => {
    const p = ring1Project();
    write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings: [{ id: "R-1", text: "ok", scope: "global" }, { id: "R-2", scope: "global" }, { text: "no id", scope: "global" }, "text"] }));
    expect(build(p).code).toBe(0);
    expect(sourceNote(p, "ruling")).toContain("1 read; 3 without id or text left out and counted");
    expect(ontologyOf(p).nodes.filter((n) => n.kind === "ruling").map((n) => n.id)).toEqual(["ruling:R-1"]);
  });
  it("a screens-meta entry without an app contributes no app or feature node and is counted", () => {
    const p = ring1Project();
    write(p, "design/knowledge/screens.meta.json", JSON.stringify({ schema: "screens-meta/1", at: 1, screens: { a: { name: "A", feature: "orphaned", figmaId: "5:1" }, b: { name: "B", app: "web", figmaId: "5:2" } }, unassigned: [] }));
    expect(build(p).code).toBe(0);
    const ids = ontologyOf(p).nodes.map((n) => n.id);
    expect(ids).toContain("app:web");
    expect(ids.filter((id) => id.startsWith("app:") || id.startsWith("feature:"))).toEqual(["app:web"]);
    expect(sourceNote(p, "app")).toContain("1 without an app left out and counted");
  });
  it("code door: a name two files declare is never resolved to the first: no link, counted with its files", () => {
    const records = [{ name: "Card", category: "c", markup: "", tokensUsed: [], code: { sourceRef: "src/a/Card.tsx:1-3", sha256: "a" } }];
    const code = {
      screens: [{ file: "src/pages/home.tsx", components: ["Card"] }],
      components: [{ name: "Card", file: "src/a/Card.tsx", startLine: 1, endLine: 3 }, { name: "Card", file: "src/b/Card.tsx", startLine: 1, endLine: 3 }],
    };
    const out = usesComponentLinks(null, code as never, records as never, new Set(), undefined);
    expect(out.links).toEqual([]);
    expect(out.report.unresolved).toBe(1);
    expect(out.report.details.join(" ")).toContain("Card (declared in 2 files)");
    const single = usesComponentLinks(null, { ...code, components: [code.components[0]] } as never, records as never, new Set(), undefined);
    expect(single.links).toEqual([{ kind: "uses-component", from: "screen:src/pages/home.tsx", to: "component:Card" }]);
  });
});

describe("a refusal names both ways out, with one full stop", () => {
  it("a sealed store that drifted: restore the file, or adopt the change with ui ds reseal --apply --reason", () => {
    const p = ring1Project();
    const registry = JSON.parse(readFileSync(join(p, "design/component-registry.json"), "utf8")) as { components: { description: string }[] };
    registry.components[0]!.description += " edited by hand";
    write(p, "design/component-registry.json", JSON.stringify(registry));
    const done = build(p);
    expect(done.code).toBe(1);
    const err = json(done.out).error!;
    expect(err.code).toBe("DS_TAMPERED");
    expect(err.message).not.toMatch(/\.\s*\./);
    expect(err.message).toContain("restore the file, or adopt the change with ui ds reseal --apply --reason");
  });
});

describe("the ingest command a note prints is the one that works", () => {
  it("run as printed in the project, it raises the page question, and after the answer writes its bundle where the note says, not in the project root", () => {
    expect(existsSync(DIST_CLI), "run npm run build first: this test drives the built binary with a real cwd").toBe(true);
    const p = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-ingest-"));
    mkdirSync(join(p, "design"), { recursive: true });
    cpSync(RING1_SCAN, join(p, "design", "ds.json"));
    expect(build(p).code).toBe(0);
    const note = ontologyOf(p).sources.find((s) => s.kind === "screen")!.note;
    const printed = /: (ui ingest-figma-ds [^;]+?) raises the question/.exec(note)?.[1];
    expect(printed, note).toBeDefined();
    const args = printed!.split(" ").slice(1);
    const ui = (extra: string[]): ReturnType<typeof spawnSync> => spawnSync("node", [DIST_CLI, ...args, ...extra], { cwd: p, encoding: "utf8" });
    const first = ui(["--json"]);
    expect(first.status).toBe(1);
    expect(String(first.stdout)).toContain("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    answerScreenPages(p, ["0:2"], ["0:2", "0:3"]);
    const second = ui(["--json"]);
    expect(second.status, String(second.stdout) + String(second.stderr)).toBe(0);
    expect(existsSync(join(p, ".design-os", "figma-ingest", "tokens.json"))).toBe(true);
    expect(existsSync(join(p, "tokens.json"))).toBe(false);
    expect(existsSync(join(p, "component-registry.json"))).toBe(false);
    must(["ds", "import", join(p, ".design-os/figma-ingest/tokens.json"), "--registry", join(p, ".design-os/figma-ingest/component-registry.json"), "--dir", p, "--json"]);
    expect(build(p).code).toBe(0);
    expect(sourceNote(p, "component")).toContain("from the sealed component registry");
    expect(capture(["ontology", "lint", "--dir", p]).out).toContain("Coverage");
  });
});
