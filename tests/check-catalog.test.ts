/**
 * The catalog's paired linter: re-derive every family's checkId set from the
 * source files the gate composes, and assert set equality with CHECK_CATALOG
 * in BOTH directions. A check added without a catalog row, or a catalog row
 * whose check was deleted, is a red test here — never silent drift. (This is
 * the registry triage routes on; a stale registry is a stale router.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECK_CATALOG } from "../src/core/check-catalog.js";

const CORE = join(fileURLToPath(new URL("..", import.meta.url)), "src", "core");

function idsFromFiles(prefixes: string[], pattern: RegExp): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(CORE)) {
    if (!f.endsWith(".ts")) continue;
    if (!prefixes.some((p) => f.startsWith(p))) continue;
    const src = readFileSync(join(CORE, f), "utf8");
    for (const m of src.matchAll(pattern)) out.add(m[1] as string);
  }
  return out;
}

const CHECK_ID = /checkId: "([a-z0-9-]+)"/g;
const RULE_ID = /\{ id: "([a-z-]+)",\s*fn:/g;

const catalogByFamily = (fam: string): Set<string> =>
  new Set(CHECK_CATALOG.filter((c) => c.family === fam).map((c) => c.id));

describe("check catalog — paired with the family sources", () => {
  it("layout rows == ids in layout-checks*/layout-lint sources", () => {
    expect([...catalogByFamily("layout")].sort())
      .toEqual([...idsFromFiles(["layout-checks", "layout-lint"], CHECK_ID)].sort());
  });
  it("a11y rows == ids in a11y-checks* sources", () => {
    expect([...catalogByFamily("a11y")].sort())
      .toEqual([...idsFromFiles(["a11y-checks"], CHECK_ID)].sort());
  });
  it("taste rows == ids in taste-checks* sources", () => {
    expect([...catalogByFamily("taste")].sort())
      .toEqual([...idsFromFiles(["taste-checks"], CHECK_ID)].sort());
  });
  it("content rows == ids in content-checks* sources", () => {
    expect([...catalogByFamily("content")].sort())
      .toEqual([...idsFromFiles(["content-checks"], CHECK_ID)].sort());
  });
  it("autofix rows == autofix RULES ids plus the gate's autofix-not-clean", () => {
    const fromSource = idsFromFiles(["html-autofix"], RULE_ID);
    fromSource.add("autofix-not-clean");
    expect([...catalogByFamily("autofix")].sort()).toEqual([...fromSource].sort());
  });
  it("ids are unique and requires values are known", () => {
    expect(new Set(CHECK_CATALOG.map((c) => c.id)).size).toBe(CHECK_CATALOG.length);
    for (const c of CHECK_CATALOG) expect(["none", "tokens"]).toContain(c.requires);
  });
});
