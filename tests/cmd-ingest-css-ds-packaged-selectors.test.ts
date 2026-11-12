/**
 * The code door on a packaged theme, selectors: the base `:where(:root,:host,…)` and the unquoted `[data-theme=dark]` of
 * a built token sheet are recognised, and a component class that holds local variables is listed, never promoted.
 * Goes through the built CLI: extract the three sheets, then ingest.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DIST_CLI, runBuilt, writeSheets } from "./css-door-packaged-theme-fixture.js";

const built = existsSync(DIST_CLI);
let root = "";
let extractFile = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ease-css-door-selectors-"));
  if (!built) return;
  const { html, css } = writeSheets(join(root, "sheets"));
  extractFile = join(root, "t.json");
  const r = runBuilt(["designmd", "extract-tokens", html, "--css", css, "--out", extractFile], root);
  if (r.code !== 0) throw new Error(`extract-tokens failed: ${r.err}${r.out}`);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

interface Env { ok: boolean; data: { tokens: string; stats: { primitives: number; semantics: number; skipped: number }; unverified: { name: string; reason: string }[] } }

describe.skipIf(!built)("ui ingest-css-ds on a packaged theme (built CLI)", () => {
  it("compiles the base under :where(:root,:host,…) and every unquoted or quoted theme into modes", () => {
    const out = join(root, "out");
    const r = runBuilt(["ingest-css-ds", extractFile, "--out", out, "--json"], root);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.out) as Env;
    const tokens = JSON.parse(readFileSync(env.data.tokens, "utf8")) as Record<string, Record<string, unknown>>;
    expect(tokens["color"]?.["ds-surface"]).toEqual({
      $value: "#fff", $type: "color",
      $extensions: { "mode.dark": { $value: "#111" }, "mode.paper": { $value: "#f5f0e6" }, "design-os.custom-property": "--ds-surface" },
    });
    expect(tokens["color"]?.["ds-text"]).toEqual({
      $value: "#111", $type: "color",
      $extensions: { "mode.dark": { $value: "#eee" }, "mode.paper": { $value: "#222" }, "design-os.custom-property": "--ds-text" },
    });
    expect(tokens["color"]?.["ds-border"]).toEqual({ $value: "#ddd", $type: "color", $extensions: { "design-os.custom-property": "--ds-border" } });
  });

  it("lists the component-local variables, each under its own selector, and promotes none of them", () => {
    const out = join(root, "out-listed");
    const r = runBuilt(["ingest-css-ds", extractFile, "--out", out, "--json"], root);
    const env = JSON.parse(r.out) as Env;
    const tokens = JSON.parse(readFileSync(env.data.tokens, "utf8")) as Record<string, Record<string, unknown>>;
    const all = Object.values(tokens).flatMap((g) => Object.keys(g));
    expect(all.filter((n) => n.startsWith("ds-card") || n === "ds-local-size")).toEqual([]);
    const local = env.data.unverified.filter((u) => /^--ds-(card|local)/.test(u.name));
    expect([...new Set(local.map((u) => u.name))].sort()).toEqual(["--ds-card-gap", "--ds-card-pad", "--ds-local-size"]);
    expect(local.filter((u) => u.reason === "no recognised base/mode selector for any declaration").length).toBe(3);
    expect(local.filter((u) => u.reason.includes("unrecognized selector '.ds-card'")).length).toBe(2);
    expect(local.filter((u) => u.reason.includes("unrecognized selector '.ds-s-xs'")).length).toBe(1);
  });
});
