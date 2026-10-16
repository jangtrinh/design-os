/**
 * Regression tests for the adversarial review of the guidelines pack. Each one reproduces a defect at
 * the CLI seam: slot ids that drift, stale markdown harvested for answers, a non-atomic write, a
 * locale-dependent order, a colliding rule id, and an unreadable bundle file.
 */
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  NOW, answerAll, build, capture, cleanScratch, listFiles, manifestOf, project, read, tempDir, writeJson,
} from "./helpers/guidelines-harness.js";
import {
  chmodBlocksWrites, editRegistry, editTokens, fillSlot, makeGapFree, sectionUnder,
} from "./helpers/guidelines-edit-helpers.js";
import { canonicalStringify } from "../src/core/ds-manifest.js";

const restore: string[] = [];
afterEach(() => {
  for (const p of restore.splice(0)) { try { chmodSync(p, statSync(p).isDirectory() ? 0o755 : 0o644); } catch { /* already gone */ } }
  cleanScratch();
});
const lock = (path: string, mode: number): void => { restore.push(path); chmodSync(path, mode); };

const answer = (tag: string): string[] => [`**Do:** ${tag} do.`, `**Don't:** ${tag} dont.`, `**Why:** ${tag} why.`];
const SLOT_AFTER = (heading: RegExp) => (file: string, tag: string): void => {
  const lines = readFileSync(file, "utf8").split("\n");
  const h = lines.findIndex((l) => heading.test(l));
  expect(h, `heading ${String(heading)}`).toBeGreaterThanOrEqual(0);
  expect(lines[h + 1]).toMatch(/^> QUESTION\(/);
  lines.splice(h + 2, 0, ...answer(tag));
  writeFileSync(file, lines.join("\n"));
};
const rulingsFile = (dir: string): string => join(dir, "design", "knowledge", "rulings.json");
const neverRuling = (id: string, text: string): unknown => ({ id, category: "tables", text, scope: "global", source: ["n.md"], since: "2026-01-01" });
const orphansOf = (pack: string): string => (existsSync(join(pack, "guidelines.orphans.md")) ? read(pack, "guidelines.orphans.md") : "");
const count = (text: string, re: RegExp): number => text.match(re)?.length ?? 0;

describe("1 — slot ids come from stable evidence, so an answer never moves to another slot", () => {
  it("inserting a DON'T above an answered one (or changing its counts) keeps the answer with its own DON'T", () => {
    const p = project(["scenarios"]);
    build(p.dir);
    const ap = join(p.pack, "anti-patterns.md");
    fillSlot(ap, /^> QUESTION\(ap-conv-layout-[^)]*\)/, answer("CONV-ORIGINAL"));
    const conv = join(p.dir, "CONVENTIONS.md");
    writeFileSync(conv, read(p.dir, "CONVENTIONS.md").replace("- **DON'T** — raw / absolute", "- **DON'T** — raw / absolute overlays: **3** (15%). Avoid.\n- **DON'T** — raw / absolute"));
    build(p.dir);
    const after = read(ap);
    expect(sectionUnder(after, /^### Convention \(Layout\): raw \/ absolute \(NONE/)).toContain("CONV-ORIGINAL do.");
    expect(sectionUnder(after, /^### Convention \(Layout\): raw \/ absolute overlays/)).not.toContain("CONV-ORIGINAL");
    expect(orphansOf(p.pack)).toBe("");
    // A rescan changes the counts in the line, not the slot.
    writeFileSync(conv, read(p.dir, "CONVENTIONS.md").replace("**1** (5%)", "**4** (20%)"));
    build(p.dir);
    expect(sectionUnder(read(ap), /^### Convention \(Layout\): raw \/ absolute \(NONE/)).toContain("CONV-ORIGINAL do.");
  });

  it("two ruling ids that slug alike each keep their own answer, whichever of them is removed", () => {
    for (const removed of ["foo-bar", "foo_bar"]) {
      const p = project([]);
      const rulings = { schema: "owner-rulings/1", at: NOW, rulings: [neverRuling("foo-bar", "Never stack two modals."), neverRuling("foo_bar", "Never nest two tables.")] };
      writeJson(rulingsFile(p.dir), rulings);
      build(p.dir);
      const ap = join(p.pack, "anti-patterns.md");
      SLOT_AFTER(/^### Ruling foo-bar — tables$/)(ap, "ANSWER-DASH");
      SLOT_AFTER(/^### Ruling foo_bar — tables$/)(ap, "ANSWER-UNDER");
      writeJson(rulingsFile(p.dir), { ...rulings, rulings: rulings.rulings.filter((r) => (r as { id: string }).id !== removed) });
      build(p.dir);
      const kept = removed === "foo-bar" ? "foo_bar" : "foo-bar";
      const keptTag = removed === "foo-bar" ? "ANSWER-UNDER" : "ANSWER-DASH";
      const goneTag = removed === "foo-bar" ? "ANSWER-DASH" : "ANSWER-UNDER";
      expect(sectionUnder(read(ap), new RegExp(`^### Ruling ${kept} — tables$`)), `removed ${removed}`).toContain(`${keptTag} do.`);
      expect(read(ap), `removed ${removed}`).not.toContain(goneTag);
      expect(orphansOf(p.pack), `removed ${removed}`).toContain(`${goneTag} do.`);
    }
  });

  it("two components whose names slug alike keep their own gap answers, whichever of them is fixed", () => {
    for (const fixed of ["Foo/Bar/Button", "Foo-Bar/Button"]) {
      const p = project([]);
      const control = (name: string): Record<string, unknown> => ({ name, category: "ctl", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["x"], states: ["default", "hover"], scope: "local" });
      editRegistry(p.dir, (r) => { r.components.push(control("Foo/Bar/Button"), control("Foo-Bar/Button")); });
      build(p.dir);
      const ap = join(p.pack, "anti-patterns.md");
      SLOT_AFTER(/^### Gap: Foo\/Bar\/Button has no 'disabled' state$/)(ap, "SLASH-BUTTON");
      SLOT_AFTER(/^### Gap: Foo-Bar\/Button has no 'disabled' state$/)(ap, "DASH-BUTTON");
      editRegistry(p.dir, (r) => { for (const c of r.components) if (c["name"] === fixed) c["states"] = ["default", "hover", "disabled"]; });
      build(p.dir);
      const [keptHeading, keptTag, goneTag] = fixed === "Foo/Bar/Button"
        ? [/^### Gap: Foo-Bar\/Button has no 'disabled' state$/, "DASH-BUTTON", "SLASH-BUTTON"]
        : [/^### Gap: Foo\/Bar\/Button has no 'disabled' state$/, "SLASH-BUTTON", "DASH-BUTTON"];
      expect(sectionUnder(read(ap), keptHeading as RegExp), `fixed ${fixed}`).toContain(`${keptTag as string} do.`);
      expect(read(ap), `fixed ${fixed}`).not.toContain(`${goneTag as string} do.`);
      expect(orphansOf(p.pack), `fixed ${fixed}`).toContain(`${goneTag as string} do.`);
    }
  });

  it("two persona anti-patterns that share their first 48 characters keep their answers when their order changes", () => {
    const p = project([]);
    const setPersona = (texts: string[]): void => {
      const path = join(p.dir, "design", "ds.manifest.json");
      const m = JSON.parse(read(p.dir, "design", "ds.manifest.json")) as { persona: { antiPatterns?: string[] } };
      m.persona.antiPatterns = texts;
      writeFileSync(path, canonicalStringify(m));
    };
    const a = "Never place a decorative gradient banner behind the headline A";
    const b = "Never place a decorative gradient banner behind the headline B";
    setPersona([a, b]);
    build(p.dir);
    const ap = join(p.pack, "anti-patterns.md");
    SLOT_AFTER(/^### Persona anti-pattern: .*headline A$/)(ap, "PERSONA-A");
    SLOT_AFTER(/^### Persona anti-pattern: .*headline B$/)(ap, "PERSONA-B");
    setPersona([b, a]);
    build(p.dir);
    const after = read(ap);
    expect(sectionUnder(after, /^### Persona anti-pattern: .*headline A$/)).toContain("PERSONA-A do.");
    expect(sectionUnder(after, /^### Persona anti-pattern: .*headline B$/)).toContain("PERSONA-B do.");
    expect(orphansOf(p.pack)).toBe("");
  });

  it("a look-alike question whose member set changes does not inherit the old answer", () => {
    const p = project([]);
    build(p.dir);
    const comps = join(p.pack, "components.md");
    fillSlot(comps, /^> QUESTION\(confusable\.card-header[^)]*\)/, answer("OLD-CLUSTER"));
    editRegistry(p.dir, (r) => {
      r.components.push({ name: "Panel/Header", category: "panel", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["default"], states: ["default"], scope: "local" });
    });
    build(p.dir);
    expect(read(comps)).not.toContain("OLD-CLUSTER");
    expect(orphansOf(p.pack)).toContain("OLD-CLUSTER do.");
    expect(read(comps)).toMatch(/`component:Card\/Header`, `component:Modal\/Header`, `component:Panel\/Header`/);
  });
});

describe("2 — answers are harvested only from the files the previous build listed", () => {
  it("an answer whose slot (and whole file) disappears is parked exactly once, however often the pack is rebuilt", () => {
    const p = project(["scenarios"]);
    build(p.dir);
    fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-201\)/, answer("PARK-ME"));
    for (const f of [rulingsFile(p.dir), join(p.dir, "CONVENTIONS.md")]) writeFileSync(f, f.endsWith(".json") ? '{"rulings":[]}' : "# none\n");
    makeGapFree(p.dir);
    for (let i = 0; i < 3; i++) expect(build(p.dir).code).toBe(0);
    expect(existsSync(join(p.pack, "anti-patterns.md"))).toBe(true); // still on disk, but no longer produced
    expect(manifestOf(p.pack)["staleFiles"]).toContain("anti-patterns.md");
    expect(count(orphansOf(p.pack), /^## orphan: ap-ruling-r-201 /gm)).toBe(1);
    expect(manifestOf(p.pack)["orphanedAnswers"]).toBe(1);
  });

  it("a stray markdown copy of a slot cannot override the live answer", () => {
    const p = project([]);
    build(p.dir);
    const comps = join(p.pack, "components.md");
    fillSlot(comps, /^> QUESTION\(confusable\.card-header[^)]*\)/, answer("REAL"));
    writeFileSync(join(p.pack, "aaa.md"), read(comps).replace(/REAL/g, "FAKE"));
    expect(build(p.dir).code).toBe(0);
    expect(read(comps)).toContain("REAL do.");
    expect(read(comps)).not.toContain("FAKE");
    expect(orphansOf(p.pack)).toBe("");
    expect(manifestOf(p.pack)["staleFiles"]).toEqual(["aaa.md"]);
  });
});

describe("3 — writes are staged: a failure never loses an answer or leaves a partial bundle", () => {
  const canChmod = chmodBlocksWrites();
  it.skipIf(!canChmod)("a write failure partway through keeps every answer on disk and reports WRITE_ERROR", () => {
    // (skipped where chmod cannot block writes: running as root, or on Windows)
    const p = project(["rulings"]);
    build(p.dir);
    fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-002\)/, answer("MUST-SURVIVE"));
    writeFileSync(rulingsFile(p.dir), read(p.dir, "design", "knowledge", "rulings.json").replace("never wrap", "do wrap"));
    lock(join(p.pack, "apps", "alpha.md"), 0o444);
    lock(join(p.pack, "apps"), 0o555);
    const r = capture(["ds", "guidelines", "build", "--dir", p.dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { ok: boolean; error: { code: string } })).toMatchObject({ ok: false, error: { code: "WRITE_ERROR" } });
    // The answer is in the parked file or still in the old file — never only in memory.
    expect(orphansOf(p.pack) + read(p.pack, "anti-patterns.md")).toContain("MUST-SURVIVE do.");
    expect(readdirSync(join(p.dir, "design")).filter((f) => f.includes("staging"))).toEqual([]);
  });

  it.skipIf(!canChmod)("a failure before anything is moved into place leaves the pack files untouched, and a retry does not park the answer twice", () => {
    const p = project(["rulings"]);
    build(p.dir);
    fillSlot(join(p.pack, "anti-patterns.md"), /^> QUESTION\(ap-ruling-r-002\)/, answer("KEPT-AS-IS"));
    const snapshot = (): string[] => listFiles(p.pack).filter((f) => f !== "guidelines.orphans.md").map((f) => `${f}\n${read(p.pack, f)}`);
    const before = snapshot();
    writeFileSync(rulingsFile(p.dir), read(p.dir, "design", "knowledge", "rulings.json").replace("never wrap", "do wrap"));
    lock(join(p.dir, "design"), 0o555); // no staging folder can be created next to the pack
    const r = capture(["ds", "guidelines", "build", "--dir", p.dir, "--now", NOW, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("WRITE_ERROR");
    expect(snapshot()).toEqual(before); // every pack file is exactly as it was, answer included
    expect(count(orphansOf(p.pack), /^## orphan: ap-ruling-r-002 /gm)).toBe(1); // parked first, before the failure
    // Clear the fault and retry: the old files still hold the answer, but it is parked only once.
    chmodSync(join(p.dir, "design"), 0o755);
    expect(build(p.dir).code).toBe(0);
    expect(count(orphansOf(p.pack), /^## orphan: ap-ruling-r-002 /gm)).toBe(1);
    expect(read(p.pack, "anti-patterns.md")).not.toContain("KEPT-AS-IS");
  });

  it("export writes the bundle and UPLOAD.md together or not at all", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    mkdirSync(join(out, "UPLOAD.md"), { recursive: true }); // UPLOAD.md cannot be written: it is a directory
    const r = capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("WRITE_ERROR");
    expect(existsSync(join(out, "figma-guidelines"))).toBe(false);
    expect(readdirSync(out)).toEqual(["UPLOAD.md"]); // no staging leftovers
  });
});

describe("4 — the pack does not depend on the machine's locale", () => {
  it("a build under a Danish locale is byte-identical to the default build", () => {
    const cli = join(import.meta.dirname, "..", "dist", "cli.js");
    expect(existsSync(cli), "this test runs the built binary: run `npm run build` first").toBe(true);
    // Names that sort differently under Danish collation ("aa" sorts after "z") in every ordered place:
    // component categories, token scales, other library-wide rulings, glossary terms.
    const p = project([]);
    editRegistry(p.dir, (r) => {
      r.components.push(
        { name: "Aa/Thing", category: "aa", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["x"], states: ["default"], scope: "local" },
        { name: "B/Thing", category: "b", markup: "<i></i>", tokensUsed: ["color.brand"], variants: ["x"], states: ["default"], scope: "local" },
      );
    });
    editTokens(p.dir, (t) => { t["aa"] = { x: { $value: "1px", $type: "dimension" } }; t["b"] = { x: { $value: "2px", $type: "dimension" } }; });
    writeJson(rulingsFile(p.dir), {
      schema: "owner-rulings/1", at: NOW,
      rulings: ["aa-1", "b-1", "z-1"].map((id) => ({ id, category: "notes", text: `Ruling ${id} text.`, scope: "global", source: [], since: "2026-01-01" })),
    });
    writeFileSync(join(p.dir, "CONTEXT.md"), "## Language\n\n**Aa term**:\nFirst term.\n\n**B term**:\nSecond term.\n\n**Z term**:\nThird term.\n");
    const run = (locale: string, out: string): void => {
      const r = spawnSync(process.execPath, [cli, "ds", "guidelines", "build", "--dir", p.dir, "--now", NOW, "--out", out], {
        env: { ...process.env, LC_ALL: locale, LANG: locale, LANGUAGE: locale.split(".")[0] ?? locale }, encoding: "utf8",
      });
      expect(r.status, r.stderr).toBe(0);
    };
    const base = join(tempDir("ease-guidelines-loc-"), "en");
    const danish = join(tempDir("ease-guidelines-loc-"), "da");
    run("en_US.UTF-8", base);
    run("da_DK.UTF-8", danish);
    expect(listFiles(danish)).toEqual(listFiles(base));
    for (const f of listFiles(base)) expect(read(danish, f) === read(base, f), f).toBe(true);
    expect(read(base, "components.md").indexOf("## aa")).toBeLessThan(read(base, "components.md").indexOf("## b"));
    expect(read(base, "terminology.md").indexOf("term:Aa term")).toBeLessThan(read(base, "terminology.md").indexOf("term:Z term"));
    expect(read(base, "rulings.md").indexOf("**aa-1**")).toBeLessThan(read(base, "rulings.md").indexOf("**z-1**"));
    expect(read(base, "vocabulary.md").indexOf("token:aa.x")).toBeLessThan(read(base, "vocabulary.md").indexOf("token:b.x"));
  });
});

describe("5 — colliding colour-pair slugs", () => {
  it("two failing pairs whose names slug alike build, with distinct stable ids and their own answers", () => {
    const p = project([]);
    editTokens(p.dir, (t) => {
      const color = t["color"] as Record<string, Record<string, unknown>>;
      for (const name of ["a-b", "a_b"]) {
        color[name] = { $value: "#FFFFFF", $type: "color" };
        color[`${name}-text`] = { $value: "#EEEEEE", $type: "color" };
      }
    });
    const first = build(p.dir);
    expect(first.code, first.out).toBe(0);
    const ids = (manifestOf(p.pack)["rules"] as { id: string }[]).map((r) => r.id).filter((id) => id.startsWith("vocabulary.pair."));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => /color-a-b-text/.test(id))).toHaveLength(2);
    const slots = (manifestOf(p.pack)["slots"] as { id: string }[]).map((s) => s.id).filter((id) => id.startsWith("ap-gap.a11y.color-a-b-text"));
    expect(slots).toHaveLength(2);
    const ap = join(p.pack, "anti-patterns.md");
    SLOT_AFTER(/^### Gap: color\.a-b-text on color\.a-b fails AA$/)(ap, "DASH-PAIR");
    SLOT_AFTER(/^### Gap: color\.a_b-text on color\.a_b fails AA$/)(ap, "UNDER-PAIR");
    const again = build(p.dir);
    expect(again.code).toBe(0);
    expect(sectionUnder(read(ap), /^### Gap: color\.a-b-text on color\.a-b fails AA$/)).toContain("DASH-PAIR do.");
    expect(sectionUnder(read(ap), /^### Gap: color\.a_b-text on color\.a_b fails AA$/)).toContain("UNDER-PAIR do.");
    expect(capture(["ds", "guidelines", "check", "--dir", p.dir]).code).toBe(0);
    // Fix the a-b pair: a_b keeps its own answer; a-b's answer is parked, not handed to a_b.
    editTokens(p.dir, (t) => { (t["color"] as Record<string, Record<string, unknown>>)["a-b-text"]!["$value"] = "#000000"; });
    expect(build(p.dir).code).toBe(0);
    expect(sectionUnder(read(ap), /^### Gap: color\.a_b-text on color\.a_b fails AA$/)).toContain("UNDER-PAIR do.");
    expect(read(ap)).not.toContain("DASH-PAIR do.");
    expect(orphansOf(p.pack)).toContain("DASH-PAIR do.");
  });
});

describe("6 — an unreadable bundle file is a READ_ERROR, not an internal error", () => {
  it.skipIf(!chmodBlocksWrites())("check --profile figma reports it as a structured error", () => {
    // (skipped where chmod cannot block access: running as root, or on Windows)
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const out = join(tempDir("ease-guidelines-out-"), "export");
    expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
    lock(join(out, "figma-guidelines", "vocabulary.md"), 0o000);
    const r = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", join(out, "figma-guidelines"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ ok: false, error: { code: "READ_ERROR" } });
  });
});

