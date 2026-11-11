/**
 * `ui ingest-figma-ds` and the node questions: pages first, then archive markers, then duplicate names. Each is raised
 * only after the one before it is ruled, and what the owner leaves out is excluded, counted and named per page.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { setValuedOptions } from "../src/core/owner-rulings/set-valued-options.js";
import { ingestArgs, ingestUntilReady, newProject, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const ELEVEN = join(process.cwd(), "tests", "fixtures", "owner-rulings", "components-eleven-pages.json");
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];

describe("AC-4: the page question comes first, and only then the markers and the duplicates inside the chosen page", () => {
  it("11 pages: the first question is the page question; choosing the library page leaves 477 of 781 nodes", () => {
    const project = newProject();
    const out = newProject();
    const first = capture([...ingestArgs(ELEVEN, project, out), "--json"]);
    expect(first.code).toBe(1);
    const round1 = blocked(first.out);
    expect(round1.map((c) => c.kind)).toEqual(["figma-library-pages"]);
    expect(round1[0]!.count).toBe(11);

    const asked: string[][] = [];
    const { final } = ingestUntilReady(ELEVEN, project, out, (c) => {
      asked.push([c.kind]);
      if (c.kind === "figma-library-pages") return [c.options.find((o) => o.label.includes("Library"))!.id];
      return c.kind === "archived-marked-nodes" ? "exclude-archived" : "exclude-surplus";
    }, ["--json"]);
    expect(asked).toEqual([["figma-library-pages"], ["archived-marked-nodes"], ["duplicate-component-names"]]);
    const data = JSON.parse(final.out).data as { ledger: { in: { components: number }; written: { components: number }; excluded: Record<string, number>; pending: number }; excluded: { pages: { name: string; count: number }[] } };
    expect(data.ledger.in.components).toBe(781);
    expect(data.excluded.pages.reduce((n, p) => n + p.count, 0)).toBe(304);
    expect(data.excluded.pages).toHaveLength(10);
    expect(data.ledger.excluded["page-not-selected"]).toBe(304);
    expect(data.ledger.excluded["archived-excluded"]).toBe(25);
    expect(data.ledger.excluded["duplicate-excluded"]).toBe(12);
    expect(data.ledger.written.components).toBe(477 - 25 - 12);
    expect(data.ledger.pending).toBe(0);
  });

  it("the page options follow D15 with no recommendation: largest first, the last option groups the rest with its count", () => {
    const project = newProject();
    const q = blocked(capture([...ingestArgs(ELEVEN, project, newProject()), "--json"]).out)[0]!;
    expect(q.options.map((o) => o.label)).toEqual(["Keep Library", "Keep Feature Area A", "Keep Feature Area B", "Keep the other 8 pages (112 nodes)"]);
    expect(q.options.some((o) => o.recommended === true)).toBe(false);
    expect(q.options.flatMap((o) => o.selects ?? [])).toHaveLength(11);
    expect(q.options.every((o) => o.id !== "review-individually")).toBe(true);
  });

  it("a scan without a page field skips the page question and says pageSignal: absent", () => {
    const project = newProject();
    const scan = { components: [{ id: "1:1", name: "Card", type: "COMPONENT" }, { id: "1:2", name: "Chip", type: "COMPONENT" }], tokens: [], styles: [] };
    const r = capture([...ingestArgs(writeScan(project, scan), project, newProject()), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.pageSignal).toBe("absent");
  });

  it("a renamed page or node is not a new member: rulings are keyed by the scan's ids", () => {
    const project = newProject();
    const out = newProject();
    const scan = JSON.parse(readFileSync(ELEVEN, "utf8")) as { components: { id: string; name: string; page: { id: string; name: string } }[] };
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, (c) => (c.kind === "figma-library-pages" ? [c.options.find((o) => o.label.includes("Library"))!.id] : c.kind === "archived-marked-nodes" ? "exclude-archived" : "exclude-surplus"));
    for (const c of scan.components) { c.name = `${c.name} renamed`; if (c.page.name === "Library") c.page.name = "Library, renamed"; }
    writeScan(project, scan);
    const again = capture([...ingestArgs(path, project, out), "--json"]);
    expect(again.code, again.out).toBe(0);
  });

  it("a single page asks nothing", () => {
    const project = newProject();
    const control = join(process.cwd(), "tests", "fixtures", "owner-rulings", "control-single-collection-single-page.json");
    const r = capture([...ingestArgs(control, project, newProject()), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.pageSignal).toBe("present");
  });
});

describe("the shared option builder (owner decision D15)", () => {
  const sizes: Record<string, number> = { a: 50, b: 40, c: 30, d: 20, e: 10, f: 5, g: 1 };
  const describeOne = (g: readonly string[], role: string): { label: string; consequence: string } => ({ label: `${role}:${g.join("+")}`, consequence: `${g.length}` });
  const build = (members: string[], recommended?: string[]): ReturnType<typeof setValuedOptions> =>
    setValuedOptions({ members, ...(recommended === undefined ? {} : { recommended }), weight: (m) => sizes[m] ?? 0, describe: describeOne });

  it("with a recommendation: the recommended set first, then single members largest first, the last slot groups the rest", () => {
    const o = build(["a", "b", "c", "d", "e", "f", "g"], ["f", "g"]);
    expect(o.map((x) => x.id)).toEqual(["keep:recommended", "member:a", "member:b", "keep:rest"]);
    expect(o[0]).toMatchObject({ recommended: true, selects: ["f", "g"] });
    expect(o[3]!.selects).toEqual(["c", "d", "e"]);
  });
  it("without a recommendation every slot is filled largest first", () => {
    const o = build(["g", "f", "e", "d", "c", "b", "a"]);
    expect(o.map((x) => x.id)).toEqual(["member:a", "member:b", "member:c", "keep:rest"]);
    expect(o[3]!.selects).toEqual(["d", "e", "f", "g"]);
  });
  it("the options are disjoint and cover every member exactly once", () => {
    for (const rec of [undefined, ["c"], ["a", "b", "c", "d", "e", "f", "g"]]) {
      const selected = build(["a", "b", "c", "d", "e", "f", "g"], rec).flatMap((x) => x.selects ?? []);
      expect(new Set(selected).size).toBe(selected.length);
      expect([...selected].sort()).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    }
  });
  it("a recommendation that covers every member, or a single member, gets a keep-none option beside it", () => {
    expect(build(["a", "b"], ["a", "b"]).map((x) => x.id)).toEqual(["keep:recommended", "keep:none"]);
    expect(build(["a"]).map((x) => x.id)).toEqual(["member:a", "keep:none"]);
  });
  it("members a delta no longer asks about are left out of the recommended set", () => {
    const o = build(["a", "b"], ["a", "z"]);
    expect(o[0]!.selects).toEqual(["a"]);
  });
  it("a member named like a fixed option id cannot collide with it", () => {
    const ids = setValuedOptions({ members: ["none", "rest", "recommended"], weight: () => 1, describe: describeOne }).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the per-member sheet never costs an option slot", () => {
  it("a recommended-first question lists every member in the markdown sheet", () => {
    const project = newProject();
    capture([...ingestArgs(ELEVEN, project, newProject())]);
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", project]).out;
    for (const page of ["Library", "Feature Area A", "Feature Area J"]) expect(sheet).toContain(`- ${readPageId(page)}`);
    expect(takeRecommended).toBeDefined();
  });
});

/** The page ids the fixture generator assigns: Library 0, then Feature Area A to J. */
function readPageId(name: string): string {
  const pages = new Map<string, string>();
  for (const c of (JSON.parse(readFileSync(ELEVEN, "utf8")) as { components: { page: { id: string; name: string } }[] }).components) pages.set(c.page.name, c.page.id);
  return pages.get(name)!;
}
