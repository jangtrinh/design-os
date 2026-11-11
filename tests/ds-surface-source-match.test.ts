/**
 * A component found in code whose name is already in the sealed registry from another door is asked about, then linked
 * (spec 033 FR-027, owner decision D16). "Same" keeps the existing record byte for byte and adds a `code` reference and
 * the tokens read from code; "separate" registers the code component as `<name> · code`; nothing is linked by name alone
 * and no record is replaced. The same door is not a question: a code record that is unchanged is skipped, one whose
 * source changed is refused by name.
 */
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkCodeSource } from "../src/commands/registry-link-code-source.js";
import { BatchRegisterError, registerRecordsOnce } from "../src/commands/registry-register-batch.js";
import type { BatchLink } from "../src/commands/registry-register-batch.js";
import { RegistryError, validateComponentRecord, validateSourceAuthoredComponentRecord } from "../src/core/registry-store.js";
import type { ComponentRecord, Registry } from "../src/core/registry-store.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { TOKENS_FILE, answerKind, envelope, fixtureCopy, keyOf, sealedFixture, submit, surface } from "./ds-surface-helpers.js";

const COLLISION = "component-name-collision";
const MATCH = "component-source-match";
const NOW = "2026-11-11T09:00:00Z";
type Rec = ComponentRecord & { code?: { sourceRef: string; sha256: string } };
const registryOf = (p: string): { components: Rec[] } => JSON.parse(readFileSync(join(p, "design", "component-registry.json"), "utf8")) as { components: Rec[] };
const manifestOf = (p: string) => JSON.parse(readFileSync(join(p, "design", "ds.manifest.json"), "utf8")) as { generation: number; changelog: { kind: string; note?: string }[] };
const pending = (p: string) => readPending(p).clusters.filter((c) => c.kind === MATCH);
const apply = (p: string, ...more: string[]) => surface(p, "--register", "--apply", "--now", NOW, ...more);

const figma = (name: string, n: number, tokensUsed: string[], extra: Record<string, unknown> = {}) => ({
  name, category: "Library", markup: `<div data-figma="${name}"></div>`, tokensUsed, scope: "local", variants: ["Size=Small"],
  provenance: { kind: "figma", sourceRef: `figma:${n}:1`, sha256: "sha256-AAAA" }, ...extra,
});
/** The fixture sealed together with a Figma-door registry (`ui ds import --registry`), as an owner's project would be. */
function sealedFromFigma(records: unknown[], project = fixtureCopy(), more: string[] = []): string {
  const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-figma-")), "component-registry.json");
  writeFileSync(file, JSON.stringify({ version: "1", components: records }));
  const done = capture(["ds", "import", TOKENS_FILE, "--dir", project, "--registry", file, "--json", ...more]);
  if (done.code !== 0) throw new Error(done.out + done.err);
  return project;
}
const BASE = (): unknown[] => [figma("Card", 1, ["color.ink"]), figma("Panel", 2, ["space.md"], { provenance: undefined }), figma("Gone", 3, [])];
function readyProject(records: unknown[] = BASE()): string {
  const p = sealedFromFigma(records);
  const file = join(p, "src/components/ui/Button.tsx");
  writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', "")); // the planted undeclared token is refused by a sealed store
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
  surface(p, "--register");
  return p;
}
const answerMatch = (p: string, pick: (k: ReturnType<typeof keyOf>[number]) => Record<string, unknown>) => answerKind(p, MATCH, pick);

