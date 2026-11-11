/**
 * Option order (largest first, ties in scan order, with and without a recommendation), the order in which dependent
 * questions are raised, nodes without a page, argument and scan validation, honest labels, and the reader's pending text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDsFile, planIngest } from "../src/core/figma-ds-ingest.js";
import { toOwnerClaudePayload } from "../src/core/owner-rulings/questions-format.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { aliasTo, colorVar, comp, ingestArgs, ingestUntilReady, newProject, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const ELEVEN = join(process.cwd(), "tests", "fixtures", "owner-rulings", "components-eleven-pages.json");
const open = (scan: unknown): Cluster[] => resolveDetections(planIngest(parseDsFile(scan), "s", "s").detections, [], "ingest-figma-ds").open;
const kinds = (r: { out: string }): string[] => (JSON.parse(r.out).data.blocked.clusters as Cluster[]).map((c) => c.kind);
const page = (id: string, name: string): { id: string; name: string } => ({ id, name });

/** `n` variables in `collection`; the first is on the path `shared/<tag>` and the others are unique. */
const collection = (name: string, n: number, tag: string, start: number): unknown[] =>
  Array.from({ length: n }, (_, i) => colorVar(`${start + i}:1`, i === 0 ? `shared/color/${tag}` : `${name}/color/own-${i}`, name));

describe("option order: largest first, ties in scan order, never by comparing member strings", () => {
  it("collections with no recommendation: every slot largest first, the last option groups the rest in scan order", () => {
    // sizes A1 B4 C1 D2 E1 F6; each collection collides with one other, so nothing is recommended
    const tokens = [...collection("A", 1, "ab", 100), ...collection("B", 4, "ab", 200), ...collection("C", 1, "cd", 300), ...collection("D", 2, "cd", 400), ...collection("E", 1, "ef", 500), ...collection("F", 6, "ef", 600)];
    const q = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!;
    expect(q.options.some((o) => o.recommended === true)).toBe(false);
    expect(q.options.map((o) => o.id)).toEqual(["member:F", "member:B", "member:D", "keep:rest"]);
    expect(q.options[3]!.selects).toEqual(["A", "C", "E"]);
    expect(q.options[3]!.label).toContain("other 3");
  });
  it("with a recommendation, the remaining collections are largest first and a tie keeps scan order", () => {
    // P is recommended (collides with nothing); Zeta and Alpha collide with each other and have the same size
    const tokens = [...collection("P", 3, "none", 100), ...collection("Zeta", 2, "za", 200), ...collection("Alpha", 2, "za", 300), ...collection("Big", 5, "bm", 400), ...collection("Mid", 5, "bm", 500)];
    const q = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!;
    expect(q.options[0]).toMatchObject({ id: "keep:recommended", recommended: true, selects: ["P"] });
    expect(q.options.map((o) => o.id)).toEqual(["keep:recommended", "member:Big", "member:Mid", "keep:rest"]);
    expect(q.options[3]!.selects).toEqual(["Alpha", "Zeta"]);
    // within the grouped rest nothing is compared as strings either: the two tied sizes appear in scan order in the question
    const tied = open(scanOf({ tokens: [...collection("Zeta", 2, "za", 200), ...collection("Alpha", 2, "za", 300)] })).find((c) => c.kind === "figma-collections")!;
    expect(tied.options.map((o) => o.id)).toEqual(["member:Zeta", "member:Alpha"]);
  });
  it("pages of equal size keep the scan's order: '10:1' stays before '9:1'", () => {
    const components = [comp("1:1", "A", page("10:1", "Ten")), comp("1:2", "B", page("9:1", "Nine")), comp("1:3", "C", page("2:1", "Two"))];
    const q = open(scanOf({ components })).find((c) => c.kind === "figma-library-pages")!;
    expect(q.options.map((o) => o.id)).toEqual(["member:10:1", "member:9:1", "member:2:1"]);
  });
});

