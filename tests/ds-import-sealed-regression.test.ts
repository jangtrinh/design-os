/**
 * Task: a project with unambiguous roles and typeable tokens imports with byte-identical output. The goldens under
 * tests/fixtures/ds-import-regression/golden/ were captured by running the import as it was before it learned to ask
 * (the base of this change); the only thing normalised is what is different on every run: the scratch directory and
 * instants. Regenerate them only deliberately: `UPDATE_GOLDEN=1 npx vitest run tests/ds-import-sealed-regression.test.ts`.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";

const FIXTURE = join(process.cwd(), "tests", "fixtures", "ds-import-regression");
const GOLDEN = join(FIXTURE, "golden");
const UPDATE = process.env["UPDATE_GOLDEN"] === "1";
const INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

const normalise = (text: string, dir: string): string => text.split(dir).join("<project>").replace(INSTANT, "<instant>");

function check(name: string, actual: string): void {
  const file = join(GOLDEN, name);
  if (UPDATE) { mkdirSync(GOLDEN, { recursive: true }); writeFileSync(file, actual); return; }
  expect(actual, name).toBe(readFileSync(file, "utf8"));
}

function importInto(extra: string[]): { dir: string; r: ReturnType<typeof capture> } {
  const dir = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-import-regression-"));
  const r = capture(["ds", "import", join(FIXTURE, "flat-clean.tokens.json"), "--dir", dir, "--name", "regression", ...extra]);
  return { dir, r };
}

describe("ui ds import with nothing to ask is byte-identical to the import before it asked", () => {
  it("text output and the sealed store", () => {
    const { dir, r } = importInto([]);
    expect(r.code).toBe(0);
    check("import.txt", normalise(r.out, dir));
    check("design.tokens.json", readFileSync(join(dir, "design", "design.tokens.json"), "utf8"));
    check("component-registry.json", readFileSync(join(dir, "design", "component-registry.json"), "utf8"));
    check("ds.manifest.json", normalise(readFileSync(join(dir, "design", "ds.manifest.json"), "utf8"), dir));
    check("soul.md", normalise(readFileSync(join(dir, "design", "soul.md"), "utf8"), dir));
  });
  it("json envelope", () => {
    const { dir, r } = importInto(["--json"]);
    expect(r.code).toBe(0);
    check("import.json", normalise(r.out, dir));
  });
  it("carries no ledger and no registry field when nothing was asked and no registry was given", () => {
    const { r } = importInto(["--json"]);
    const data = (JSON.parse(r.out) as { data: Record<string, unknown> }).data;
    expect(Object.keys(data)).toEqual(["name", "dir", "imported", "skipped", "byType", "skippedKeys", "categories", "rolesRecognized", "roleGaps", "soul", "heartbeat", "harvest"]);
  });
});
