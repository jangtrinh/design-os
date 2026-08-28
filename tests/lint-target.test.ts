/**
 * Phase 03's paired test: the entry door.
 *
 * The contract is not "it finds files". It is that nothing leaves the resolver
 * unaccounted for — a path with no extractor is SKIPPED with a reason, a walk
 * that hits its budget SAYS so, and two runs over the same tree agree exactly.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { resolveTargets, describeResolution } from "../src/core/lint-target.js";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "lint-target-"));
  const w = (rel: string, body = "x") => {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  w("index.html");
  w("styles.css");
  w("src/App.tsx");
  w("src/Widget.vue");
  w("ios/ContentView.swift");
  w("flutter/home_page.dart");
  w("README.md");
  w("Makefile");
  w("assets/logo.png");
  // Directories that must never be descended.
  w("node_modules/pkg/index.html");
  w(".venv/lib/site.html");
  w("dist/bundle.html");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("resolveTargets", () => {
  it("routes each language to its extractor", () => {
    const r = resolveTargets([root]);
    const byName = Object.fromEntries(r.targets.map((t) => [basename(t.path), t.extractorId]));
    expect(byName).toMatchObject({
      "index.html": "html-cascade",
      "App.tsx": "jsx-tailwind",
      "Widget.vue": "sfc",
      "ContentView.swift": "swiftui",
      "home_page.dart": "flutter",
      "styles.css": "css-only",
    });
  });

  it("marks the line-scanner tiers as an undercount so a low count never reads as clean", () => {
    const r = resolveTargets([root]);
    const swift = r.targets.find((t) => basename(t.path) === "ContentView.swift");
    const html = r.targets.find((t) => basename(t.path) === "index.html");
    expect(swift?.undercount).toBe(true);
    expect(html?.undercount).toBe(false);
  });

  it("SKIPS unclaimed extensions with a reason instead of dropping them", () => {
    const r = resolveTargets([root]);
    const skippedNames = r.skipped.map((s) => basename(s.path));
    expect(skippedNames).toContain("README.md");
    expect(skippedNames).toContain("logo.png");
    expect(skippedNames).toContain("Makefile");
    for (const s of r.skipped) expect(s.reason).not.toBe("");
    expect(r.skipped.find((s) => basename(s.path) === "Makefile")?.reason)
      .toBe("no file extension");
  });

  it("never descends node_modules, .venv or dist", () => {
    const r = resolveTargets([root]);
    const all = [...r.targets.map((t) => t.path), ...r.skipped.map((s) => s.path)].join("\n");
    expect(all).not.toContain("node_modules");
    expect(all).not.toContain(".venv");
    expect(all).not.toContain(`${"dist"}/bundle`);
  });

  it("accepts a single file as the degenerate case of the same path", () => {
    const r = resolveTargets([join(root, "index.html")]);
    expect(r.targets).toHaveLength(1);
    expect(r.targets[0]?.extractorId).toBe("html-cascade");
  });

  it("accepts a glob and resolves it against the same walk", () => {
    const r = resolveTargets([join(root, "**/*.swift")]);
    expect(r.targets.map((t) => basename(t.path))).toEqual(["ContentView.swift"]);
  });

  it("reports a non-existent path rather than silently finding nothing", () => {
    const r = resolveTargets([join(root, "nope")]);
    expect(r.targets).toEqual([]);
    expect(r.skipped[0]?.reason).toBe("path does not exist");
  });

  it("collapses duplicates and orders deterministically", () => {
    const a = resolveTargets([root, root, join(root, "src")]);
    const b = resolveTargets([join(root, "src"), root]);
    expect(a.targets.map((t) => t.path)).toEqual(b.targets.map((t) => t.path));
    expect(new Set(a.targets.map((t) => t.path)).size).toBe(a.targets.length);
  });

  it("summarises what it did and did not look at", () => {
    const line = describeResolution(resolveTargets([root]));
    expect(line).toMatch(/file\(s\)/);
    expect(line).toMatch(/UNDERCOUNT/);
    expect(line).toMatch(/skipped/);
  });
});

/**
 * The budget cap is the one path where the walk's INTERNAL ordering matters.
 *
 * Output is sorted at the end, so dropping the per-directory `.sort()` leaves
 * every ordering assertion green — the first version of this suite proved that
 * by staying green when the sort was deleted. What the sort actually guarantees
 * is that when the cap truncates, the SAME files survive on every run. Untested,
 * that is a silent cap: a truncated walk that reads as "covered everything".
 */
describe("budget cap", () => {
  let big: string;

  beforeAll(() => {
    big = mkdtempSync(join(tmpdir(), "lint-target-big-"));
    // One over the 4000-entry cap, named so sorted order differs from creation order.
    for (let i = 0; i < 4100; i++) writeFileSync(join(big, `f${String(i).padStart(5, "0")}.html`), "x");
  });

  afterAll(() => rmSync(big, { recursive: true, force: true }));

  it("declares the truncation instead of quietly covering less", () => {
    const r = resolveTargets([big]);
    expect(r.truncated).toBe(true);
    expect(r.droppedNote).toContain("NOT examined");
    expect(describeResolution(r)).toContain("TRUNCATED");
  });

  it("truncates to the SAME files even when the filesystem hands them back shuffled", () => {
    // APFS returns these names already sorted, so a real readdir cannot prove
    // the walk's own ordering. Hand it a deliberately shuffled reader instead.
    const shuffled = (dir: string): string[] => readdirSync(dir).slice().reverse();
    const a = resolveTargets([big], process.cwd(), { readDir: shuffled }).targets.map((t) => basename(t.path));
    const b = resolveTargets([big]).targets.map((t) => basename(t.path));
    expect(a).toEqual(b);
    expect(a[0]).toBe("f00000.html");
  });

  it("truncates to the SAME files on every run", () => {
    const a = resolveTargets([big]).targets.map((t) => basename(t.path));
    const b = resolveTargets([big]).targets.map((t) => basename(t.path));
    expect(a).toEqual(b);
    // Sorted order, so the survivors are the alphabetically-first ones — a
    // property that holds only because the walk itself is ordered.
    expect(a[0]).toBe("f00000.html");
    expect(a.length).toBeLessThan(4100);
  });
});