describe("the question", () => {
  it("lists the names found in both doors with the id of the existing source and the code file, in the claude key", () => {
    const p = readyProject();
    const [c] = pending(p);
    expect(c!.members).toEqual([
      "Card#figma:1:1,src/components/ui/Card.tsx",
      "Panel#no-provenance,src/components/kit/Panel.tsx",
    ]);
    expect(c!.options.map((o) => o.id)).toEqual(["same", "separate", "review-individually"]);
    expect(c!.labels).toEqual({
      "Card#figma:1:1,src/components/ui/Card.tsx": "Card",
      "Panel#no-provenance,src/components/kit/Panel.tsx": "Panel",
    });
    // the sheet prints each label as `name (id)`: the id names the existing source and the code file
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", p]).out;
    expect(sheet).toContain("- Card (Card#figma:1:1,src/components/ui/Card.tsx)");
    expect(sheet).toContain("- Panel (Panel#no-provenance,src/components/kit/Panel.tsx)");
  });
  it("computes each consequence for its own option from the members", () => {
    const [c] = pending(readyProject());
    expect(c!.options[0]!.consequence).toBe("2 record(s) keep their provenance and gain a code reference; 2 token path(s) are added from code");
    expect(c!.options[1]!.consequence).toBe("2 new record(s) named \"<name> · code\" are written; the existing records are not touched");
  });
  it("is shown with the preview, and a name in an open collision raises nothing yet (which file is public comes first)", () => {
    const p = sealedFromFigma([...BASE(), figma("Button", 4, [])]);
    surface(p);
    expect(pending(p)).toHaveLength(0); // the collision is asked alone
    expect(readPending(p).clusters.map((c) => c.kind)).toEqual([COLLISION]);
    const d = envelope(surface(p, "--register").out).data!["register"];
    expect(d["awaitingRuling"].map((c: { name: string }) => c.name)).toEqual(["Button"]);
    expect(d["awaitingSourceMatch"].map((c: { name: string }) => c.name)).toEqual(["Card", "Panel"]); // Button is held back until its collision is ruled
  });
  it("blocks --apply with the cluster in pending.json, writes nothing but the pending questions, and still previews", () => {
    const p = readyProject();
    const before = hashTree(p, [".design-os"]);
    const preview = envelope(surface(p, "--register").out).data!["register"];
    expect(preview["awaitingSourceMatch"].map((i: { name: string }) => i.name)).toEqual(["Card", "Panel"]);
    expect(preview["records"].map((r: { name: string }) => r.name)).toEqual(["Avatar", "Badge", "Button", "Tabs"]);
    const r = apply(p);
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(pending(p)).toHaveLength(1);
  });
  it("raises nothing without --register", () => {
    const p = readyProject();
    surface(p);
    expect(pending(p)).toHaveLength(1); // the stored question is not dropped by a call that does not ask it
    const q = sealedFixture();
    surface(q);
    expect(readPending(q).clusters.some((c) => c.kind === MATCH)).toBe(false);
  });
});