describe("a question the page answer can dissolve is not asked before it", () => {
  const lib = page("0:1", "Library");
  const scratch = page("0:2", "Scratch");
  const scan = (): Record<string, unknown> => scanOf({ components: [
    comp("1:1", "Button", lib), comp("1:2", "404 Header", scratch), comp("1:3", "Card", lib, { instances: [{ component: "1:2", count: 1 }] }),
  ] });

  it("with an unruled page question, classification-conflicts is not raised; afterwards it covers kept pages only", () => {
    const project = newProject();
    const r = capture([...ingestArgs(writeScan(project, scan()), project, newProject()), "--json"]);
    expect(kinds(r)).toEqual(["figma-library-pages"]);
    // keep only the library page: the digit-led node sits on the page that was left out, so nothing is asked about it
    const { asked, final } = ingestUntilReady(writeScan(project, scan()), project, newProject(), (c) => (c.kind === "figma-library-pages" ? [c.options.find((o) => o.label.includes("Library"))!.id] : takeRecommended(c)), ["--json"]);
    expect(asked.flat().map((c) => c.kind)).toEqual(["figma-library-pages"]);
    expect(final.code).toBe(0);
  });
  it("a kept page that holds the digit-led node raises the conflict after the page answer", () => {
    const project = newProject();
    const { asked } = ingestUntilReady(writeScan(project, scan()), project, newProject(), (c) => (c.kind === "figma-library-pages" ? c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id) : takeRecommended(c)), ["--json"]);
    expect(asked.map((round) => round.map((c) => c.kind))).toEqual([["figma-library-pages"], ["classification-conflicts"]]);
  });
  it("a single-page scan raises the conflict at once", () => {
    const project = newProject();
    const one = scanOf({ components: [comp("1:2", "404 Header", page("0:1", "Library")), comp("1:3", "Card", page("0:1", "Library"), { instances: [{ component: "1:2", count: 1 }] })] });
    expect(kinds(capture([...ingestArgs(writeScan(project, one), project, newProject()), "--json"]))).toEqual(["classification-conflicts"]);
  });
  it("archive markers are ruled before duplicate names are asked", () => {
    const project = newProject();
    const lib = page("0:1", "Library");
    const marked = scanOf({ components: [comp("1:1", "[ARCHIVED] Card", lib), comp("1:2", "Card", lib)] });
    expect(kinds(capture([...ingestArgs(writeScan(project, marked), project, newProject()), "--json"]))).toEqual(["archived-marked-nodes"]);
    const { asked } = ingestUntilReady(writeScan(project, marked), project, newProject(), (c) => (c.kind === "archived-marked-nodes" ? "keep-archived" : "exclude-all"), ["--json"]);
    expect(asked.map((round) => round.map((c) => c.kind))).toEqual([["archived-marked-nodes"], ["duplicate-component-names"]]);
  });
});

