/**
 * Defects found by running the guidelines pack on a real design system, each pinned with a synthetic
 * fixture: (A) every `(SUPERSEDED …)` prefix shape is superseded, (B) a backtick span is a mention and
 * never an AVOIDED_TERM use, (C) the Figma bundle carries no raw QUESTION lines.
 */
import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FULL, answerAll, build, capture, cleanScratch, listFiles, manifestOf, project, read, tempDir, writeJson } from "./helpers/guidelines-harness.js";
import { editRegistry, fillSlot } from "./helpers/guidelines-edit-helpers.js";
import { classifyRuling, parseSupersededMarker, supersededRulingIds } from "../src/core/ds-guidelines-rulings-reader.js";
import type { Ruling } from "../src/core/ds-guidelines-rulings-reader.js";

afterEach(() => cleanScratch());

const ruling = (id: string, text: string): Ruling & { since: string } => ({ id, category: "tables", text, scope: "global", source: [], since: "2026-01-01" });
const rulingsPath = (dir: string): string => join(dir, "design", "knowledge", "rulings.json");

describe("A — every (SUPERSEDED …) prefix shape is superseded; a mention is not", () => {
  const SHAPES = [
    ruling("s-1", "(SUPERSEDED 2026-01-01 by r-9) Never stack modals."),
    ruling("s-2", "(SUPERSEDED 2026-01-02 — do not follow) Always nest dialogs."),
    ruling("s-3", "(SUPERSEDED 2026-01-03 by r-9 — replaced by the shell rule) Never wrap headers."),
    ruling("s-4", "(SUPERSEDED in part by r-9 — keep the first sentence) Never mix icons."),
  ];
  const MENTION = ruling("m-1", "Never rely on what the old rule said: it was superseded last spring, and the superseded text is kept elsewhere.");

  it("build counts all four shapes as superseded and still emits the mention-only ruling", () => {
    const p = project([]);
    writeJson(rulingsPath(p.dir), { rulings: [...SHAPES, MENTION] });
    expect(build(p.dir).code).toBe(0);
    const stats = manifestOf(p.pack)["rulings"] as { total: number; superseded: number; tierAOther: number; tierA: number };
    expect(stats.superseded).toBe(4);
    expect(stats.total).toBe(5);
    expect(stats.tierA + stats.tierAOther).toBe(1);
    expect(read(p.pack, "rulings.md")).toContain("**m-1**");
    for (const s of SHAPES) expect(read(p.pack, "rulings.md")).not.toContain(`**${s.id}**`);
  });

  it("check treats a text citing any of the four ids as SUPERSEDED_CITED", () => {
    const p = project([]);
    writeJson(rulingsPath(p.dir), { rulings: [...SHAPES, MENTION] });
    build(p.dir);
    writeFileSync(join(p.pack, "overview.md"), `${read(p.pack, "overview.md")}\nSee s-2 and s-4.\n`);
    const r = capture(["ds", "guidelines", "check", "--dir", p.dir, "--json"]);
    const found = (JSON.parse(r.out) as { data: { findings: { code: string; message: string }[] } }).data.findings.filter((f) => f.code === "SUPERSEDED_CITED");
    expect(found.map((f) => f.message).join(" ")).toMatch(/'s-2'[\s\S]*'s-4'/);
  });

  it("the marker reader captures `by <id>`, ignores case, and needs the text to START with it", () => {
    expect(parseSupersededMarker("(SUPERSEDED 2026-01-01 by r-9) x")).toEqual({ by: "r-9" });
    expect(parseSupersededMarker("  (superseded 2026-01-03 by r-9 — note (with parens)) x")).toEqual({ by: "r-9" });
    expect(parseSupersededMarker("(SUPERSEDED 2026-01-03 — see (r-1) first, by r-9) x")).toEqual({ by: "r-9" }); // the marker ends at the MATCHING paren
    expect(parseSupersededMarker("(SUPERSEDED 2026-01-02 — do not follow) x")).toEqual({});
    expect(parseSupersededMarker("(SUPERSEDED in part by R-12 — note) x")).toEqual({ by: "R-12" });
    expect(parseSupersededMarker("Never use this; (SUPERSEDED 2026-01-01 by r-9) came later")).toBeUndefined();
    expect(parseSupersededMarker("The (superseded) wording was dropped")).toBeUndefined();
    expect(parseSupersededMarker("(SUPERSEDEDLY 2026) x")).toBeUndefined();
    expect(parseSupersededMarker("(SUPERSEDED 2026-01-01 by r-9 never closed")).toBeUndefined();
    expect(supersededRulingIds([...SHAPES, MENTION])).toEqual(new Set(["s-1", "s-2", "s-3", "s-4"]));
    expect(classifyRuling(MENTION)).toBe("A");
  });
});

