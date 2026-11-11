/**
 * AC-25: the walk honours the owner's scan rulings, read from `onboard.rulings` only: a directory ruled `skip` by the
 * scan-budget question is not entered, an app root ruled `drop` by the app-roots question is not walked, a root ruled
 * `keep` prunes nothing, and a root no ruling covers is walked and named as not ruled yet. With no ruling the walk is
 * byte-for-byte the walk it was.
 */
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { appendRulings } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { MAX_ENTRIES, SKIP_DIRS, scanProject } from "../src/core/project-scan.js";
import { NO_SCAN_RULINGS, scanRulingsOf } from "../src/core/project-scan-rulings.js";
import { ui } from "./ksync-helpers.js";
import { V4_CSS, wideAppProject, writeFiles } from "./scan-wide-app-fixture.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const wide = (): string => { const r = wideAppProject({ wideDirs: 45, filesPerDir: 100 }); dirs.push(r); return r; };
const pkg = (deps: Record<string, string>): string => JSON.stringify({ name: "x", dependencies: deps });
const tmp = (name: string): string => { const r = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), name)); dirs.push(r); return r; };
const comps = (base: string): Record<string, string> => ({ [`${base}/components/a.tsx`]: "", [`${base}/components/b.tsx`]: "", [`${base}/components/c.tsx`]: "" });
const twoApps = (): string => {
  const r = tmp("scan-two-apps-");
  writeFiles(r, { "apps/web/package.json": pkg({ next: "15" }), "apps/web/styles.css": V4_CSS, ...comps("apps/web"), "apps/examples/package.json": pkg({ react: "19" }), ...comps("apps/examples") });
  return r;
};
const ruling = (kind: "scan-budget" | "app-roots", members: Record<string, string>, choice: string | string[]): Ruling => ({
  kind, fingerprint: fingerprintOf(kind, Object.keys(members)), choice, covers: Object.keys(members), members, actor: "owner", at: "2026-11-11T09:00:00Z",
});
const roots = (members: Record<string, "keep" | "drop">): Ruling => ruling("app-roots", members, Object.keys(members).map((m) => `member:${m}`));
type Scan = ReturnType<typeof scanProject>;
const scanOf = (root: string): Scan => JSON.parse(ui(["scan", "--cwd", root, "--json"]).stdout).data as Scan;
const appPaths = (r: Scan): string[] => r.apps.map((a) => a.path);

describe("ui scan with no ruling", () => {
  it("is the walk it was: the default argument and an explicit empty ruling give identical results, and the output has no honoured field", () => {
    const root = wide();
    expect(JSON.stringify(scanProject(root, NO_SCAN_RULINGS))).toBe(JSON.stringify(scanProject(root)));
    const data = scanOf(root) as unknown as Record<string, unknown>;
    expect(data["honoured"]).toBeUndefined();
    expect(data["truncated"]).toBe(true);
  });
  it("a readable manifest with no ruling in it changes nothing", () => {
    const root = twoApps();
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design", "design-dir.json"), JSON.stringify({ version: 1 }));
    const before = ui(["scan", "--cwd", root, "--json"]).stdout;
    writeFileSync(join(root, "design", "design-dir.json"), JSON.stringify({ version: 2, onboard: { rulings: [] } }));
    expect(ui(["scan", "--cwd", root, "--json"]).stdout).toBe(before);
  });
  it("SKIP_DIRS is not extended: the walk skips exactly the directories it always skipped", () => {
    expect([...SKIP_DIRS].sort()).toEqual([".agent", ".cache", ".claude", ".git", ".next", ".turbo", ".venv", "__pycache__", "build", "coverage", "design", "dist", "node_modules", "out", "venv", "vendor"].sort());
  });
});

describe("a scan-budget ruling", () => {
  it("skip: the directory is not walked, the capped walk is no longer truncated, and the output names what was honoured", () => {
    const root = wide();
    appendRulings(root, [ruling("scan-budget", { zdata: "skip" }, "skip:zdata")]);
    expect(scanRulingsOf(root).skip).toEqual(["zdata"]);
    const r = scanOf(root);
    expect(r.truncated).toBe(false);
    expect(r.budget).toEqual([]);
    expect(r.visited).toBeLessThan(MAX_ENTRIES);
    expect(r.honoured).toEqual({ skip: ["zdata"], roots: [], dropped: [], unruled: [] });
    expect(appPaths(r)).toEqual(["apps/web"]);
  });
  it("keep leaves the walk as it was, and the truncation is still reported", () => {
    const root = wide();
    appendRulings(root, [ruling("scan-budget", { zdata: "keep" }, "keep-all")]);
    expect(scanRulingsOf(root).skip).toEqual([]);
    expect(scanProject(root, scanRulingsOf(root)).truncated).toBe(true);
  });
  it("only the named project-relative directory is skipped, not every directory of that name", () => {
    const root = tmp("scan-skip-");
    writeFiles(root, { "assets/a.css": "", "apps/assets/b.css": "", "package.json": "{}" });
    appendRulings(root, [ruling("scan-budget", { assets: "skip" }, "skip:assets")]);
    expect(scanProject(root, scanRulingsOf(root)).cssFiles.map((f) => f.path)).toEqual(["apps/assets/b.css"]);
  });
  it("the retired onboard.scan fields are read by nothing", () => {
    const root = wide();
    mkdirSync(join(root, "design"), { recursive: true });
    writeFiles(root, { "design/design-dir.json": JSON.stringify({ version: 2, onboard: { rulings: [], scan: { skip: ["zdata"], roots: ["apps/web"] } } }) });
    expect(scanProject(root, scanRulingsOf(root)).truncated).toBe(true);
    expect(scanRulingsOf(root)).toEqual({ skip: [], keepRoots: [], dropRoots: [] });
  });
});