describe("same", () => {
  const same = (): string => { const p = readyProject(); expect(answerMatch(p, (k) => ({ choice: k.options.find((o) => o.id === "same")!.id })).code).toBe(0); return p; };
  it("keeps the existing record byte for byte, adds the code reference and the sorted union of tokens, and reseals once", () => {
    const p = same();
    const before = registryOf(p).components;
    const generation = manifestOf(p).generation;
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const after = registryOf(p).components;
    const card = after.find((c) => c.name === "Card")!;
    const was = before.find((c) => c.name === "Card")!;
    const { code, tokensUsed, ...rest } = card;
    const { tokensUsed: wasTokens, ...wasRest } = was;
    expect(rest).toEqual(wasRest); // name, markup, provenance, variants, pointer: untouched
    expect(card.provenance).toEqual({ kind: "figma", sourceRef: "figma:1:1", sha256: "sha256-AAAA" });
    expect(code).toEqual({ sourceRef: "src/components/ui/Card.tsx:3-5", sha256: expect.stringMatching(/^sha256-/) });
    expect(wasTokens).toEqual(["color.ink"]);
    expect(tokensUsed).toEqual(["color.ink", "color.surface"]);
    expect(after.find((c) => c.name === "Panel")!.tokensUsed).toEqual(["color.surface", "space.md"]);
    expect(after.find((c) => c.name === "Gone")).toEqual(before.find((c) => c.name === "Gone"));
    expect(after.map((c) => c.name)).toEqual(["Avatar", "Badge", "Button", "Card", "Gone", "Panel", "Tabs"]);
    expect(manifestOf(p).generation).toBe(generation + 1);
    const entries = manifestOf(p).changelog.filter((e) => e.kind === "register");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.note).toBe("4 new, 2 linked, 0 separate");
    expect(capture(["ds", "status", "--dir", p, "--json"]).code).toBe(0);
  });
  it("a second --apply is all unchanged: exit 0, nothing written, no reseal", () => {
    const p = same();
    apply(p);
    const generation = manifestOf(p).generation;
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["register"]).toMatchObject({ unchanged: 6, changed: [], records: [], links: [] });
    expect(manifestOf(p).generation).toBe(generation);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("a source that changed after --apply is refused by name under one code, nothing is written, and the next action is named", () => {
    const p = same();
    apply(p);
    const file = join(p, "src/components/ui/Card.tsx");
    writeFileSync(file, readFileSync(file, "utf8").replace("p-4", "p-6"));
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.code).toBe("SURFACE_REGISTERED_SOURCE_CHANGED");
    expect(e.message).toContain("Card");
    expect(e.message).toContain("ui registry register");
    expect(e.message).toContain("--force");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
});

describe("separate", () => {
  it("registers each code component as '<name> · code' with a code provenance and leaves the existing records alone", () => {
    const p = readyProject();
    expect(answerMatch(p, (k) => ({ choice: k.options.find((o) => o.id === "separate")!.id })).code).toBe(0);
    const before = registryOf(p).components;
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const after = registryOf(p).components;
    expect(after.map((c) => c.name)).toEqual(["Avatar", "Badge", "Button", "Card", "Card · code", "Gone", "Panel", "Panel · code", "Tabs"]);
    expect(after.find((c) => c.name === "Card · code")).toMatchObject({ provenance: { kind: "code", sourceRef: "src/components/ui/Card.tsx:3-5" }, tokensUsed: ["color.ink", "color.surface"] });
    for (const name of ["Card", "Panel", "Gone"]) expect(after.find((c) => c.name === name)).toEqual(before.find((c) => c.name === name));
    expect(manifestOf(p).changelog.filter((e) => e.kind === "register").at(-1)!.note).toBe("4 new, 0 linked, 2 separate");
    const again = apply(p);
    expect(envelope(again.out).data!["register"]).toMatchObject({ unchanged: 6, changed: [], records: [] });
  });
});

describe("per member and from the key alone", () => {
  it("answers with the claude key: an option, and a per-member mix", () => {
    const p = readyProject();
    const [entry] = keyOf(p).filter((k) => k.kind === MATCH);
    expect(entry!.options.map((o) => o.id)).toEqual(["same", "separate", "review-individually"]);
    expect(entry!.options[0]!.assigns).toBeDefined();
    const members = entry!.perMemberAnswer!.members;
    const done = submit(p, [{ fingerprint: entry!.fingerprint, choice: entry!.perMemberAnswer!.choice, members: { [members[0]!]: "same", [members[1]!]: "separate" } }]);
    expect(done.code, done.out).toBe(0);
    expect(apply(p).code).toBe(0);
    const names = registryOf(p).components.map((c) => c.name);
    expect(names).toContain("Panel · code");
    expect(names).not.toContain("Card · code");
    expect(registryOf(p).components.find((c) => c.name === "Card")!.code).toBeDefined();
  });
  it("a rename of an unrelated file and a reorder of the tree ask nothing", () => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    renameSync(join(p, "src/components/kit/Avatar.tsx"), join(p, "src/components/kit/Face.tsx"));
    surface(p, "--register");
    expect(pending(p)).toHaveLength(0);
  });
  it("a code file that moved asks again", () => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    renameSync(join(p, "src/components/kit/Panel.tsx"), join(p, "src/components/kit/Pane.tsx"));
    writeFileSync(join(p, "src/components/kit/Pane.tsx"), readFileSync(join(p, "src/components/kit/Pane.tsx"), "utf8").replace("Panel", "Panel")); // same export, new file
    surface(p, "--register");
    expect(pending(p)[0]!.members).toEqual(["Panel#no-provenance,src/components/kit/Pane.tsx"]);
  });
  it("a Figma record re-sealed under another node id asks again", () => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    const file = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-reseal-")), "r.json");
    writeFileSync(file, JSON.stringify({ version: "1", components: [figma("Card", 9, ["color.ink"]), figma("Panel", 2, ["space.md"], { provenance: undefined })] }));
    expect(capture(["ds", "import", TOKENS_FILE, "--dir", p, "--registry", file, "--force", "--reset-registry", "--json"]).code).toBe(0);
    surface(p, "--register");
    expect(pending(p)[0]!.members).toEqual(["Card#figma:9:1,src/components/ui/Card.tsx"]);
  });
});

