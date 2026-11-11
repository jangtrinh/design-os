/**
 * An alias in the file being imported is recognised by its shape, in any case, and followed to the token it names; one
 * that names nothing writable is a dangling alias that is asked about (never an "unmappable type" with a keep-raw
 * offer); and a written alias has the $type of the token it resolves to.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importFlatTokens } from "../src/core/token-import.js";
import { findSourceSkips } from "../src/core/ds-import-skips.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture } from "./owner-rulings-helpers.js";
import { projectWith } from "./project-kinds-helpers.js";

type Doc = Record<string, Record<string, { $value: string; $type: string }>>;
function run(tokens: unknown): { project: string; r: ReturnType<typeof capture> } {
  const project = projectWith({ "package.json": "{}" });
  const dir = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-import-alias-"));
  const src = join(dir, "tokens.json");
  writeFileSync(src, JSON.stringify(tokens));
  return { project, r: capture(["ds", "import", src, "--dir", project, "--json"]) };
}
const sealed = (project: string): Doc => JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as Doc;
const works = (project: string): void => {
  expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
  const c = capture(["tokens", "compile", join(project, "design", "design.tokens.json"), "--json"]);
  expect(c.code, c.out).toBe(0);
};

describe("an alias is recognised by shape, whatever its case", () => {
  it("an alias to a camelCase key is followed to the written (sanitised) path, and the sealed store compiles", () => {
    const { project, r } = run({ colors: { brandPrimary: "#111111", link: "{colors.brandPrimary}" } });
    expect(r.code, r.out).toBe(0);
    expect(sealed(project)["colors"]!["link"]).toEqual({ $value: "{colors.brandprimary}", $type: "color" });
    works(project);
  });
  it("an uppercase alias to an uppercase key is followed too", () => {
    const { project, r } = run({ Colors: { Brand: "#111111", Link: "{Colors.Brand}" } });
    expect(r.code, r.out).toBe(0);
    expect(Object.values(sealed(project)).flatMap((g) => Object.values(g)).map((t) => t.$value).sort()).toEqual(["#111111", "{colors.brand}"]);
    works(project);
  });
  it("the s.sp repro: an alias to a key with a dot in its name passes ds status and tokens compile", () => {
    const { project, r } = run({ s: { sp: "{sp.1.5}" }, sp: { "1.5": "6px" } });
    expect(r.code, r.out).toBe(0);
    works(project);
  });
  it("the skip finder and the importer agree that a loose-shaped alias is not skipped", () => {
    const flat = { colors: { brandPrimary: "#111111", link: "{colors.brandPrimary}" } };
    expect(findSourceSkips(flat)).toEqual([]);
    expect(importFlatTokens(flat).stats.skipped).toBe(0);
  });
});

describe("an alias that names nothing writable is a dangling alias with one outcome", () => {
  it("`{Missing.Thing}` is asked as a dangling alias, not as an unmappable type, and cannot be kept raw", () => {
    const { project, r } = run({ colors: { ink: "#000000", link: "{Missing.Thing}" } });
    expect(JSON.parse(r.out).error.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    const c = readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!;
    expect(c.members).toEqual(["colors.link"]);
    expect(c.labels!["colors.link"]).toBe("colors.link: dangling alias");
    expect(c.memberChoices!["colors.link"]!.map((m) => m.id)).toEqual(["exclude"]);
  });
  it("an alias to a camelCase key that does not exist is dangling too", () => {
    const { project, r } = run({ colors: { ink: "#000000", link: "{colors.noSuchKey}" } });
    expect(JSON.parse(r.out).error.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!.labels!["colors.link"]).toBe("colors.link: dangling alias");
  });
});

describe("a written alias takes its $type from the token it resolves to", () => {
  it("a dimension behind an alias named like a colour is a dimension, and so is the alias that names that alias", () => {
    const { project, r } = run({ misc: { base: "4px", first: "{misc.base}", second: "{misc.first}" } });
    expect(r.code, r.out).toBe(0);
    expect(Object.values(sealed(project)["misc"]!).map((t) => t.$type)).toEqual(["dimension", "dimension", "dimension"]);
    works(project);
  });
  it("the byType counts follow the types the tokens were written with", () => {
    const stats = importFlatTokens({ misc: { base: "4px", ref: "{misc.base}" } }).stats;
    expect(stats.byType).toEqual({ dimension: 2 });
  });
});