describe("an app-roots ruling prunes exactly the roots ruled drop, by id", () => {
  it("drop is not walked: it leaves apps[], component dirs and the walk, and is named as left out", () => {
    const root = twoApps();
    expect(appPaths(scanProject(root))).toEqual(["apps/examples", "apps/web"]);
    appendRulings(root, [roots({ "apps/examples": "drop", "apps/web": "keep" })]);
    const r = scanOf(root);
    expect(appPaths(r)).toEqual(["apps/web"]);
    expect(r.componentDirs.map((d) => d.path)).toEqual(["apps/web/components"]);
    expect(r.honoured).toEqual({ skip: [], roots: ["apps/web"], dropped: ["apps/examples"], unruled: [] });
  });
  it("keep alone prunes nothing: a root with no ruling is walked, listed, and named as not ruled yet with the next action", () => {
    const root = twoApps();
    appendRulings(root, [roots({ "apps/web": "keep" })]);
    const r = scanOf(root);
    expect(appPaths(r)).toEqual(["apps/examples", "apps/web"]);
    expect(r.honoured!.unruled).toEqual(["apps/examples"]);
    const text = ui(["scan", "--cwd", root]).stdout;
    expect(text).toContain("app roots with no ruling yet (walked): apps/examples. Next: ui onboard questions");
  });
  it("a third root that appeared after the answer is walked and named as not ruled yet", () => {
    const root = twoApps();
    appendRulings(root, [roots({ "apps/examples": "drop", "apps/web": "keep" })]);
    writeFiles(root, { "packages/ui/package.json": pkg({ react: "19" }), ...comps("packages/ui") });
    const r = scanOf(root);
    expect(appPaths(r)).toEqual(["apps/web", "packages/ui"]);
    expect(r.honoured!.unruled).toEqual(["packages/ui"]);
    expect(r.honoured!.dropped).toEqual(["apps/examples"]);
  });
  it("review individually with every root dropped is honoured: none is walked, and the verdict never appears without the statement", () => {
    const root = twoApps();
    appendRulings(root, [roots({ "apps/examples": "drop", "apps/web": "drop" })]);
    const r = scanOf(root);
    expect(appPaths(r)).toEqual([]);
    expect(r.componentDirs).toEqual([]);
    expect(r.honoured!.dropped).toEqual(["apps/examples", "apps/web"]);
    const lines = ui(["scan", "--cwd", root]).stdout.trimEnd().split("\n");
    expect(lines[lines.length - 1]).toMatch(/^verdict: greenfield/);
    expect(lines[lines.length - 2]).toBe("app roots left out by the owner's ruling, not walked: apps/examples, apps/web");
  });
  it("a kept root that was renamed is a new member that no ruling covers: it is walked and named, never pruned", () => {
    const root = twoApps();
    appendRulings(root, [roots({ "apps/examples": "drop", "apps/web": "keep" })]);
    renameSync(join(root, "apps", "web"), join(root, "apps", "site"));
    const r = scanOf(root);
    expect(appPaths(r)).toEqual(["apps/site"]);
    expect(r.honoured!.unruled).toEqual(["apps/site"]);
    expect(ui(["scan", "--cwd", root]).stdout).not.toContain("verdict: greenfield");
  });
  it("a root ruled keep under a root ruled drop is walked, and nothing else of the dropped root is", () => {
    const root = tmp("scan-nested-");
    writeFiles(root, { "apps/outer/package.json": pkg({ react: "19" }), ...comps("apps/outer"), "apps/outer/inner/package.json": pkg({ vue: "3" }), ...comps("apps/outer/inner"), "apps/outer/other/package.json": pkg({ react: "19" }) });
    appendRulings(root, [roots({ "apps/outer": "drop", "apps/outer/inner": "keep" })]);
    const r = scanOf(root);
    expect(appPaths(r)).toEqual(["apps/outer/inner"]);
    expect(r.componentDirs.map((d) => d.path)).toEqual(["apps/outer/inner/components"]);
  });
  it("a root inside a dropped root that is not itself ruled is not walked", () => {
    const root = tmp("scan-inside-drop-");
    writeFiles(root, { "apps/outer/package.json": pkg({ react: "19" }), "apps/outer/inner/package.json": pkg({ vue: "3" }), "other/package.json": pkg({ react: "19" }) });
    appendRulings(root, [roots({ "apps/outer": "drop" })]);
    expect(appPaths(scanOf(root))).toEqual(["other"]);
  });
});

describe("ui scan with a manifest that cannot be read", () => {
  it("exits 0, walks as if there were no ruling, and says so with the reason and the next action", () => {
    const root = twoApps();
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design", "design-dir.json"), "{ not json");
    const json = ui(["scan", "--cwd", root, "--json"]);
    expect(json.exitCode).toBe(0);
    const r = (JSON.parse(json.stdout) as { data: Scan }).data;
    expect(appPaths(r)).toEqual(["apps/examples", "apps/web"]);
    expect(r.honoured!.unreadable).toContain("not valid JSON");
    const text = ui(["scan", "--cwd", root]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("owner rulings not honoured: design/design-dir.json cannot be read");
    expect(text.stdout).toContain("Next: ui onboard shows the manifest error");
  });
});
