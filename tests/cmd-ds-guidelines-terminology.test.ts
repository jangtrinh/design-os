import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "ds-guidelines");
const NOW = "2026-10-15T00:00:00Z";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** Sealed DS + (optionally) the CONTEXT.md / glossary / CONVENTIONS.md / soul.md fixtures. */
function project(withSources = true): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-terms-"));
  scratch.push(dir);
  cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
  if (withSources) cpSync(join(FIXTURES, "terminology"), dir, { recursive: true });
  return { dir, pack: join(dir, "design", "guidelines") };
}
const put = (dir: string, rel: string, body: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
};
const build = (dir: string) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const manifestOf = (pack: string): Record<string, unknown> => JSON.parse(read(pack, "guidelines.manifest.json")) as Record<string, unknown>;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lineRe = (line: string): RegExp => new RegExp(`^${escapeRe(line)}$`, "m");

interface Finding { code: string; file: string; line: number; message: string }
const check = (dir: string): { code: number; findings: Finding[]; unchecked: number } => {
  const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
  const data = (JSON.parse(r.out) as { data: { findings: Finding[]; termSpansUnchecked: number } }).data;
  return { code: r.code, findings: data.findings, unchecked: data.termSpansUnchecked };
};

describe("terminology (CONTEXT.md + ontology glossary)", () => {
  it("G-TERMS: both sources are listed, CONTEXT.md wins on a conflict, the conflict is recorded", () => {
    const { dir, pack } = project();
    expect(build(dir).code).toBe(0);
    const t = read(pack, "terminology.md");
    expect(t).toMatch(lineRe("- `term:Panel` — A bordered container that groups related fields on one screen. · _Avoid_: box, widget, section card"));
    // Workspace is in both: CONTEXT.md's wording and avoid list win; the glossary only adds the missing vi.
    expect(t).toMatch(lineRe("- `term:Workspace` — The top-level space a team shares. · vi: workspace-vi · _Avoid_: org, tenant"));
    expect(t).not.toMatch(/A shared space owned by one organisation/);
    // Glossary-only terms; identical entries in both sources are not a conflict.
    expect(t).toMatch(lineRe("- `term:Invoice` — A request for payment sent to a customer. · vi: invoice-vi · _Avoid_: bill"));
    expect(t).toMatch(lineRe("- `term:Back office` — Staff who use internal tools: support, finance. · _Avoid_: backend"));
    expect(t).toMatch(lineRe("- `term:Seat` — One licensed person in a workspace. · _Avoid_: user slot"));
    // Entries outside the Language section and the commented template are not terms.
    expect(t).not.toMatch(/Not a term|Preamble note|\{Term\}/);
    expect(t.match(/^- `term:/gm)).toHaveLength(5);

    expect(manifestOf(pack)["terminology"]).toEqual({
      terms: 5, fromContext: 3, fromGlossary: 2,
      conflicts: [{ term: "Workspace", kept: "CONTEXT.md", overridden: "ontology/glossary.yaml", fields: ["definition", "avoid"] }],
    });
  });

  it("each term is a rule whose source names the term and the file it came from", () => {
    const { dir, pack } = project();
    build(dir);
    const rules = (manifestOf(pack)["rules"] as { id: string; sources: { path: string; term?: string }[] }[]).filter((r) => r.id.startsWith("terminology."));
    expect(rules.map((r) => r.sources[0])).toEqual([
      { path: "ontology/glossary.yaml", term: "Back office" },
      { path: "ontology/glossary.yaml", term: "Invoice" },
      { path: "CONTEXT.md", term: "Panel" },
      { path: "CONTEXT.md", term: "Seat" },
      { path: "CONTEXT.md", term: "Workspace" },
    ]);
  });

  it("G-SKIP: every unsupported glossary shape is skipped with a reason, exit 0, and CONTEXT.md terms still land", () => {
    const shapes: Record<string, string> = {
      "block list avoid": "terms:\n  - term: Invoice\n    def: A request.\n    avoid:\n      - bill\n",
      "nested map": "terms:\n  - term: Invoice\n    def: A request.\n    meta:\n      owner: finance\n",
      "multi-line scalar": "terms:\n  - term: Invoice\n    def: |\n      A request.\n",
      "unknown item key": "terms:\n  - term: Invoice\n    def: A request.\n    see: Bill\n",
      "no terms key": "entries:\n  - term: Invoice\n    def: A request.\n",
      "missing def": "terms:\n  - term: Invoice\n",
      "colon in plain scalar": "terms:\n  - term: Invoice\n    def: A request: for payment.\n",
      "empty avoid value": "terms:\n  - term: Invoice\n    def: A request.\n    avoid:\n",
      "anchor": "terms:\n  - term: &x Invoice\n    def: A request.\n",
      "flow map item": "terms:\n  - {term: Invoice, def: A request.}\n",
    };
    for (const [label, body] of Object.entries(shapes)) {
      const { dir, pack } = project();
      put(dir, "ontology/glossary.yaml", body);
      expect(build(dir).code, label).toBe(0);
      expect(manifestOf(pack)["skippedSources"], label).toContainEqual({ path: "ontology/glossary.yaml", reason: "unsupported glossary shape" });
      const t = read(pack, "terminology.md");
      expect(t, label).toMatch(/^- `term:Panel`/m);
      expect(t, label).not.toMatch(/term:Invoice/);
      expect((manifestOf(pack)["terminology"] as { fromGlossary: number }).fromGlossary, label).toBe(0);
    }
  });

  it("supported spellings read cleanly: quotes, comments, blank lines, a dash at column 0", () => {
    const { dir, pack } = project(false);
    put(dir, "ontology/glossary.yaml", "# note\nversion: '1'\n\nterms:\n- term: \"Odd: name\"\n  def: 'It''s fine'\n  avoid: backend\n- term: Plain\n  def: Plain def.\n  avoid: []\n");
    expect(build(dir).code).toBe(0);
    const t = read(pack, "terminology.md");
    expect(t).toMatch(lineRe("- `term:Odd: name` — It's fine · _Avoid_: backend"));
    expect(t).toMatch(lineRe("- `term:Plain` — Plain def."));
  });

  it("an absent CONTEXT.md still builds terminology from the glossary and records the skip", () => {
    const { dir, pack } = project();
    unlinkSync(join(dir, "CONTEXT.md"));
    expect(build(dir).code).toBe(0);
    expect(read(pack, "terminology.md").match(/^- `term:/gm)).toHaveLength(4);
    expect(manifestOf(pack)["skippedSources"]).toContainEqual({ path: "CONTEXT.md", reason: expect.stringMatching(/not found/) });
  });

  it("no glossary source at all: no terminology.md, both skips recorded, term spans stay unjudged", () => {
    const { dir, pack } = project(false);
    expect(build(dir).code).toBe(0);
    expect(existsSync(join(pack, "terminology.md"))).toBe(false);
    const skipped = manifestOf(pack)["skippedSources"] as { path: string }[];
    expect(skipped.map((s) => s.path)).toEqual(expect.arrayContaining(["CONTEXT.md", "ontology/glossary.yaml"]));
    expect(manifestOf(pack)["terminology"]).toBeUndefined();
    writeFileSync(join(pack, "components.md"), `${read(pack, "components.md")}\nSee \`term:Anything\`.\n`);
    expect(check(dir)).toMatchObject({ code: 0, unchecked: 1 });
  });

  it("is deterministic and the fresh pack checks clean with every source present", () => {
    const { dir, pack } = project();
    build(dir);
    const first = read(pack, "terminology.md") + read(pack, "grammar.md") + read(pack, "overview.md") + read(pack, "guidelines.manifest.json");
    build(dir);
    expect(read(pack, "terminology.md") + read(pack, "grammar.md") + read(pack, "overview.md") + read(pack, "guidelines.manifest.json")).toBe(first);
    expect(check(dir)).toEqual({ code: 0, findings: [], unchecked: 0 });
  });
});

