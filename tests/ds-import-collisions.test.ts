/**
 * Two keys of a token file that become one written path are asked about at the import door, never dropped and never
 * applied (the owner's mandate), and an alias is written pointing at the written path of the token it names.
 * The kind is `token-path-collision`, reused from the Figma door with a door-neutral entry.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertLedgerBalances, assertSkipFinderAgrees, assertTypedTokensKept, planImport } from "../src/core/ds-import-plan.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, projectWith, submit } from "./project-kinds-helpers.js";

type Envelope = { data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (out: string): Envelope => JSON.parse(out) as Envelope;
type Doc = Record<string, Record<string, unknown>>;

function write(tokens: unknown): string {
  const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-import-collide-")), "tokens.json");
  writeFileSync(file, JSON.stringify(tokens));
  return file;
}
const args = (src: string, project: string, extra: string[] = []): string[] => ["ds", "import", src, "--dir", project, "--json", ...extra];
const sealedTokens = (project: string): Doc => JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as Doc;
const CASE = { colors: { Primary: "#111111", primary: "#222222", ink: "#000000" } };
const SHAPE = { colors: { brand: { x: "#111111" }, ink: "#000000" }, "colors-brand": { x: "#222222" } };

function answered(tokens: unknown, mode: "exclude-all" | { keep: string }): { project: string; src: string; final: ReturnType<typeof capture> } {
  const project = projectWith({ "package.json": "{}" });
  const src = write(tokens);
  capture(args(src, project));
  const answers = keyOf(project).filter((k) => k.kind === "token-path-collision").map((k) => {
    if (mode === "exclude-all") return { fingerprint: k.fingerprint, choice: k.options[0]!.id };
    const members = Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, k.memberChoices![m]!.find((c) => c.id === `keep:${mode.keep}`)!.id]));
    return { fingerprint: k.fingerprint, choice: k.perMemberAnswer!.choice, members };
  });
  expect(submit(project, answers).code).toBe(0);
  return { project, src, final: capture(args(src, project)) };
}

describe("two keys that become one token path are asked about", () => {
  for (const [name, tokens, path, keys] of [
    ["a case difference", CASE, "colors.primary", "colors.Primary or colors.primary"],
    ["a hoisted nested group beside a flat group", SHAPE, "colors-brand.x", "colors.brand.x or colors-brand.x"],
  ] as const) {
    it(`${name}: exit 1 ONBOARD_BLOCKED, one question naming the path and the keys, and nothing is written`, () => {
      const project = projectWith({ "package.json": "{}" });
      const r = capture(args(write(tokens), project));
      expect(r.code).toBe(1);
      expect(json(r.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
      const c = readPending(project).clusters.filter((x) => x.kind === "token-path-collision");
      expect(c).toHaveLength(1);
      expect(c[0]!.raisedBy).toBe("ds import");
      expect(c[0]!.members).toHaveLength(1);
      expect(c[0]!.labels![c[0]!.members[0]!]).toBe(`${path}: ${keys}`);
      expect(c[0]!.options.map((o) => o.id)).toEqual(["keep-none", "review-individually"]);
      expect(c[0]!.options[0]!.consequence).toContain("2 keys counted and named");
      expect(c[0]!.memberChoices![c[0]!.members[0]!]!.map((m) => m.label)).toEqual([`Keep ${keys.split(" or ")[0]}`, `Keep ${keys.split(" or ")[1]}`, "Exclude all of them"]);
      expect(() => readFileSync(join(project, "design", "design.tokens.json"))).toThrow();
    });
  }
  it("the question counts the aliases that name the keys at stake", () => {
    const project = projectWith({ "package.json": "{}" });
    capture(args(write({ colors: { brand: { x: "#111111" }, link: "{colors-brand.x}" }, "colors-brand": { x: "#222222" } }), project));
    // the alias names the second key; until the collision is ruled the import asks about the collision only
    expect(readPending(project).clusters.map((c) => c.kind)).toEqual(["token-path-collision"]);
    expect(readPending(project).clusters.find((x) => x.kind === "token-path-collision")!.options[0]!.consequence).toContain("1 alias(es) name these keys; each is then asked as a dangling alias");
  });
  it("answered from the claude key alone, as an option: every key of the path is excluded, counted under path-collision and named", () => {
    const { project, final } = answered(CASE, "exclude-all");
    expect(final.code, final.out).toBe(0);
    const data = json(final.out).data!;
    expect(data["ledger"]).toMatchObject({ in: 3, written: { total: 1 }, excluded: { total: 2, "path-collision": 2 } });
    expect(data["excluded"]["path-collision"].map((i: { name: string }) => i.name)).toEqual(["colors.Primary", "colors.primary"]);
    expect(Object.keys(sealedTokens(project)["colors"]!)).toEqual(["ink"]);
  });
  it("answered from the claude key alone, per member: the kept key is written, the others are counted and named", () => {
    const { project, final } = answered(CASE, { keep: "/colors/Primary" });
    expect(final.code, final.out).toBe(0);
    const data = json(final.out).data!;
    expect(data["ledger"]).toMatchObject({ in: 3, written: { total: 2 }, excluded: { total: 1, "path-collision": 1 } });
    expect(data["excluded"]["path-collision"]).toEqual([{ id: "/colors/primary", name: "colors.primary" }]);
    expect(data["imported"]).toBe(2);
    expect(data["skipped"]).toBe(1);
    expect(data["skippedKeys"]).toEqual([{ key: "colors.primary", reason: "path-collision" }]);
    expect((sealedTokens(project)["colors"]!["primary"] as { $value: string }).$value).toBe("#111111");
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
  });
  it("the hoisted shape: keeping the flat key writes its value", () => {
    const { project, final } = answered(SHAPE, { keep: "/colors-brand/x" });
    expect(final.code, final.out).toBe(0);
    expect((sealedTokens(project)["colors-brand"]!["x"] as { $value: string }).$value).toBe("#222222");
  });
  it("after the ruling a reorder of the file and the rename of an unrelated key ask nothing", () => {
    const { project } = answered(CASE, { keep: "/colors/Primary" });
    const reordered = write({ colors: { ink2: "#000000", primary: "#222222", Primary: "#111111" } });
    const r = capture(args(reordered, project, ["--force"]));
    expect(r.code, r.out).toBe(0);
    expect((sealedTokens(project)["colors"]!["primary"] as { $value: string }).$value).toBe("#111111");
  });
  it("a new third key on a ruled path is a new member and is asked", () => {
    const { project } = answered(CASE, { keep: "/colors/Primary" });
    const r = capture(args(write({ colors: { ...CASE.colors, PRIMARY: "#333333" } }), project, ["--force"]));
    expect(json(r.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(project).clusters.find((c) => c.kind === "token-path-collision")!.labels).toBeDefined();
  });
  it("the import's own stored question goes when the file no longer collides", () => {
    const project = projectWith({ "package.json": "{}" });
    capture(args(write(CASE), project));
    const stored = readPending(project).clusters.find((c) => c.kind === "token-path-collision")!;
    expect(stored.raisedBy).toBe("ds import");
    expect(capture(args(write({ colors: { ink: "#000000" } }), project)).code).toBe(0);
    expect(readPending(project).clusters.some((c) => c.kind === "token-path-collision")).toBe(false);
  });
});

describe("until every collision is ruled the import asks about collisions only", () => {
  const SECOND = { colors: { brand: { x: "#111111" }, link: "{colors-brand.x}", note: "zzz", ink: "#000000" }, "colors-brand": { x: "#222222" } };
  it("round 1: the collision alone, even when the file also holds an untypeable member and an alias to the second key", () => {
    const project = projectWith({ "package.json": "{}" });
    capture(args(write(SECOND), project));
    expect(readPending(project).clusters.map((c) => c.kind)).toEqual(["token-path-collision"]);
  });
  it("keeping the second key: the alias is written at its path, and only the untypeable member is asked next", () => {
    const { project, final } = answered(SECOND, { keep: "/colors-brand/x" });
    expect(json(final.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    const kinds = readPending(project).clusters;
    expect(kinds.map((c) => c.kind)).toEqual(["untypeable-tokens"]);
    expect(kinds[0]!.members).toEqual(["/colors/note"]);
  });
  it("keeping the second key with nothing else to ask: the alias is written and no dangling question is raised", () => {
    const { project, final } = answered({ ...SECOND, colors: { brand: { x: "#111111" }, link: "{colors-brand.x}", ink: "#000000" } }, { keep: "/colors-brand/x" });
    expect(final.code, final.out).toBe(0);
    expect((sealedTokens(project)["colors"]!["link"] as { $value: string }).$value).toBe("{colors-brand.x}");
  });
  it("keeping the first key: the alias names the loser and is asked as dangling, after the collision", () => {
    const { project, final } = answered({ ...SECOND, colors: { brand: { x: "#111111" }, link: "{colors-brand.x}", ink: "#000000" } }, { keep: "/colors/brand/x" });
    expect(json(final.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(project).clusters.find((c) => c.kind === "untypeable-tokens")!.members).toEqual(["colors.link"]);
  });
});

describe("an alias is written pointing at the written path of the token it names", () => {
  const compiles = (project: string): void => {
    const r = capture(["tokens", "compile", join(project, "design", "design.tokens.json"), "--json"]);
    expect(r.code, r.out).toBe(0);
  };
  it("an alias to a token in a nested group is not dangling: it is written at the hoisted path and compiles", () => {
    const project = projectWith({ "package.json": "{}" });
    const r = capture(args(write({ colors: { brand: { primary: "#111111" }, accent: "{colors.brand.primary}" } }), project));
    expect(r.code, r.out).toBe(0);
    expect((sealedTokens(project)["colors"]!["accent"] as { $value: string }).$value).toBe("{colors-brand.primary}");
    compiles(project);
  });
  it("an alias to a token two groups deep is written at the hoisted path and compiles", () => {
    const project = projectWith({ "package.json": "{}" });
    const r = capture(args(write({ colors: { brand: { dark: { primary: "#111111" } }, accent: "{colors.brand.dark.primary}" } }), project));
    expect(r.code, r.out).toBe(0);
    expect((sealedTokens(project)["colors"]!["accent"] as { $value: string }).$value).toBe("{colors-brand-dark.primary}");
    compiles(project);
  });
  it("an alias that already names a written path keeps working", () => {
    const project = projectWith({ "package.json": "{}" });
    const r = capture(args(write({ colors: { brand: { primary: "#111111" }, accent: "{colors-brand.primary}" } }), project));
    expect(r.code, r.out).toBe(0);
    compiles(project);
  });
  const withAlias = { colors: { brand: { x: "#111111" }, link: "{colors.brand.x}", ink: "#000000" }, "colors-brand": { x: "#222222" } };
  it("an alias to the loser of a collision is asked as a dangling alias, and is never pointed at the winner", () => {
    const { project, final } = answered(withAlias, { keep: "/colors-brand/x" });
    expect(json(final.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    const c = readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!;
    expect(c.members).toEqual(["colors.link"]);
    expect(c.labels!["colors.link"]).toBe("colors.link: dangling alias");
  });
  it("an alias whose text is the winner's written path but names the loser's source key is asked, never pointed at the winner", () => {
    const tokens = { colors: { brand: { x: "#111111" }, link: "{colors-brand.x}", ink: "#000000" }, "colors-brand": { x: "#222222" } };
    const { project, final } = answered(tokens, { keep: "/colors/brand/x" });
    expect(json(final.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!.members).toEqual(["colors.link"]);
  });
  it("an alias to the winner follows it: it is written at the winner's path, not asked", () => {
    const { project, final } = answered(withAlias, { keep: "/colors/brand/x" });
    expect(final.code, final.out).toBe(0);
    expect((sealedTokens(project)["colors"]!["link"] as { $value: string }).$value).toBe("{colors-brand.x}");
    compiles(project);
  });
});

describe("the guards behind the questions", () => {
  it("a ledger that does not add up is refused with the three numbers", () => {
    expect(() => assertLedgerBalances({ in: 5, written: { total: 2, typed: 2, keptRaw: 0 }, excluded: { total: 2 }, pending: 0 })).toThrow("in 5 = written 2 + excluded 2 + pending 0");
    expect(() => assertLedgerBalances({ in: 4, written: { total: 2, typed: 2, keptRaw: 0 }, excluded: { total: 2 }, pending: 0 })).not.toThrow();
  });
  it("the skip finder and the importer must agree on how many members were skipped", () => {
    expect(() => assertSkipFinderAgrees(3, 2)).toThrow("the import skipped 3 members and the skip finder named 2");
    expect(() => assertSkipFinderAgrees(2, 2)).not.toThrow();
  });
  it("a typed token that the merge replaced or dropped is refused by name", () => {
    const typed = { raw: { keep: { $value: "#111111", $type: "color" as const } } };
    expect(() => assertTypedTokensKept(typed, { raw: { keep: { $value: "zzz", $type: "string" as const } } })).toThrow("the token raw.keep was replaced while the plan was built");
    expect(() => assertTypedTokensKept(typed, {})).toThrow("raw.keep");
    expect(() => assertTypedTokensKept(typed, { raw: { ...typed.raw, other: { $value: "a", $type: "string" as const } } })).not.toThrow();
  });
  it("a file whose keys do not collide has no collision question and a ledger that balances", () => {
    const plan = planImport({ colors: { a: "#111111", b: "#222222" } }, []);
    expect(plan.detections).toEqual([]);
    expect(plan.result!.ledger).toMatchObject({ in: 2, written: { total: 2 }, excluded: { total: 0 } });
  });
});
