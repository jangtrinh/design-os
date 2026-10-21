import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerAll, build, capture, cleanScratch, listFiles, manifestOf, project, read, tempDir,
} from "./helpers/guidelines-harness.js";

afterEach(cleanScratch);

interface Finding { code: string; severity: string; file: string; line: number; message: string }
interface ProfileData { profile: string; filesChecked: number; totalBytes: number; errorCount: number; warningCount: number; findings: Finding[] }
const profileCheck = (bundle: string, extra: string[] = []): { code: number; data: ProfileData } => {
  const r = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", bundle, ...extra, "--json"]);
  return { code: r.code, data: (JSON.parse(r.out) as { data: ProfileData }).data };
};

/** A freshly exported, valid bundle folder. */
function exportedBundle(): { dir: string; bundle: string; out: string } {
  const p = project();
  expect(build(p.dir).code).toBe(0);
  answerAll(p.pack);
  const out = join(tempDir("ease-guidelines-prof-"), "export");
  expect(capture(["ds", "guidelines", "export", "--dir", p.dir, "--target", "figma", "--out", out]).code).toBe(0);
  return { dir: p.dir, bundle: join(out, "figma-guidelines"), out };
}

describe("check --profile figma (G-EXPORT-LIMITS)", () => {
  it("an exported bundle is clean, and the check needs no design system", () => {
    const { bundle } = exportedBundle();
    const r = profileCheck(bundle);
    expect(r.code).toBe(0);
    expect(r.data).toMatchObject({ profile: "figma", filesChecked: 8, errorCount: 0, warningCount: 0, findings: [] });
    expect(r.data.totalBytes).toBeGreaterThan(5_000);
  });

  it("a 9th file is BUNDLE_FILE_COUNT", () => {
    const { bundle } = exportedBundle();
    writeFileSync(join(bundle, "extra.md"), "# Extra\n");
    const r = profileCheck(bundle);
    expect(r.code).toBe(1);
    expect(r.data.findings).toEqual([expect.objectContaining({ code: "BUNDLE_FILE_COUNT", severity: "error", message: "bundle has 9 file(s); Figma accepts 3 to 8" })]);
  });

  it("fewer than 3 files is BUNDLE_FILE_COUNT too", () => {
    const { bundle } = exportedBundle();
    for (const f of listFiles(bundle).slice(2)) rmSync(join(bundle, f));
    expect(profileCheck(bundle).data.findings.map((f) => f.message)).toEqual(["bundle has 2 file(s); Figma accepts 3 to 8"]);
  });

  it("a .yaml file is BUNDLE_EXTENSION at that file; .md, .txt and .json are accepted", () => {
    const { bundle } = exportedBundle();
    rmSync(join(bundle, "terminology.md"));
    rmSync(join(bundle, "grammar.md"));
    rmSync(join(bundle, "rulings.md"));
    writeFileSync(join(bundle, "data.json"), "{}\n");
    writeFileSync(join(bundle, "notes.txt"), "plain\n");
    writeFileSync(join(bundle, "notes.yaml"), "a: 1\n");
    const r = profileCheck(bundle);
    expect(r.code).toBe(1);
    expect(r.data.findings).toEqual([
      expect.objectContaining({ code: "BUNDLE_EXTENSION", severity: "error", file: "notes.yaml", line: 1, message: "extension '.yaml' is not accepted by Figma (.md, .txt, .json only)" }),
    ]);
    const text = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", bundle]);
    expect(text.out).toMatch(/^ds guidelines check --profile figma: .*figma-guidelines — 1 error\(s\)$/m);
    expect(text.out).toMatch(/^ {2}✗ \[BUNDLE_EXTENSION\] notes\.yaml:1: extension '\.yaml' is not accepted/m);
  });

  it("an open or partial slot in the bundle is an OPEN_QUESTION error at its line", () => {
    const { bundle } = exportedBundle();
    const file = join(bundle, "anti-patterns.md");
    const before = read(bundle, "anti-patterns.md");
    writeFileSync(file, `${before}\n> QUESTION(planted.open): Still unanswered?\n\n> QUESTION(planted.partial): Half answered?\n**Do:** only this.\n`);
    const base = before.split("\n").length + 1;
    const r = profileCheck(bundle);
    expect(r.code).toBe(1);
    expect(r.data.findings.map((f) => `${f.code}:${f.file}:${f.line}`)).toEqual([`OPEN_QUESTION:anti-patterns.md:${base}`, `OPEN_QUESTION:anti-patterns.md:${base + 2}`]);
    expect(r.data.findings[0]?.message).toContain("'planted.open'");
  });

  it("over 100 KB warns, over 200 KB is BUDGET_EXCEEDED with per-file bytes", () => {
    const { bundle } = exportedBundle();
    const file = join(bundle, "vocabulary.md");
    const base = read(bundle, "vocabulary.md");
    writeFileSync(file, `${base}\n${"x".repeat(100_000)}\n`);
    const warn = profileCheck(bundle);
    expect(warn.code).toBe(0);
    expect(warn.data.findings).toEqual([expect.objectContaining({ code: "OVER_SOFT_BUDGET", severity: "warning", message: expect.stringMatching(/^bundle is [\d,]+ bytes; Figma recommends staying under 100,000$/) })]);
    writeFileSync(file, `${base}\n${"x".repeat(200_000)}\n`);
    const over = profileCheck(bundle);
    expect(over.code).toBe(1);
    expect(over.data.findings).toEqual([expect.objectContaining({ code: "BUDGET_EXCEEDED", severity: "error", message: expect.stringMatching(/^bundle is [\d,]+ bytes, over Figma's 200,000-byte cap — vocabulary\.md [\d,]+ B; /) })]);
  });

  it("flag misuse: --bundle needs --profile figma, --profile figma needs --bundle, and a missing folder is named", () => {
    const { bundle } = exportedBundle();
    for (const args of [
      ["check", "--bundle", bundle],
      ["check", "--profile", "figma"],
      ["check", "--profile", "sketch", "--bundle", bundle],
    ]) {
      const r = capture(["ds", "guidelines", ...args, "--json"]);
      expect(r.code, args.join(" ")).toBe(1);
      expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
    }
    const missing = capture(["ds", "guidelines", "check", "--profile", "figma", "--bundle", join(bundle, "nope"), "--json"]);
    expect((JSON.parse(missing.out) as { error: { code: string } }).error.code).toBe("BUNDLE_NOT_FOUND");
  });
});

describe("stale files (build never deletes)", () => {
  it("a file in the pack folder that this build did not produce is listed in staleFiles, and check warns STALE_FILE", () => {
    const { dir, pack } = (() => { const p = project(); build(p.dir); return p; })();
    mkdirSync(join(pack, "apps"), { recursive: true });
    mkdirSync(join(pack, "notes"), { recursive: true });
    writeFileSync(join(pack, "apps", "gone.md"), "# Gone\n\nSee `component:Nope/Missing`.\n");
    writeFileSync(join(pack, "old-notes.txt"), "notes\n");
    writeFileSync(join(pack, "notes", "x.yaml"), "a: 1\n");
    writeFileSync(join(pack, "guidelines.orphans.md"), "# Orphaned answers\n");

    const rebuilt = capture(["ds", "guidelines", "build", "--dir", dir, "--now", "2026-10-15T00:00:00Z"]);
    expect(rebuilt.code).toBe(0);
    expect(manifestOf(pack)["staleFiles"]).toEqual(["apps/gone.md", "notes/x.yaml", "old-notes.txt"]);
    expect(rebuilt.out).toMatch(/^stale apps\/gone\.md: not produced by this build$/m);
    // The orphans file and the manifest are never stale; build deletes nothing.
    expect(listFiles(pack)).toEqual(expect.arrayContaining(["apps/gone.md", "old-notes.txt", "notes/x.yaml", "guidelines.orphans.md"]));

    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const findings = (JSON.parse(r.out) as { data: { findings: Finding[] } }).data.findings.filter((f) => f.code === "STALE_FILE");
    expect(findings.map((f) => `${f.severity}:${f.file}:${f.line}`)).toEqual(["warning:apps/gone.md:1", "warning:notes/x.yaml:1", "warning:old-notes.txt:1"]);
    expect(findings[0]?.message).toMatch(/not listed in the manifest/);
    // A stale markdown file is not linted: its invented name is not an error.
    expect((JSON.parse(r.out) as { data: { findings: Finding[] } }).data.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("a file a build stops producing becomes stale (and stops being stale when it is produced again or removed)", () => {
    const p = project(["rulings"]);
    build(p.dir);
    expect(manifestOf(p.pack)["staleFiles"]).toEqual([]);
    const rulings = join(p.dir, "design", "knowledge", "rulings.json");
    const saved = read(rulings);
    rmSync(rulings);
    build(p.dir);
    expect(manifestOf(p.pack)["staleFiles"]).toEqual(["apps/alpha.md", "apps/beta.md", "rulings.md"]);
    writeFileSync(rulings, saved);
    build(p.dir);
    expect(manifestOf(p.pack)["staleFiles"]).toEqual([]);
    rmSync(rulings);
    build(p.dir);
    for (const f of ["apps/alpha.md", "apps/beta.md", "rulings.md"]) rmSync(join(p.pack, f));
    build(p.dir);
    expect(manifestOf(p.pack)["staleFiles"]).toEqual([]);
  });
});
