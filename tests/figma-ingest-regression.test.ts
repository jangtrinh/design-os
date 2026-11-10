/**
 * The existing ingest fixtures keep producing the bytes they produced before the ingest learned to ask. The goldens in
 * tests/fixtures/ingest-golden were captured from the build before that change (see SOURCES.md there). A scan with one
 * collection, or no page field, asks nothing. The one fixture that held variables no token could be made from
 * (ds.json) writes the same bytes once the owner answers "exclude", which is what the old code did without asking.
 * DESIGN.md gains the closing ledger section and is otherwise identical.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ingestArgs, ingestUntilReady, newProject, preferring } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const ROOT = process.cwd();
const GOLD = (name: string, file: string): string => readFileSync(join(ROOT, "tests", "fixtures", "ingest-golden", name, file), "utf8");
const cases: [string, string, boolean][] = [
  ["control-single-collection-single-page", join(ROOT, "tests", "fixtures", "owner-rulings", "control-single-collection-single-page.json"), false],
  ["ds-mixed", join(ROOT, "tests", "fixtures", "figma-ds", "ds-mixed.json"), false],
  ["ds", join(ROOT, "tests", "fixtures", "figma-ds", "ds.json"), true],
];

describe("pre-existing ingest fixtures are byte-identical", () => {
  for (const [name, scan, needsAnswer] of cases) {
    it(`${name}: tokens.json and component-registry.json equal the golden bytes${needsAnswer ? " once its skipped variables are answered exclude" : " with no question asked"}`, () => {
      const project = newProject();
      const out = newProject();
      const extra = ["--name", "golden", "--now", "2026-01-01T00:00:00Z"];
      // The golden was written with --name golden; ingestArgs passes its own name, so the extra flags come last and win.
      if (needsAnswer) expect(ingestUntilReady(scan, project, out, preferring("exclude"), extra).rounds).toBe(2);
      else {
        const r = capture([...ingestArgs(scan, project, out), ...extra]);
        expect(r.code, r.err).toBe(0);
      }
      expect(readFileSync(join(out, "tokens.json"), "utf8")).toBe(GOLD(name, "tokens.json"));
      expect(readFileSync(join(out, "component-registry.json"), "utf8")).toBe(GOLD(name, "component-registry.json"));
      const md = readFileSync(join(out, "DESIGN.md"), "utf8");
      const gold = GOLD(name, "DESIGN.md");
      expect(md.startsWith(gold)).toBe(true);
      expect(md.slice(gold.length)).toMatch(/^## Ledger\n/);
    });
  }
});