describe("the same door is not a question", () => {
  it("--apply twice on one tree: the second run exits 0, writes nothing and does not reseal", () => {
    const p = readyProject([figma("Gone", 3, [])]);
    expect(apply(p).code).toBe(0);
    const generation = manifestOf(p).generation;
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["register"]).toMatchObject({ unchanged: 6, records: [], awaitingSourceMatch: [] });
    expect(manifestOf(p).generation).toBe(generation);
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(pending(p)).toHaveLength(0);
  });
  it("a code record whose source changed is refused by name, never replaced", () => {
    const p = readyProject([figma("Gone", 3, [])]);
    apply(p);
    const file = join(p, "src/components/kit/Avatar.tsx");
    writeFileSync(file, readFileSync(file, "utf8").replace("rounded-full", "rounded-lg"));
    const r = apply(p);
    expect(envelope(r.out).error?.code).toBe("SURFACE_REGISTERED_SOURCE_CHANGED");
    expect(envelope(r.out).error?.message).toContain("Avatar");
  });
  it("the same text at other lines is a changed reference, refused by name", () => {
    const p = readyProject([figma("Gone", 3, [])]);
    apply(p);
    const file = join(p, "src/components/kit/Avatar.tsx");
    writeFileSync(file, `// a line above\n${readFileSync(file, "utf8")}`);
    const r = apply(p);
    expect(envelope(r.out).error?.code).toBe("SURFACE_REGISTERED_SOURCE_CHANGED");
    expect(envelope(r.out).error?.message).toMatch(/Avatar: src\/components\/kit\/Avatar\.tsx:\d+-\d+ is now src\/components\/kit\/Avatar\.tsx:\d+-\d+/);
  });
  it("a changed source stops the whole write: a component that is new in the same run is not written either", () => {
    const p = readyProject([figma("Gone", 3, [])]);
    apply(p);
    const file = join(p, "src/components/kit/Avatar.tsx");
    writeFileSync(file, readFileSync(file, "utf8").replace("rounded-full", "rounded-lg"));
    writeFileSync(join(p, "src/components/kit/Fresh.tsx"), "export function Fresh() { return <div className=\"bg-surface\" />; }\n");
    const before = hashTree(p, [".design-os"]);
    expect(envelope(apply(p).out).error?.code).toBe("SURFACE_REGISTERED_SOURCE_CHANGED");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(registryOf(p).components.map((c) => c.name)).not.toContain("Fresh");
  });
});

describe("one batch", () => {
  it("a refused record refuses the links with it: nothing is written, the existing record gains nothing", () => {
    const p = sealedFromFigma(BASE());
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    surface(p, "--register");
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    const before = hashTree(p, [".design-os"]);
    const r = apply(p); // Button still holds the planted undeclared token, which the sealed store's markup rule refuses
    expect(envelope(r.out).error?.code).toBe("BATCH_REFUSED");
    expect(envelope(r.out).error?.message).toContain("Button: REGISTRY_MARKUP_DRIFT");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(registryOf(p).components.find((c) => c.name === "Card")!.code).toBeUndefined();
  });
  it("checks a link the way it checks a record: a token the store lacks, and a source that points at no file, are refused by name", () => {
    const p = sealedFromFigma(BASE());
    const link = { name: "Card", sourceRef: "src/components/ui/Card.tsx:3-5", tokens: ["color.nope"] };
    const refused = (links: BatchLink[]): { name: string; code: string }[] => {
      try { registerRecordsOnce(p, [], links, NOW, "test"); } catch (e) { return (e as BatchRegisterError).refusals; }
      throw new Error("the link must be refused");
    };
    expect(refused([link])).toMatchObject([{ name: "Card", code: "BAD_TOKEN" }]);
    expect(refused([{ ...link, tokens: [], sourceRef: "src/nowhere/Card.tsx:1-2" }])).toMatchObject([{ name: "Card", code: "REGISTRY_BAD_SOURCE_REF" }]);
    expect(refused([{ ...link, tokens: [], name: "Nope" }])).toMatchObject([{ name: "Nope", code: "NAME_NOT_FOUND" }]);
    expect(registryOf(p).components.find((c) => c.name === "Card")!.code).toBeUndefined();
  });
  it("writes nothing and does not reseal when there is nothing to write", () => {
    const p = sealedFromFigma(BASE());
    const generation = manifestOf(p).generation;
    const done = registerRecordsOnce(p, [], [], NOW, "test");
    expect(done).toMatchObject({ registered: 0, linked: 0, separate: 0, sealed: true, generation });
    expect(manifestOf(p).generation).toBe(generation);
  });
});

describe("the text form", () => {
  it("names the awaiting names before the ruling, the links after it, and the counts when applied", () => {
    const p = readyProject();
    const text =(...extra: string[]): string => capture(["ds", "surface", "--cwd", p, "--register", ...extra]).out;
    expect(text()).toContain("awaiting a ruling: 2 components have the name of a record already in the registry");
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    expect(text()).toMatch(/links: 2 existing records would gain a code reference[\s\S]*Card {2}src\/components\/ui\/Card\.tsx:3-5 {2}tokens added: color\.surface/);
    expect(text("--apply", "--now", NOW)).toContain("applied: 4 new, 2 linked, 0 separate; written to design/component-registry.json, resealed once");
    expect(text()).toContain("unchanged: 6 components already registered from exactly this source");
    expect(text("--apply", "--now", NOW)).toContain("applied: nothing to write, the registry is as the tree says; no reseal (generation 2)");
  });
});

