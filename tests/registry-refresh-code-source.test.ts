/**
 * The narrow write that refreshes the code source of a record (spec 033 D18): by exact name only, never on a record with
 * no code source, a code record is rewritten from the current source and a linked record gains only its code reference
 * and the tokens read from code. Every other field and every other record stays as it is, and the result is validated.
 */
import { describe, expect, it } from "vitest";
import { refreshCodeSource } from "../src/commands/registry-refresh-code-source.js";
import { RegistryError, validateSourceAuthoredComponentRecord } from "../src/core/registry-store.js";
import type { Registry } from "../src/core/registry-store.js";

const figmaProvenance = { kind: "figma", sourceRef: "figma:1:1", sha256: "sha256-AAAA" };
const OLD = { sourceRef: "src/a/Card.tsx:1-3", sha256: "sha256-OLD" };
const NEW = { sourceRef: "src/a/Card.tsx:2-5", sha256: "sha256-NEW" };
const record = (over: Record<string, unknown>) => validateSourceAuthoredComponentRecord({ name: "X", category: "ui", markup: "old markup", tokensUsed: ["color.ink"], ...over });
const registry = (): Registry => ({
  version: "1",
  components: [
    record({ name: "Linked", provenance: figmaProvenance, code: OLD, variants: ["Size=Small"], description: "kept", status: "stable", scope: "local", deprecated: true }),
    record({ name: "Own", provenance: { kind: "code", ...OLD }, variants: ["Tone=a"], description: "kept too", status: "stable", scope: "local" }),
    record({ name: "Bare", provenance: figmaProvenance }),
  ],
});
const refresh = (name: string, over: Record<string, unknown> = {}) =>
  refreshCodeSource(registry(), { name, code: NEW, markup: "new markup", tokens: ["color.surface"], variants: [], ...over });
const codeOf = (error: unknown): string | undefined => (error instanceof RegistryError ? error.code : undefined);

describe("a record with a code provenance", () => {
  it("is rewritten from the current source: provenance reference and hash, markup, tokens and variants; every other field is kept", () => {
    const next = refresh("Own", { variants: ["Tone=b"] }).components.find((c) => c.name === "Own")!;
    expect(next).toMatchObject({ provenance: { kind: "code", ...NEW }, markup: "new markup", tokensUsed: ["color.surface"], variants: ["Tone=b"], description: "kept too", status: "stable", scope: "local", category: "ui" });
  });
  it("loses its variants when the current source states none exactly, never keeps stale ones", () => {
    expect(refresh("Own").components.find((c) => c.name === "Own")!.variants).toBeUndefined();
  });
});

describe("a record linked to a record of another door", () => {
  it("rewrites only its code reference and adds the tokens read from code; name, markup, provenance, variants and the rest stay", () => {
    const before = registry().components.find((c) => c.name === "Linked")!;
    const next = refresh("Linked", { variants: ["Size=Large"], markup: "other" }).components.find((c) => c.name === "Linked")!;
    const { code, tokensUsed, ...rest } = next;
    const { code: wasCode, tokensUsed: wasTokens, ...wasRest } = before;
    expect(rest).toEqual(wasRest);
    expect(wasCode).toEqual(OLD);
    expect(code).toEqual(NEW);
    expect(wasTokens).toEqual(["color.ink"]);
    expect(tokensUsed).toEqual(["color.ink", "color.surface"]); // a token the code no longer references is kept
  });
});

describe("what it refuses", () => {
  it("a name that is not held exactly", () => {
    for (const name of ["linked", "Nope"]) {
      try { refresh(name); expect.unreachable(); } catch (e) { expect(codeOf(e)).toBe("NAME_NOT_FOUND"); }
    }
  });
  it("a record with no code source: it is linked or registered first, never refreshed into one", () => {
    try { refresh("Bare"); expect.unreachable(); } catch (e) { expect(codeOf(e)).toBe("CODE_SOURCE_MISSING"); }
  });
  it("a reference that is not a source reference, so the result is validated and not trusted", () => {
    expect(() => refresh("Linked", { code: { sourceRef: "no-lines", sha256: "sha256-NEW" } })).toThrow(RegistryError);
    expect(() => refresh("Own", { code: { sourceRef: NEW.sourceRef, sha256: "nope" } })).toThrow(RegistryError);
  });
  it("touches no other record and leaves the input registry as it was", () => {
    const input = registry();
    const snapshot = JSON.stringify(input);
    const next = refreshCodeSource(input, { name: "Own", code: NEW, markup: "m", tokens: [], variants: [] });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(next.components.filter((c) => c.name !== "Own")).toEqual(input.components.filter((c) => c.name !== "Own"));
  });
});
