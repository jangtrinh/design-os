/**
 * The record that carries a code reference and the narrow write that adds it (spec 033 D16): the `code` field has exactly
 * two keys, a link is by exact name, never replaces a code record and never links twice, and every reader of a record
 * accepts the field.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { linkCodeSource } from "../src/commands/registry-link-code-source.js";
import { RegistryError, validateComponentRecord, validateSourceAuthoredComponentRecord } from "../src/core/registry-store.js";
import type { Registry } from "../src/core/registry-store.js";
import { capture } from "./owner-rulings-helpers.js";
import { TOKENS_FILE, fixtureCopy } from "./ds-surface-helpers.js";
import { answerMatch, apply, readyProject, registryOf } from "./ds-surface-source-match-helpers.js";

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
