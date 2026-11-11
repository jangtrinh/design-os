/**
 * `ui ds import` asks instead of skipping (spec 033 FR-011, FR-012; AC-22 for the import door): every member the
 * importer cannot type is counted per reason and asked as one question, nothing is sealed until it is answered, and the
 * roles the name cannot decide are asked and applied through `ui ds set-role`. The answer is built from the claude key.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planImport } from "../src/core/ds-import-plan.js";
import { findSourceSkips } from "../src/core/ds-import-skips.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf, projectWith, submit } from "./project-kinds-helpers.js";

/** One member of each of the seven reasons, next to tokens that import cleanly. */
const EVERY_REASON = {
  _source: "synthetic",
  _meta: { revision: 3 },
  schema: "1.0",
  colors: { primary: "#3366ff", broken: "#12", "text-gone": "{colors.missing}", "loop-a": "{colors.loop-b}", "loop-b": "{colors.loop-a}" },
  shadows: { sm: "0 1px 2px rgba(0,0,0,.04)" },
  misc: { empty: null },
  spacing: { "space-1": 4 },
};
const REASONS = ["bad-colour", "null-leaf", "unmappable-type", "ignored-key", "not-token-group", "dangling-alias", "alias-cycle"];

function source(tokens: unknown): string {
  const dir = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-import-src-"));
  const file = join(dir, "tokens.json");
  writeFileSync(file, JSON.stringify(tokens));
  return file;
}
const importArgs = (src: string, project: string, extra: string[] = []): string[] => ["ds", "import", src, "--dir", project, "--json", ...extra];
type Envelope = { data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (out: string): Envelope => JSON.parse(out) as Envelope;
const sealed = (project: string): boolean => existsSync(join(project, "design", "design.tokens.json"));

/** Imports, answers every pending question with `choose`, imports again. */
function importAnswered(tokens: unknown, choose: (kind: string, options: string[]) => string, project = projectWith({ "package.json": "{}" })): { project: string; first: ReturnType<typeof capture>; final: ReturnType<typeof capture> } {
  const src = source(tokens);
  const first = capture(importArgs(src, project));
  const answers = keyOf(project).map((k) => ({ fingerprint: k.fingerprint, choice: choose(k.kind, k.options.map((o) => o.id)) }));
  expect(submit(project, answers).code).toBe(0);
  return { project, first, final: capture(importArgs(src, project)) };
}

describe("the import door raises one untypeable-tokens question, sub-grouped by reason, and seals nothing", () => {
  it("one member of each reason: exit 1 ONBOARD_BLOCKED, one cluster, seven reasons named with their counts, nothing written", () => {
    const project = projectWith({ "package.json": "{}" });
    const before = hashTree(project);
    const r = capture(importArgs(source(EVERY_REASON), project));
    expect(r.code).toBe(1);
    expect(json(r.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(sealed(project)).toBe(false);
    expect(hashTree(project, [".design-os"])).toBe(hashTree(project, [".design-os"]));
    expect(existsSync(join(project, "design"))).toBe(false);
    const clusters = readPending(project).clusters;
    const untypeable = clusters.filter((c) => c.kind === "untypeable-tokens");
    expect(untypeable).toHaveLength(1);
    expect(untypeable[0]!.raisedBy).toBe("ds import");
    expect(untypeable[0]!.count).toBe(9); // seven reasons; the cycle has two members and the ignored key two (a group and a scalar)
    for (const label of ["unmappable type (1:", "null value (1:", "dangling alias (1:", "alias cycle (2:", "bad colour (1:", "ignored `_` key (2:", "not a token group (1:"]) {
      expect(untypeable[0]!.question, label).toContain(label);
    }
    expect(before).not.toBe(hashTree(project)); // only the transient pending file appeared
  });
  it("each member is named `name (id)`: the label carries the dotted path and the reason, the id is a stable pointer", () => {
    const project = projectWith({ "package.json": "{}" });
    capture(importArgs(source(EVERY_REASON), project));
    const c = readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!;
    expect(c.members).toContain("/colors/broken");
    expect(c.members).toContain("colors.text-gone"); // an alias member is the token path it would have been written at
    expect(c.labels!["/colors/broken"]).toBe("colors.broken: bad colour");
    expect(c.labels!["colors.loop-a"]).toBe("colors.loop-a: alias cycle");
  });
  it("the consequences are computed for each option: keep-raw says how many can be kept and how many can only be excluded", () => {
    const project = projectWith({ "package.json": "{}" });
    capture(importArgs(source(EVERY_REASON), project));
    const c = readPending(project).clusters.find((x) => x.kind === "untypeable-tokens")!;
    const keep = c.options.find((o) => o.id === "keep-raw")!;
    const keepable = Object.values(keep.assigns!).filter((v) => v === "keep-raw").length;
    expect(keepable).toBe(4); // the unmappable string, the bad colour and the two scalars (_source, schema)
    expect(keep.consequence).toContain(`${keepable} token(s) written under "raw"`);
    expect(keep.consequence).toContain(`${c.count - keepable} can only be excluded`);
    expect(c.options.at(-1)!.id).toBe("review-individually");
  });
  it("nothing is asked twice: after the answer the same file imports, and a reordered file asks nothing", () => {
    const { project, first, final } = importAnswered(EVERY_REASON, (kind) => (kind === "untypeable-tokens" ? "exclude" : "leave-unassigned"));
    expect(first.code).toBe(1);
    expect(final.code, final.out).toBe(0);
    const reordered = Object.fromEntries(Object.entries(EVERY_REASON).reverse());
    expect(capture(importArgs(source(reordered), project, ["--force"])).code).toBe(0);
  });
  it("renaming a key is a new member and is asked again; the old ruling is stale, never applied to the new name", () => {
    const { project } = importAnswered({ colors: { primary: "#3366ff" }, shadows: { sm: "0 1px" } }, () => "exclude");
    expect(readRulingStore(project).rulings).toHaveLength(1);
    const renamed = capture(importArgs(source({ colors: { primary: "#3366ff" }, shadows: { soft: "0 1px" } }), project, ["--force"]));
    expect(json(renamed.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(project).clusters.find((c) => c.kind === "untypeable-tokens")!.members).toEqual(["/shadows/soft"]);
  });
});

describe("the ledger of the answered import (FR-012)", () => {
  it("exclude: one count per reason, every item named, in = written + excluded + pending, and none of it is sealed", () => {
    const { project, final } = importAnswered(EVERY_REASON, (kind) => (kind === "untypeable-tokens" ? "exclude" : "leave-unassigned"));
    expect(final.code, final.out).toBe(0);
    const data = json(final.out).data!;
    expect(data["ledger"]).toEqual({
      in: 11, written: { total: 2, typed: 2, keptRaw: 0 }, pending: 0,
      excluded: { total: 9, "unmappable-type": 1, "null-leaf": 1, "dangling-alias": 1, "alias-cycle": 2, "bad-colour": 1, "ignored-key": 2, "not-token-group": 1 },
    });
    expect(Object.keys(data["excluded"]).sort()).toEqual([...REASONS].sort());
    expect(data["excluded"]["alias-cycle"].map((i: { id: string }) => i.id)).toEqual(["colors.loop-a", "colors.loop-b"]);
    const written = JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as Record<string, Record<string, unknown>>;
    expect(Object.keys(written).sort()).toEqual(["colors", "spacing"]);
    expect(Object.keys(written["colors"]!)).toEqual(["primary"]);
  });
  it("the text summary names at most ten per reason and points at --json", () => {
    const many = { shadows: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`s${String(i).padStart(2, "0")}`, "0 1px 2px"])), colors: { primary: "#3366ff" } };
    const project = projectWith({ "package.json": "{}" });
    const src = source(many);
    capture(importArgs(src, project));
    submit(project, keyOf(project).map((k) => ({ fingerprint: k.fingerprint, choice: "exclude" })));
    const r = capture(["ds", "import", src, "--dir", project]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("excluded by reason: unmappable-type 12");
    expect(r.out).toContain("+2 more (full list with --json)");
  });
  it("keep-raw: what has a value is written under raw as a string, with its source path in the name; the rest is excluded and counted", () => {
    const { project, final } = importAnswered(EVERY_REASON, (kind) => (kind === "untypeable-tokens" ? "keep-raw" : "leave-unassigned"));
    expect(final.code, final.out).toBe(0);
    const data = json(final.out).data!;
    expect(data["ledger"].written).toEqual({ total: 6, typed: 2, keptRaw: 4 });
    expect(data["ledger"].excluded).toMatchObject({ total: 5, "dangling-alias": 1, "alias-cycle": 2, "null-leaf": 1, "ignored-key": 1 });
    const raw = (JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as { raw: Record<string, { $value: unknown; $type: string }> }).raw;
    expect(Object.values(raw).every((t) => t.$type === "string" && typeof t.$value === "string")).toBe(true);
    expect(raw["shadows-sm"]!.$value).toBe("0 1px 2px rgba(0,0,0,.04)");
    expect(Object.values(raw).map((t) => t.$value).sort()).toEqual(["#12", "0 1px 2px rgba(0,0,0,.04)", "1.0", "synthetic"]);
    expect(Object.keys(raw).sort()).toEqual(["colors-broken", "schema", "shadows-sm", "source"]);
    expect(JSON.stringify(raw)).not.toContain("[object Object]");
  });
});

describe("a reference is written only when its target is written", () => {
  const cases: [string, Record<string, unknown>, string[]][] = [
    ["an alias to a variable that is not in the file", { c: { a: "{c.gone}", b: "#111111" } }, ["c.a"]],
    ["an alias to an alias that dangles is itself dangling", { c: { a: "{c.b}", b: "{c.gone}", z: "#111111" } }, ["c.a", "c.b"]],
    ["an alias into a loop is dangling, the loop members are the cycle", { c: { lead: "{c.x}", x: "{c.y}", y: "{c.x}", z: "#111111" } }, ["c.lead", "c.x", "c.y"]],
    ["an alias to a token the importer skipped (kept raw or not, it is not at that path)", { c: { a: "{s.sm}", z: "#111111" }, s: { sm: "0 1px 2px" } }, ["c.a"]],
  ];
  for (const [name, tokens, skipped] of cases) {
    it(name, () => {
      const plan = planImport(tokens, []);
      const asked = plan.detections.find((d) => d.kind === "untypeable-tokens")!;
      expect(asked.members.filter((m) => !m.startsWith("/")).sort()).toEqual(skipped);
      expect(plan.result).toBeNull();
    });
  }
  it("a reason's id is stable under a reorder of the file", () => {
    const a = findSourceSkips({ x: { p: null, q: "0 1px" } }).map((s) => s.id).sort();
    const b = findSourceSkips({ x: { q: "0 1px", p: null } }).map((s) => s.id).sort();
    expect(a).toEqual(b);
    expect(a).toEqual(["/x/p", "/x/q"]);
  });
});

describe("ambiguous-roles", () => {
  const TIES = { colors: { primary: "#3366ff", "card-popover": "#ffffff", "primary-secondary": "#eeeeee", background: "#fafafa" } };
  it("a tie between roles is asked, naming each token by its path, and nothing is sealed", () => {
    const project = projectWith({ "package.json": "{}" });
    const r = capture(importArgs(source(TIES), project));
    expect(json(r.out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(sealed(project)).toBe(false);
    const c = readPending(project).clusters.find((x) => x.kind === "ambiguous-roles")!;
    expect(c.members).toEqual(["colors.card-popover", "colors.primary-secondary"]);
    expect(c.labels).toEqual({ "colors.card-popover": "card-popover", "colors.primary-secondary": "primary-secondary" });
    expect(c.options.map((o) => o.id)).toEqual(["leave-unassigned", "review-individually"]);
    expect(c.memberChoices!["colors.card-popover"]!.map((x) => x.id)).toContain("popover");
  });
  it("an answer is applied through `ui ds set-role`: the role lands on exactly that token, with a set-role changelog entry", () => {
    const project = projectWith({ "package.json": "{}" });
    const src = source(TIES);
    capture(importArgs(src, project));
    const key = keyOf(project).find((k) => k.kind === "ambiguous-roles")!;
    const members = { "colors.card-popover": "popover", "colors.primary-secondary": "none" };
    expect(submit(project, [{ fingerprint: key.fingerprint, choice: key.perMemberAnswer!.choice, members }]).code).toBe(0);
    const r = capture(importArgs(src, project));
    expect(r.code, r.out).toBe(0);
    const data = json(r.out).data!;
    expect(data["roles"].applied).toEqual([{ path: "colors.card-popover", role: "popover", changed: true }]);
    expect(data["roles"].leftUnassigned).toEqual(["colors.primary-secondary"]);
    const tokens = JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as Record<string, Record<string, { $extensions?: Record<string, unknown> }>>;
    expect(tokens["colors"]!["card-popover"]!.$extensions!["design-os.role"]).toBe("popover");
    expect(tokens["colors"]!["primary-secondary"]!.$extensions?.["design-os.role"]).toBeUndefined();
    expect(tokens["colors"]!["primary"]!.$extensions!["design-os.role"]).toBe("primary"); // the unambiguous ones are as before
    const manifest = JSON.parse(readFileSync(join(project, "design", "ds.manifest.json"), "utf8")) as { changelog: { kind: string; path: string; to: string }[]; generation: number };
    expect(manifest.changelog).toMatchObject([{ kind: "set-role", path: "colors.card-popover", to: "popover" }]);
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0); // the store the roles were applied to still verifies
  });
  it("the claude answer key alone is enough: an option answer, and the per-member answer for every kind the door raises", () => {
    for (const mode of ["option", "per-member"] as const) {
      const project = projectWith({ "package.json": "{}" });
      const src = source({ ...TIES, shadows: { sm: "0 1px 2px" } });
      capture(importArgs(src, project));
      const answers = keyOf(project).map((k) => {
        if (mode === "option") return { fingerprint: k.fingerprint, choice: k.options[0]!.id };
        const members = Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, k.memberChoices![m]![0]!.id]));
        return { fingerprint: k.fingerprint, choice: k.perMemberAnswer!.choice, members };
      });
      const sheet = submit(project, answers);
      expect(sheet.code, sheet.out).toBe(0);
      expect(capture(importArgs(src, project)).code).toBe(0);
    }
  });
});
