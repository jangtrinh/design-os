/**
 * The same door is not a question, and everything is written in one batch (spec 033 FR-027, owner decision D16): a code
 * record that is unchanged is skipped and counted, one whose source changed is refused by name, links and records are
 * checked together and written with one reseal.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BatchRegisterError, registerRecordsOnce } from "../src/commands/registry-register-batch.js";
import type { BatchLink } from "../src/commands/registry-register-batch.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { answerKind, envelope, surface } from "./ds-surface-helpers.js";
import { BASE, COLLISION, NOW, answerMatch, apply, figma, manifestOf, pending, readyProject, registryOf, sealedFromFigma } from "./ds-surface-source-match-helpers.js";

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
