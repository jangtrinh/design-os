/**
 * `ui ds surface --register` previews the registry records and `--apply` writes them through the shared registration
 * path (spec 033 FR-027, AC-15 code door, AC-29): `tokensUsed` equals the component's tokens, each record carries a
 * verified `code` provenance, the store is resealed once, variants are written only where a pattern reads them exactly
 * and every other component is counted under `notRead`. A name already in the registry from another door is asked
 * about (D16), never replaced, renamed or forced; the questions and the link are tested in ds-surface-source-match.test.ts.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BatchRegisterError, registerRecordsOnce } from "../src/commands/registry-register-batch.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { TOKENS_FILE, answerKind, envelope, fixtureCopy, sealedFixture, surface } from "./ds-surface-helpers.js";
import { addUnregistrableComponent, cleanButtons } from "./ds-surface-questions-helpers.js";

const COLLISION = "component-name-collision";
const NOW = "2026-11-11T09:00:00Z";
type Doc = { components: { name: string; category: string; tokensUsed: string[]; variants?: string[]; provenance?: { kind: string; sourceRef: string; sha256: string } }[] };
const registryOf = (p: string): Doc => JSON.parse(readFileSync(join(p, "design", "component-registry.json"), "utf8")) as Doc;
const manifestOf = (p: string) => JSON.parse(readFileSync(join(p, "design", "ds.manifest.json"), "utf8")) as { generation: number; changelog: { kind: string; by: string; ts: string }[] };

/** The planted `var(--color-missing)` is an undeclared token, which the sealed store's markup rule refuses; take it out where a write must succeed. */
function withoutPlantedBrokenReference(p: string): string {
  const file = join(p, "src/components/ui/Button.tsx");
  writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', ""));
  return p;
}
function rulingGiven(p: string): void {
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
}
/** The fixture sealed together with a registry that already holds `names` (the way `ui ds import --registry` seals one from Figma). */
function sealedWithRegistry(names: string[]): string {
  const dir = fixtureCopy();
  const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-reg-")), "component-registry.json");
  writeFileSync(file, JSON.stringify({ version: "1", components: names.map((name, i) => ({ name, category: "Library", markup: "", tokensUsed: [], scope: "local", provenance: { kind: "figma", sourceRef: `figma:1:${i + 1}`, sha256: "sha256-AAAA" } })) }));
  const done = capture(["ds", "import", TOKENS_FILE, "--dir", dir, "--registry", file, "--json"]);
  if (done.code !== 0) throw new Error(done.out + done.err);
  return dir;
}