describe("the record shape and the link function", () => {
  const rec = { name: "Card", category: "x", markup: "m", tokensUsed: ["color.ink"], provenance: { kind: "figma", sourceRef: "figma:1:1", sha256: "sha256-AAAA" } };
  const code = { sourceRef: "src/a/Card.tsx:1-3", sha256: "sha256-BBBB" };
  it("accepts a `code` reference of exactly sourceRef and sha256, with the shape of a code provenance", () => {
    expect(validateSourceAuthoredComponentRecord({ ...rec, code }).code).toEqual(code);
    expect(() => validateSourceAuthoredComponentRecord({ ...rec, code: { ...code, kind: "code" } })).toThrow(/unexpected property 'kind'/);
    expect(() => validateComponentRecord({ ...rec, code })).toThrow(RegistryError); // the strict name rule of a design-owned record still applies
    expect(() => validateSourceAuthoredComponentRecord({ ...rec, code: { sourceRef: "no-lines", sha256: "sha256-BBBB" } })).toThrow(RegistryError);
    expect(() => validateSourceAuthoredComponentRecord({ ...rec, code: { sourceRef: code.sourceRef, sha256: "nope" } })).toThrow(RegistryError);
    expect(() => validateSourceAuthoredComponentRecord({ ...rec, code: "x" })).toThrow(RegistryError);
  });
  it("links by exact name only, never replaces a code record, and never links twice", () => {
    const reg: Registry = { version: "0.1.0", components: [validateSourceAuthoredComponentRecord(rec), validateSourceAuthoredComponentRecord({ ...rec, name: "Own", provenance: { kind: "code", sourceRef: "src/a/Own.tsx:1-2", sha256: "sha256-CC" } })] };
    const linked = linkCodeSource(reg, { name: "Card", code, tokens: ["color.surface", "color.ink"] });
    expect(linked.components[0]).toMatchObject({ name: "Card", code, tokensUsed: ["color.ink", "color.surface"], provenance: rec.provenance, markup: "m" });
    expect(() => linkCodeSource(reg, { name: "card", code, tokens: [] })).toThrow(RegistryError);
    expect(() => linkCodeSource(reg, { name: "Card", code: { sourceRef: "no-lines", sha256: code.sha256 }, tokens: [] })).toThrow(RegistryError); // the linked record is validated, not trusted
    expect(() => linkCodeSource(reg, { name: "Own", code, tokens: [] })).toThrow(/already/);
    expect(() => linkCodeSource(linked, { name: "Card", code, tokens: [] })).toThrow(/already/);
  });
});

describe("the consumers of a record accept the new field", () => {
  const linked = (): string => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    expect(apply(p).code).toBe(0);
    return p;
  };
  it("ui registry lookup and list show a linked record, and ds specimen, context, docs, status and diff still read the store", () => {
    const p = linked();
    const file = join(p, "design", "component-registry.json");
    expect(capture(["registry", "lookup", "Card", "--file", file, "--json"]).out).toContain("\"code\"");
    expect(capture(["registry", "list", "--file", file, "--json"]).code).toBe(0);
    for (const args of [["ds", "specimen", "--dir", p], ["ds", "context", "--dir", p, "--format", "json"], ["ds", "docs", "--dir", p], ["ds", "status", "--dir", p, "--json"], ["ds", "diff", join(p, "design"), join(p, "design")]]) {
      const r = capture(args);
      expect(r.code, `${args.join(" ")}: ${r.out}${r.err}`).toBe(0);
    }
  });
  it("the registry schema describes the code reference exactly: sourceRef and sha256, no other key", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "component-registry.schema.json"), "utf8")) as { $defs: { component: { properties: { code: unknown } } } };
    const ajv = new (createRequire(import.meta.url)("ajv/dist/2020.js").default as new (o: { strict: boolean }) => { compile: (s: unknown) => (v: unknown) => boolean })({ strict: false });
    const check = ajv.compile(schema.$defs.component.properties.code); // the record's `name` pattern is the design-owned Family/Name form, which source-authored names never matched
    const stored = registryOf(linked()).components.find((c) => c.code !== undefined)!.code!;
    expect(check(stored)).toBe(true);
    expect(check({ ...stored, extra: 1 })).toBe(false);
    expect(check({ sourceRef: "no-lines", sha256: stored.sha256 })).toBe(false);
  });
  it("ui ds import --registry takes a linked registry into a fresh project and keeps the field", () => {
    const registry = join(linked(), "design", "component-registry.json");
    const fresh = fixtureCopy();
    const done = capture(["ds", "import", TOKENS_FILE, "--dir", fresh, "--registry", registry, "--json"]);
    expect(done.code, done.out + done.err).toBe(0);
    expect(registryOf(fresh).components.find((c) => c.name === "Card")!.code).toMatchObject({ sourceRef: "src/components/ui/Card.tsx:3-5" });
  });
});