describe("B — a backtick span is a mention, never an AVOIDED_TERM use", () => {
  const codes = (dir: string): string[] => {
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    return (JSON.parse(r.out) as { data: { findings: { code: string }[] } }).data.findings.map((f) => f.code).filter((c) => c === "AVOIDED_TERM" || c === "UNKNOWN_NAME");
  };
  function answered(lines: string[]): string {
    const p = project(["terminology"]);
    editRegistry(p.dir, (r) => { r.components.push({ name: "Page content / Box Catalog", category: "card", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["x"], states: ["default"], scope: "local" }); });
    build(p.dir);
    fillSlot(join(p.pack, "components.md"), /^> QUESTION\(confusable\.card-header[^)]*\)/, lines);
    return p.dir;
  }

  it("an explicit component: span holding an avoided word on a real registry name is not judged", () => {
    expect(codes(answered(["**Do:** use `component:Page content / Box Catalog` for lists.", "**Don't:** use a header.", "**Why:** it scans."]))).toEqual([]);
  });

  it("quoting a rejected synonym in backticks to forbid it is allowed", () => {
    expect(codes(answered(["**Do:** say Panel.", "**Don't:** call it `widget` or `box`.", "**Why:** the glossary rejects them."]))).toEqual([]);
  });

  it("bare prose in a slot answer is still judged, even next to a mention", () => {
    expect(codes(answered(["**Do:** use a widget for lists, never `box`.", "**Don't:** use a header.", "**Why:** it scans."]))).toEqual(["AVOIDED_TERM"]);
  });

  it("an unclosed backtick does not hide a bare use", () => {
    expect(codes(answered(["**Do:** start with `a then use a widget.", "**Don't:** use a header.", "**Why:** it scans."]))).toEqual(["AVOIDED_TERM"]);
  });
});

describe("C — the Figma bundle shows each scenario as a title, an evidence line and its answer", () => {
  function exported(): { dir: string; out: string; bundle: string } {
    const p = project(["terminology", "scenarios"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    const r = capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out, "--json"]);
    expect(r.code, r.out).toBe(0);
    return { dir: p.dir, out, bundle: join(out, "figma-guidelines") };
  }

  it("no bundle line starts with '> QUESTION(' and no slot id is left behind", () => {
    const { bundle } = exported();
    for (const f of listFiles(bundle)) {
      expect(read(bundle, f), f).not.toMatch(/^> QUESTION\(/m);
      expect(read(bundle, f), f).not.toMatch(/\bap-ruling-|\bap-conv-|\bconfusable\.[a-z]/);
    }
  });

  it("a scenario keeps its title, one evidence line and the three answer parts", () => {
    const { bundle } = exported();
    const ap = read(bundle, "anti-patterns.md");
    expect(ap).toContain(["### Ruling r-201 — tables", "_Evidence: r-201_", ...FULL].join("\n"));
    expect(ap).toMatch(/^### Convention \(Layout\): .*\n_Evidence: CONVENTIONS\.md:L\d+_\n\*\*Do:\*\*/m);
    expect(ap).toMatch(/^### Gap: .*\n_Evidence: gap\./m);
  });

  it("a look-alike-names slot becomes a titled question with its member names as evidence", () => {
    const { bundle } = exported();
    const comps = read(bundle, "components.md");
    expect(comps).toContain("### Which of `component:Card/Header`, `component:Modal/Header` is used when?\n_Evidence: `component:Card/Header`, `component:Modal/Header`_\n" + FULL[0]);
  });

  it("the canonical pack keeps its QUESTION lines, and UPLOAD.md's byte table matches the files", () => {
    const { dir, out, bundle } = exported();
    expect(read(dir, "design", "guidelines", "anti-patterns.md")).toMatch(/^> QUESTION\(ap-ruling-/m);
    const upload = read(out, "UPLOAD.md");
    for (const f of listFiles(bundle)) {
      const bytes = Buffer.byteLength(read(bundle, f), "utf8");
      expect(upload).toContain(`| ${f} | ${bytes.toLocaleString("en-US")} |`);
    }
  });

  it("check --profile figma still flags a scenario in the bundle that has no answer", () => {
    const { out, bundle } = exported();
    const ap = join(bundle, "anti-patterns.md");
    writeFileSync(ap, read(bundle, "anti-patterns.md").replace(FULL.join("\n"), "").replace(/\n{3,}/g, "\n\n"));
    const r = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", bundle, "--json"]);
    const findings = (JSON.parse(r.out) as { data: { findings: { code: string }[] } }).data.findings;
    expect(findings.some((f) => f.code === "OPEN_QUESTION")).toBe(true);
    expect(out).toBeTruthy();
  });
});