describe("the register preview", () => {
  it("lists name, sourceRef (file:start-end) and tokensUsed from components[].tokens, and holds back the colliding name", () => {
    const p = sealedFixture();
    const d = envelope(surface(p, "--register").out).data!;
    const tokens = Object.fromEntries(d["components"].map((c: { file: string; tokens: string[] }) => [c.file, c.tokens]));
    expect(d["register"]["records"].map((r: { name: string }) => r.name)).toEqual(["Avatar", "Badge", "Card", "Panel", "Tabs"]);
    for (const r of d["register"]["records"]) {
      expect(r.sourceRef).toMatch(/^src\/components\/(ui|kit)\/\w+\.tsx:\d+-\d+$/);
      expect(r.tokensUsed).toEqual(tokens[r.sourceRef.replace(/:\d+-\d+$/, "")]);
    }
    expect(d["register"]["awaitingRuling"]).toEqual([{ name: "Button", files: ["src/components/kit/Button.tsx", "src/components/ui/Button.tsx"] }]);
  });
  it("reads variants only where a literal union in the props type states them, and counts every other component under notRead", () => {
    const d = envelope(surface(sealedFixture(), "--register").out).data!;
    const byName = Object.fromEntries(d["register"]["records"].map((r: { name: string; variants: string[] }) => [r.name, r.variants]));
    expect(byName["Badge"]).toEqual(["Tone=neutral", "Tone=danger"]);
    expect(byName["Tabs"]).toEqual([]); // its look is chosen through an object: nothing is inferred from the name or the keys
    expect(d["register"]["notRead"]).toEqual({ count: 4, components: ["Avatar", "Card", "Panel", "Tabs"], severalUnions: [] });
  });
  it("writes nothing: the tree is byte-identical, apart from the pending question list", () => {
    const p = sealedFixture();
    const before = hashTree(p, [".design-os"]);
    expect(capture(["ds", "surface", "--cwd", p, "--register"]).code).toBe(0);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("lists a name that is already registered from another door as awaiting a ruling, with its source and the code file, and plans no record for it", () => {
    const d = envelope(surface(sealedWithRegistry(["Card"]), "--register").out).data!;
    expect(d["register"]["awaitingSourceMatch"]).toEqual([{ name: "Card", existingSource: "figma:1:1", file: "src/components/ui/Card.tsx" }]);
    expect(d["register"]["records"].map((r: { name: string }) => r.name)).not.toContain("Card");
    expect(d["register"]["links"]).toEqual([]);
  });
});

describe("--apply through the shared registration path", () => {
  it("is refused without --register", () => {
    expect(envelope(surface(sealedFixture(), "--apply").out).error?.code).toBe("BAD_ARG");
  });
  it("is blocked while a collision has no ruling, and writes nothing", () => {
    const p = sealedFixture();
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--register", "--apply");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("writes a record per public component whose tokensUsed equals its tokens and whose provenance is a verified code ref, and reseals once", () => {
    const p = withoutPlantedBrokenReference(sealedFixture());
    rulingGiven(p);
    const generation = manifestOf(p).generation;
    const r = surface(p, "--register", "--apply", "--now", NOW);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["applied"]).toMatchObject({ registered: 6, sealed: true, generation: generation + 1 });
    const surfaceTokens = Object.fromEntries(envelope(surface(p).out).data!["components"].map((c: { file: string; tokens: string[] }) => [c.file, c.tokens]));
    const doc = registryOf(p);
    expect(doc.components.map((c) => c.name)).toEqual(["Avatar", "Badge", "Button", "Card", "Panel", "Tabs"]);
    for (const c of doc.components) {
      expect(c.provenance).toMatchObject({ kind: "code" });
      expect(c.provenance!.sourceRef).toMatch(/^src\/components\/(ui|kit)\/\w+\.tsx:\d+-\d+$/);
      expect(c.provenance!.sha256).toMatch(/^sha256-/);
      expect(c.tokensUsed).toEqual(surfaceTokens[c.provenance!.sourceRef.replace(/:\d+-\d+$/, "")]);
    }
    expect(doc.components.find((c) => c.name === "Button")!.provenance!.sourceRef).toContain("src/components/ui/Button.tsx"); // the public one; the kit file is shadowed
    expect(doc.components.find((c) => c.name === "Badge")!.variants).toEqual(["Tone=neutral", "Tone=danger"]);
    expect(doc.components.find((c) => c.name === "Card")!.variants).toBeUndefined(); // not read, so empty, not guessed
    const m = manifestOf(p);
    expect(m.generation).toBe(generation + 1);
    expect(m.changelog.filter((e) => e.kind === "register")).toHaveLength(1);
    expect(m.changelog.at(-1)).toMatchObject({ kind: "register", by: "ui ds surface --register", ts: NOW });
    expect(capture(["ds", "status", "--dir", p, "--json"]).code).toBe(0); // the seal holds
  });
  it("a record the design system's markup rule refuses is asked about, not refused: --apply is blocked by the question and writes nothing", () => {
    const p = sealedFixture();
    rulingGiven(p);
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--register", "--apply");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(readPending(p).clusters.filter((c) => c.kind === "component-lint-refused")).toHaveLength(1);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("refuses the whole batch when one record is refused by a code outside the lint family, naming it, and writes nothing", () => {
    const p = sealedFixture();
    rulingGiven(p);
    cleanButtons(p);
    addUnregistrableComponent(p);
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--register", "--apply");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("BATCH_REFUSED");
    expect(envelope(r.out).error?.message).toContain("3 of 9 record(s) were refused and nothing was written");
    expect(envelope(r.out).error?.message).toContain("OddOne: REGISTRY_BAD_SOURCE_REF");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("on a project with no sealed store writes the registry unsealed, with provenance", () => {
    const p = fixtureCopy();
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    const r = surface(p, "--register", "--apply");
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["applied"]).toMatchObject({ registered: 6, sealed: false });
    expect(registryOf(p).components[0]!.provenance).toMatchObject({ kind: "code" });
  });
});

describe("the shared registration path itself", () => {
  it("never forces: a name that is taken is refused as NAME_EXISTS and the store is untouched", () => {
    const p = sealedWithRegistry(["Card"]);
    const before = hashTree(p, [".design-os"]);
    const record = { name: "Card", category: "src/components/ui", markup: "x", tokensUsed: [], variants: [], sourceRef: "src/components/ui/Card.tsx:3-5" };
    try { registerRecordsOnce(p, [record], [], NOW, "test"); expect.unreachable("the taken name must be refused"); }
    catch (e) {
      expect(e).toBeInstanceOf(BatchRegisterError);
      expect((e as BatchRegisterError).refusals).toMatchObject([{ name: "Card", code: "NAME_EXISTS" }]);
    }
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("applies the provenance rule of a sealed store: a source reference that points at no file refuses the batch", () => {
    const p = sealedWithRegistry([]);
    const record = { name: "Ghost", category: "x", markup: "x", tokensUsed: [], variants: [], sourceRef: "src/nowhere/Ghost.tsx:1-2" };
    expect(() => registerRecordsOnce(p, [record], [], NOW, "test")).toThrow(BatchRegisterError);
  });
  it("refuses a token the sealed store does not hold", () => {
    const p = sealedFixture();
    const record = { name: "Panel", category: "x", markup: "x", tokensUsed: ["color.nope"], variants: [], sourceRef: "src/components/kit/Panel.tsx:3-10" };
    try { registerRecordsOnce(p, [record], [], NOW, "test"); expect.unreachable("an unknown token must be refused"); }
    catch (e) { expect((e as BatchRegisterError).refusals).toMatchObject([{ name: "Panel", code: "BAD_TOKEN" }]); }
  });
});

describe("a name that is already in the sealed registry", () => {
  it("--apply writes nothing at all while the question is open: exit 1, the record is not replaced", () => {
    const p = sealedWithRegistry(["Card"]);
    rulingGiven(p);
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--register", "--apply");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(registryOf(p).components.map((c) => c.name)).toEqual(["Card"]);
  });
  it("does not stop at the first name: every held name is one question and none is replaced", () => {
    const p = sealedWithRegistry(["Card", "Tabs"]);
    rulingGiven(p);
    surface(p, "--register");
    expect(readPending(p).clusters.find((c) => c.kind === "component-source-match")!.count).toBe(2);
    expect(registryOf(p).components.map((c) => c.provenance?.kind)).toEqual(["figma", "figma"]);
  });
  it("an --out given with --apply is not written either", () => {
    const p = sealedWithRegistry(["Card"]);
    rulingGiven(p);
    surface(p, "--register", "--apply", "--out", "surface.json");
    expect(() => readFileSync(join(p, "surface.json"))).toThrow();
  });
  it("a store with none of the names takes every record (the other half of the rule)", () => {
    const p = withoutPlantedBrokenReference(sealedWithRegistry(["Library/Other"]));
    rulingGiven(p);
    const r = surface(p, "--register", "--apply");
    expect(r.code, r.out).toBe(0);
    expect(registryOf(p).components).toHaveLength(7);
  });
});