describe("check — glossary", () => {
  it("term spans are judged once a glossary exists: unknown is UNKNOWN_NAME with a hint, real is green", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "components.md");
    const before = read(pack, "components.md");
    writeFileSync(file, `${before}\nUse \`term:Panel\` and \`term:Back office\`.\nNever say \`term:Panl\`.\n`);
    const line = before.split("\n").length + 2;
    const r = check(dir);
    expect(r.code).toBe(1);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ code: "UNKNOWN_NAME", file: "components.md", line });
    expect(r.findings[0]?.message).toMatch(/`term:Panl` is not in the glossary — did you mean `term:Panel`\?/);
  });

  it("AVOIDED_TERM: a slot answer using an _Avoid_ word is an error at its line", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "components.md");
    const before = read(pack, "components.md");
    writeFileSync(file, `${before}\n**Do:** group fields in a Panel.\n**Don't:** put a BOX inside a widget.\n**Why:** an inbox is not a box-model.\n**Why:** the inbox shows boxes and widgets.\n`);
    const r = check(dir);
    expect(r.code).toBe(1);
    const base = before.split("\n").length + 1;
    // The last line only holds longer words (inbox, boxes, widgets) — not uses of 'box' or 'widget' — so it is clean.
    expect(r.findings.map((f) => `${f.code}:${f.line}`)).toEqual([`AVOIDED_TERM:${base + 1}`, `AVOIDED_TERM:${base + 1}`, `AVOIDED_TERM:${base + 2}`]);
    expect(r.findings[0]?.message).toBe("uses 'box', which the glossary rejects — say 'Panel' instead");
    expect(r.findings[1]?.message).toContain("'widget'");
    // "box-model" holds the word "box" as its own word, which is a real use; "inbox" is not.
    expect(r.findings[2]?.message).toContain("'box'");
  });

  it("AVOIDED_TERM only judges slot answers; generated text and free prose are left alone", () => {
    const { dir, pack } = project();
    build(dir);
    expect(read(pack, "terminology.md")).toMatch(/_Avoid_: box, widget/); // generated, never flagged
    writeFileSync(join(pack, "components.md"), `${read(pack, "components.md")}\nA free paragraph may say box or widget.\n`);
    expect(check(dir).code).toBe(0);
  });

  it("a word the glossary also defines as a term is never enforced as avoided", () => {
    const { dir, pack } = project();
    put(dir, "ontology/glossary.yaml", read(dir, "ontology", "glossary.yaml").replace("avoid: [bill]", "avoid: [bill, panel]"));
    build(dir);
    writeFileSync(join(pack, "components.md"), `${read(pack, "components.md")}\n**Do:** use a panel for each group.\n`);
    expect(check(dir)).toEqual({ code: 0, findings: [], unchecked: 0 });
  });

  it("an unsupported glossary at check time contributes nothing, so the stale pack's glossary-only terms are unknown", () => {
    const { dir, pack } = project();
    build(dir);
    put(dir, "ontology/glossary.yaml", "terms:\n  - term: Invoice\n    def: A request.\n    see: Bill\n");
    writeFileSync(join(pack, "components.md"), `${read(pack, "components.md")}\nSee \`term:Panel\` and \`term:Invoice\`.\n`);
    const r = check(dir);
    expect(r.code).toBe(1);
    // CONTEXT.md terms still resolve; the glossary-only ones (here and in the built terminology.md) no longer do.
    expect(r.findings.filter((f) => f.file === "components.md").map((f) => f.message)).toEqual([expect.stringContaining("term:Invoice")]);
    expect(r.findings.filter((f) => f.file === "terminology.md").map((f) => f.code)).toEqual(["UNKNOWN_NAME", "UNKNOWN_NAME"]);
  });
});