describe("nodes without a page in a scan that has pages", () => {
  const lib = page("0:1", "Library");
  const scan = (): Record<string, unknown> => scanOf({ components: [comp("1:1", "A", lib), comp("1:2", "B", lib), comp("1:3", "Loose")] });
  it("are one member of the library-pages question, named and counted", () => {
    const q = open(scan()).find((c) => c.kind === "figma-library-pages")!;
    expect(q.members).toContain("~no-page");
    expect(q.labels!["~no-page"]).toBe("Nodes without a page");
    expect(q.question).toContain("Nodes without a page (1 nodes)");
  });
  it("are left out when the owner keeps only the page, and counted under the page reason", () => {
    const project = newProject();
    const { final } = ingestUntilReady(writeScan(project, scan()), project, newProject(), (c) => [c.options.find((o) => o.label.includes("Library"))!.id], ["--json"]);
    const data = JSON.parse(final.out).data as { ledger: { excluded: Record<string, number>; written: { components: number } }; excluded: { pages: { name: string; count: number }[] } };
    expect(data.ledger.written.components).toBe(2);
    expect(data.excluded.pages).toEqual([{ name: "Nodes without a page", count: 1 }]);
  });
  it("a malformed page object is an invalid scan: BAD_DS, nothing asked and nothing written", () => {
    const project = newProject();
    const out = newProject();
    const bad = scanOf({ components: [comp("1:1", "A", lib), { id: "1:2", name: "B", type: "COMPONENT", page: { id: 5 } }] });
    const r = capture([...ingestArgs(writeScan(project, bad), project, out), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_DS");
    expect(existsSync(join(out, "tokens.json"))).toBe(false);
    expect(existsSync(join(project, ".design-os"))).toBe(false);
  });
  it("the reader keeps accepting a bare page name from an older scan", () => {
    const ds = parseDsFile(scanOf({ components: [{ id: "1:1", name: "A", type: "COMPONENT", page: "Library" }] }));
    expect(ds.components[0]).toMatchObject({ pageId: "Library", pageName: "Library" });
    expect(ds.pageSignal).toBe("present");
  });
});

describe("--cwd that does not exist is refused", () => {
  it("BAD_ARG, and nothing is created", () => {
    const project = newProject();
    const nowhere = join(project, "nowhere", "deep");
    const r = capture([...ingestArgs(writeScan(project, scanOf({})), nowhere, newProject()), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
    expect(existsSync(join(project, "nowhere"))).toBe(false);
  });
});

describe("labels say what the option does", () => {
  const sem = (id: string, target: string, collectionName: string, name: string): unknown => colorVar(id, `${collectionName}/color/${name}`, collectionName, { Light: aliasTo(target) });
  it("the recommended collections option does not claim 'do not collide' when it holds an alias-connected colliding collection", () => {
    const tokens = [colorVar("1:1", "color/p", "Primitives"), sem("2:1", "1:1", "Semantic", "s"), colorVar("3:1", "x/color/brand", "Semantic"), colorVar("4:1", "x/color/brand", "Plugin")];
    const q = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!;
    const rec = q.options.find((o) => o.recommended === true)!;
    expect(rec.label).not.toContain("do not collide");
    expect(rec.label).toContain("Semantic");
    expect(rec.label).toContain("Primitives");
  });
  it("the recommended option still says 'do not collide' when none of them collides", () => {
    const tokens = [colorVar("1:1", "color/p", "Primitives"), colorVar("2:1", "color/brand", "A"), colorVar("3:1", "color/brand", "B")];
    const rec = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!.options.find((o) => o.recommended === true)!;
    expect(rec.label).toContain("do not collide");
  });
  it("the unnamed collection is shown as '(no collection)', never as an empty name", () => {
    const loose = { id: "VariableID:1:1", name: "color/brand", type: "COLOR", value: { r: 0, g: 0, b: 0, a: 1 } };
    const q = open(scanOf({ tokens: [loose, colorVar("2:1", "color/brand", "Named")] })).find((c) => c.kind === "figma-collections")!;
    expect(q.labels).toMatchObject({ "": "(no collection)" });
    expect(q.question).toContain("(no collection) (1 variables)");
    expect(q.question).not.toMatch(/(^|[:,.] )\(\d+ variables\)/);
    for (const o of q.options) expect(o.label).not.toMatch(/Keep $|Keep {2}/);
    expect(q.options.some((o) => o.label === "Keep (no collection)")).toBe(true);
  });
});

describe("the reader's pending text and the claude format", () => {
  it("BAD_PENDING tells the owner to re-run the command that raised the questions", () => {
    const project = newProject();
    mkdirSync(join(project, ".design-os", "onboard"), { recursive: true });
    writeFileSync(join(project, ".design-os", "onboard", "pending.json"), "{ not json");
    const r = capture(["onboard", "questions", "--cwd", project, "--json"]);
    expect(r.code).toBe(1);
    const message = JSON.parse(r.out).error.message as string;
    expect(JSON.parse(r.out).error.code).toBe("BAD_PENDING");
    expect(message).toContain("re-run the command that raised the questions");
    expect(message).toContain("ui ingest-figma-ds");
  });
  it("the --format claude question text lists every member; only the sample line is capped, at a whole item, and it points at the sheet", () => {
    const project = newProject();
    const r = capture([...ingestArgs(ELEVEN, project, newProject()), "--json"]);
    const q = (JSON.parse(r.out).data.blocked.clusters as Cluster[])[0]!;
    const payload = toOwnerClaudePayload([q], 1) as { questions: { question: string }[] };
    const text = payload.questions[0]!.question;
    for (const name of ["Library", "Feature Area A", "Feature Area J"]) expect(text).toContain(name);
    expect(text).toContain("Feature Area J (1 nodes). Which pages hold the design system?");
    expect(text).toMatch(/, and 6 more\. The full list is in the sheet: ui onboard questions --format markdown$/);
    expect(readFileSync(ELEVEN, "utf8").length).toBeGreaterThan(0);
  });
});
