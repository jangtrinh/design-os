/**
 * `ui scan` honest reporting: nested app roots, Tailwind v4 CSS-first detection,
 * budget attribution on a capped walk, dot-directories skipped as a class.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_ENTRIES, scanProject } from "../src/core/project-scan.js";
import { ui } from "./ksync-helpers.js";
import { V4_CSS, wideAppProject, writeFiles } from "./scan-wide-app-fixture.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const wide = (o: { wideDirs: number; filesPerDir: number }): string => { const r = wideAppProject(o); dirs.push(r); return r; };
const proj = (files: Record<string, string>): string => {
  const r = mkdtempSync(join(tmpdir(), "scan-apps-")); dirs.push(r); writeFiles(r, files); return r;
};
const pkg = (deps: Record<string, string>): string => JSON.stringify({ name: "x", dependencies: deps });

describe("ui scan — nested app roots (wide tracked directory + app two levels down)", () => {
  it("capped walk: the app is reported with framework and Tailwind v4 CSS, and budget[0] is the wide directory", () => {
    const r = scanProject(wide({ wideDirs: 45, filesPerDir: 100 }));
    expect(r.truncated).toBe(true);
    expect(r.visited).toBe(MAX_ENTRIES);
    expect(r.apps).toHaveLength(1);
    expect(r.apps[0]).toMatchObject({ path: "apps/web", framework: "next", tailwindConfig: null, tailwindCss: "apps/web/styles.css" });
    expect(r.apps[0]!.styling).toEqual(["tailwind", "css"]);
    expect(r.budget[0]!.dir).toBe("zdata");
    expect(r.budget[0]!.visited).toBeGreaterThan(MAX_ENTRIES / 2);
    expect(r.budget.length).toBeLessThanOrEqual(5);
  });

  it("uncapped walk: no budget, and componentDirs are reported per app as well as globally", () => {
    const r = scanProject(wide({ wideDirs: 2, filesPerDir: 5 }));
    expect(r.truncated).toBe(false);
    expect(r.budget).toEqual([]);
    expect(r.apps[0]!.componentDirs).toEqual([{ path: "apps/web/components", files: 3 }]);
    expect(r.componentDirs).toEqual([{ path: "apps/web/components", files: 3 }]);
  });

  it("the scan root's own fields keep their meaning: the root package.json drives framework, not the app", () => {
    const r = scanProject(wide({ wideDirs: 1, filesPerDir: 1 }));
    expect(r.framework).toBeNull(); // the root package.json has no deps; the app's `next` stays under apps[]
    expect(r.tailwindCss).toBeNull();
  });

  it("text output names the largest consumer with the next action, and lists the app", () => {
    const root = wide({ wideDirs: 45, filesPerDir: 100 });
    const out = ui(["scan", "--cwd", root]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toContain("app: apps/web (next, tailwind+css, tailwind v4 css apps/web/styles.css)");
    expect(out.stdout).toMatch(/scan stopped at 4000 entries .* Largest consumer: zdata \(\d+ entries\)\. Next: ui scan --cwd <app directory>/);
  });

  it("json output carries apps[] and budget[] and is byte-identical across runs", () => {
    const root = wide({ wideDirs: 45, filesPerDir: 100 });
    const a = ui(["scan", "--cwd", root, "--json"]).stdout;
    expect(a).toBe(ui(["scan", "--cwd", root, "--json"]).stdout);
    const data = JSON.parse(a).data as { apps: unknown[]; budget: unknown[] };
    expect(data.apps).toHaveLength(1);
    expect(data.budget.length).toBeGreaterThan(0);
  });
});

describe("ui scan — Tailwind v4 detection needs both the dependency and the CSS entry", () => {
  it("a dependency without a v4 entry, and an entry without the dependency, both report null", () => {
    const r = scanProject(proj({
      "apps/a/package.json": pkg({ react: "19", tailwindcss: "4" }), "apps/a/main.css": "body { margin: 0 }\n",
      "apps/b/package.json": pkg({ react: "19" }), "apps/b/main.css": V4_CSS,
    }));
    expect(r.apps.map((a) => [a.path, a.tailwindCss])).toEqual([["apps/a", null], ["apps/b", null]]);
    expect(r.apps[0]!.styling).toEqual(["tailwind", "css"]); // the dependency alone still says tailwind
    expect(r.apps[1]!.styling).toEqual(["css"]);
  });

  it("an @theme entry counts, and only the first 4 KB of a css file is read", () => {
    const r = scanProject(proj({
      "apps/a/package.json": pkg({ react: "19", tailwindcss: "4" }), "apps/a/theme.css": "@theme { --x: 1px; }\n",
      "apps/b/package.json": pkg({ react: "19", tailwindcss: "4" }), "apps/b/late.css": `${"/* pad */\n".repeat(500)}@import "tailwindcss";\n`,
    }));
    expect(r.apps.map((a) => a.tailwindCss)).toEqual(["apps/a/theme.css", null]);
  });

  it("a nested app owns its own css and component dirs; the outer app does not claim them", () => {
    const files: Record<string, string> = {
      "apps/outer/package.json": pkg({ react: "19", tailwindcss: "4" }),
      "apps/outer/inner/package.json": pkg({ vue: "3" }),
      "apps/outer/inner/x.css": V4_CSS,
      "apps/outer/inner/components/a.tsx": "", "apps/outer/inner/components/b.tsx": "", "apps/outer/inner/components/c.tsx": "",
    };
    const [outer, inner] = scanProject(proj(files)).apps;
    expect(outer!.path).toBe("apps/outer");
    expect(outer!.tailwindCss).toBeNull();
    expect(outer!.componentDirs).toEqual([]);
    expect(inner).toMatchObject({ path: "apps/outer/inner", framework: "vue", componentDirs: [{ path: "apps/outer/inner/components", files: 3 }] });
  });

  it("a package.json inside a test tree is a fixture, not an app root", () => {
    const r = scanProject(proj({ "tests/fixtures/demo/package.json": pkg({ react: "19" }), "apps/real/package.json": pkg({ react: "19" }) }));
    expect(r.apps.map((a) => a.path)).toEqual(["apps/real"]);
  });
});

describe("ui scan — dot-directories are skipped as a class (corpus count: 0 component dirs under them in 32 projects)", () => {
  const comps = (base: string): Record<string, string> => ({
    [`${base}/components/a.tsx`]: "", [`${base}/components/b.tsx`]: "", [`${base}/components/c.tsx`]: "",
  });
  it("component files under any dot-directory are not reported", () => {
    const r = scanProject(proj({ ...comps(".some-tool-cache/ctx"), ...comps("src") }));
    expect(r.componentDirs.map((d) => d.path)).toEqual(["src/components"]);
  });
  it("plans/ stays in the walk: the corpus did not justify skipping it by name", () => {
    const r = scanProject(proj(comps("plans/mock")));
    expect(r.componentDirs.map((d) => d.path)).toEqual(["plans/mock/components"]);
  });
});
