/**
 * AC-25: the walk honours the owner's scan rulings (`onboard.scan.skip`, `onboard.scan.roots`, and the scan-budget and
 * app-roots rulings that stand behind them), and with no ruling it is byte-for-byte the walk it was.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const twoApps = (): string => {
  const r = mkdtempSync(join(tmpdir(), "scan-two-apps-")); dirs.push(r);
  writeFiles(r, {
    "apps/web/package.json": pkg({ next: "15" }), "apps/web/styles.css": V4_CSS,
    "apps/web/components/a.tsx": "", "apps/web/components/b.tsx": "", "apps/web/components/c.tsx": "",
    "apps/examples/package.json": pkg({ react: "19" }),
    "apps/examples/components/a.tsx": "", "apps/examples/components/b.tsx": "", "apps/examples/components/c.tsx": "",
  });
  return r;
};
const manifest = (root: string, scan: Record<string, unknown>): void => {
  mkdirSync(join(root, "design"), { recursive: true });
  writeFileSync(join(root, "design", "design-dir.json"), JSON.stringify({ version: 2, onboard: { rulings: [], scan } }));
};
const ruling = (kind: "scan-budget" | "app-roots", members: Record<string, string>, choice: string | string[]): Ruling => ({
  kind, fingerprint: fingerprintOf(kind, Object.keys(members)), choice, covers: Object.keys(members), members, actor: "owner", at: "2026-11-11T09:00:00Z",
});

describe("ui scan with no ruling", () => {
  it("is the walk it was: the default argument and an explicit empty ruling give identical results, and the output has no honoured field", () => {
    const root = wide();
    expect(JSON.stringify(scanProject(root, NO_SCAN_RULINGS))).toBe(JSON.stringify(scanProject(root)));
    const data = (JSON.parse(ui(["scan", "--cwd", root, "--json"]).stdout) as { data: Record<string, unknown> }).data;
    expect(data["honoured"]).toBeUndefined();
    expect(data["truncated"]).toBe(true);
  });
  it("SKIP_DIRS is not extended: the walk skips exactly the directories it always skipped", () => {
    expect([...SKIP_DIRS].sort()).toEqual([".agent", ".cache", ".claude", ".git", ".next", ".turbo", ".venv", "__pycache__", "build", "coverage", "design", "dist", "node_modules", "out", "venv", "vendor"].sort());
  });
});

describe("onboard.scan.skip", () => {
  it("a skipped directory is not walked: the capped walk is no longer truncated and the budget goes", () => {
    const root = wide();
    manifest(root, { skip: ["zdata"], roots: [] });
    const r = JSON.parse(ui(["scan", "--cwd", root, "--json"]).stdout).data as ReturnType<typeof scanProject> & { honoured: { skip: string[] } };
    expect(r.truncated).toBe(false);
    expect(r.budget).toEqual([]);
    expect(r.visited).toBeLessThan(MAX_ENTRIES);
    expect(r.honoured).toEqual({ skip: ["zdata"], roots: [] });
    expect(r.apps.map((a) => a.path)).toEqual(["apps/web"]);
  });
  it("a scan-budget ruling that says skip is honoured without anything else written to the manifest", () => {
    const root = wide();
    appendRulings(root, [ruling("scan-budget", { zdata: "skip" }, "skip:zdata")]);
    expect(scanRulingsOf(root)).toEqual({ skip: ["zdata"], keepRoots: [] });
    expect(scanProject(root, scanRulingsOf(root)).truncated).toBe(false);
  });
  it("a scan-budget ruling that says keep leaves the walk as it was, and the truncation is still reported", () => {
    const root = wide();
    appendRulings(root, [ruling("scan-budget", { zdata: "keep" }, "keep-all")]);
    expect(scanRulingsOf(root).skip).toEqual([]);
    expect(scanProject(root, scanRulingsOf(root)).truncated).toBe(true);
  });
  it("only the named project-relative directory is skipped, not every directory of that name", () => {
    const root = mkdtempSync(join(tmpdir(), "scan-skip-")); dirs.push(root);
    writeFiles(root, { "assets/a.css": "", "apps/assets/b.css": "", "package.json": "{}" });
    manifest(root, { skip: ["assets"], roots: [] });
    expect(scanProject(root, scanRulingsOf(root)).cssFiles.map((f) => f.path)).toEqual(["apps/assets/b.css"]);
  });
});

describe("onboard.scan.roots", () => {
  it("an app root that is not kept is not walked: it leaves apps[] and component dirs", () => {
    const root = twoApps();
    expect(scanProject(root).apps.map((a) => a.path)).toEqual(["apps/examples", "apps/web"]);
    manifest(root, { skip: [], roots: ["apps/web"] });
    const r = scanProject(root, scanRulingsOf(root));
    expect(r.apps.map((a) => a.path)).toEqual(["apps/web"]);
    expect(r.componentDirs.map((d) => d.path)).toEqual(["apps/web/components"]);
  });
  it("an app-roots ruling is honoured: keep stays, drop is pruned", () => {
    const root = twoApps();
    appendRulings(root, [ruling("app-roots", { "apps/examples": "drop", "apps/web": "keep" }, ["member:apps/web"])]);
    expect(scanRulingsOf(root).keepRoots).toEqual(["apps/web"]);
    expect(scanProject(root, scanRulingsOf(root)).apps.map((a) => a.path)).toEqual(["apps/web"]);
  });
  it("a nested app inside a kept root stays, and the parent of a kept root is not pruned", () => {
    const root = mkdtempSync(join(tmpdir(), "scan-nested-")); dirs.push(root);
    writeFiles(root, { "apps/outer/package.json": pkg({ react: "19" }), "apps/outer/inner/package.json": pkg({ vue: "3" }), "other/package.json": pkg({ react: "19" }) });
    manifest(root, { skip: [], roots: ["apps/outer"] });
    expect(scanProject(root, scanRulingsOf(root)).apps.map((a) => a.path)).toEqual(["apps/outer", "apps/outer/inner"]);
    manifest(root, { skip: [], roots: ["apps/outer/inner"] });
    expect(scanProject(root, scanRulingsOf(root)).apps.map((a) => a.path)).toEqual(["apps/outer", "apps/outer/inner"]);
  });
});

describe("ui scan with a broken manifest", () => {
  it("is refused with BAD_MANIFEST, never walked as if there were no ruling", () => {
    const root = wide();
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design", "design-dir.json"), "{ not json");
    const r = ui(["scan", "--cwd", root, "--json"]);
    expect(r.exitCode).toBe(1);
    expect((JSON.parse(r.stdout) as { error: { code: string } }).error.code).toBe("BAD_MANIFEST");
  });
});