describe("grammar (CONVENTIONS.md)", () => {
  const CONVENTION_LINES = [
    "- **DO** — auto-layout frames: **19** (95%). Auto-layout is the house default.",
    "- **DON'T** — raw / absolute (NONE-layout) frames: **1** (5%). Prefer auto-layout unless a deliberate overlay.",
    "- **DO** — token-bound solid fills: **18** (90%).",
    "**DO — on-scale values (match the DS):**",
    "| 8px | 11 |",
    "**DON'T — off-scale values (real deviations):**",
    "| 11px | 1 |",
  ];

  it("G-GRAMMAR: DO/DON'T lines and tables are copied verbatim; non-grammar sections are not", () => {
    const { dir, pack } = project();
    expect(build(dir).code).toBe(0);
    const g = read(pack, "grammar.md");
    for (const l of CONVENTION_LINES) expect(g, l).toMatch(lineRe(l));
    expect(g).toMatch(/^## Layout$/m);
    expect(g).toMatch(/^## Spacing \(grid\)$/m);
    expect(g).not.toMatch(/Per-section summary|Provenance|synthetic usage data/);
    expect(g).not.toMatch(/not measured yet/);
  });

  it("counts are copied, not re-derived: change a count in CONVENTIONS.md and the pack follows", () => {
    const { dir, pack } = project();
    put(dir, "CONVENTIONS.md", read(dir, "CONVENTIONS.md").replace("**19** (95%)", "**77** (99%)"));
    build(dir);
    expect(read(pack, "grammar.md")).toMatch(lineRe("- **DO** — auto-layout frames: **77** (99%). Auto-layout is the house default."));
  });

  it("each DO/DON'T statement is a rule sourced to its CONVENTIONS.md section", () => {
    const { dir, pack } = project();
    build(dir);
    const rules = (manifestOf(pack)["rules"] as { id: string; sources: { path: string; section?: string }[] }[]).filter((r) => r.id.startsWith("grammar."));
    expect(rules).toHaveLength(6);
    const conventions = read(dir, "CONVENTIONS.md");
    for (const r of rules) {
      expect(r.sources[0]?.path).toBe("CONVENTIONS.md");
      expect(conventions).toMatch(new RegExp(`^## ${escapeRe(r.sources[0]?.section ?? "?")}$`, "m"));
    }
  });

  it("G-GRAMMAR: a missing CONVENTIONS.md says 'not measured yet' and is recorded as skipped", () => {
    const { dir, pack } = project();
    unlinkSync(join(dir, "CONVENTIONS.md"));
    expect(build(dir).code).toBe(0);
    expect(read(pack, "grammar.md")).toMatch(/^Grammar not measured yet — run `ui synthesize-conventions` on a usage-dna\.json/m);
    expect(manifestOf(pack)["skippedSources"]).toContainEqual({ path: "CONVENTIONS.md", reason: expect.stringMatching(/not measured yet/) });
    expect(check(dir).code).toBe(0);
  });

  it("a CONVENTIONS.md without DO/DON'T lines is also 'not measured yet'", () => {
    const { dir, pack } = project();
    put(dir, "CONVENTIONS.md", "# Applied Conventions\n\n## Provenance\n\n- nothing measured\n");
    build(dir);
    expect(read(pack, "grammar.md")).toMatch(/^Grammar not measured yet/m);
    expect(manifestOf(pack)["skippedSources"]).toContainEqual({ path: "CONVENTIONS.md", reason: expect.stringMatching(/no DO\/DON'T/) });
  });
});

describe("soul summary in the overview", () => {
  it("G-SOUL: the stance sections land in the overview with the pointer; frontmatter, intro and comments do not", () => {
    const { dir, pack } = project();
    build(dir);
    const o = read(pack, "overview.md");
    expect(o).toMatch(/^## Design stance$/m);
    for (const l of ["Status: ratified", "## Never", "- gradients on surfaces", "## Always", "- one primary action per screen", "## Voice", "Full stance: design/soul.md"]) {
      expect(o, l).toMatch(lineRe(l));
    }
    expect(o).not.toMatch(/^---$|Design Soul|Declared stance|placeholder note/m);
    expect(o).toMatch(/^ {2}- terminology\.md — /m);
    expect(o).toMatch(/^ {2}- grammar\.md — /m);
  });

  it("G-SOUL: a long stance is capped at 40 lines with a marker", () => {
    const { dir, pack } = project();
    const bullets = Array.from({ length: 59 }, (_, i) => `- rule ${String(i + 1).padStart(2, "0")}`).join("\n");
    put(dir, "design/soul.md", `## Always\n${bullets}\n`);
    build(dir);
    const o = read(pack, "overview.md");
    expect(o).toMatch(lineRe("- rule 39"));
    expect(o).not.toMatch(/- rule 40/);
    expect(o).toMatch(lineRe("… capped at 40 lines."));
    expect(o).toMatch(lineRe("Full stance: design/soul.md"));
  });

  it("an absent soul leaves the overview without a stance section and records the skip", () => {
    const { dir, pack } = project();
    unlinkSync(join(dir, "design", "soul.md"));
    build(dir);
    expect(read(pack, "overview.md")).not.toMatch(/Design stance/);
    expect(manifestOf(pack)["skippedSources"]).toContainEqual({ path: "design/soul.md", reason: expect.stringMatching(/not found/) });
  });

  it("every optional input that fed the pack is a manifest source with its hash; skipped ones are not", () => {
    const { dir, pack } = project();
    put(dir, "ontology/glossary.yaml", "terms:\n  - term: X\n    def: d\n    see: y\n");
    build(dir);
    const sources = (manifestOf(pack)["sources"] as { path: string; sha: string }[]).map((s) => s.path);
    expect(sources).toEqual(["CONTEXT.md", "CONVENTIONS.md", "design/component-registry.json", "design/design.tokens.json", "design/soul.md"]);
  });
});
