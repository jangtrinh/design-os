/**
 * Fix round 2, section P: a registered component whose code is gone is listed and nothing is deleted; `separate` where
 * `<name> · code` is held by another door is its own named refusal, shown before `--apply`; and a link keeps every field
 * the code reference does not own.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { WORKSPACE_TWO_APPS, answerKind, envelope, projectFrom, surface } from "./ds-surface-helpers.js";
import { NOW, answerMatch, apply, figma, readyProject, registryOf } from "./ds-surface-source-match-helpers.js";

describe("a registered component whose code is gone is listed, and nothing is deleted", () => {
  const registered = (): string => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "same"])) }));
    expect(apply(p).code).toBe(0);
    return p;
  };
  it("lists the record, the text says so, and the registry is untouched", () => {
    const p = registered();
    const before = registryOf(p).components.map((c) => c.name).sort();
    expect(before).toContain("Badge");
    rmSync(join(p, "src", "components", "ui", "Badge.tsx"));
    const d = envelope(surface(p, "--register").out).data!["register"];
    expect(d["registeredNotFound"].map((r: { name: string }) => r.name)).toEqual(["Badge"]);
    expect(capture(["ds", "surface", "--cwd", p, "--register"]).out).toContain("registered from code but no longer found: 1 record");
    expect(registryOf(p).components.map((c) => c.name).sort()).toEqual(before);
  });
  it("lists nothing while every registered component is still in the app", () => {
    expect(envelope(surface(registered(), "--register").out).data!["register"]["registeredNotFound"]).toEqual([]);
  });
});

describe("a record of another app root is not reported by a run that did not read that app", () => {
  it("registering app web does not make app admin's preview list web's records as gone", () => {
    const comp = (n: string): string => `export const ${n} = () => <i />;\n`;
    const p = projectFrom({
      ...WORKSPACE_TWO_APPS,
      ...Object.fromEntries(["Wa", "Wb", "Wc"].map((n) => [`apps/web/components/${n}.tsx`, comp(n)])),
      ...Object.fromEntries(["Xa", "Xb", "Xc"].map((n) => [`apps/admin/components/${n}.tsx`, comp(n)])),
    });
    surface(p);
    answerKind(p, "app-roots", (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "keep"])) }));
    const written = surface(p, "--app", "apps/web", "--register", "--apply", "--now", NOW);
    expect(written.code, written.out).toBe(0);
    const d = envelope(surface(p, "--app", "apps/admin", "--register").out).data!["register"];
    expect(d["registeredNotFound"]).toEqual([]);
    expect(envelope(surface(p, "--app", "apps/web", "--register").out).data!["register"]["registeredNotFound"]).toEqual([]);
  });
});

describe("separate where `<name> · code` is held by another door", () => {
  const held = (): string => {
    const p = readyProject([figma("Card", 1, ["color.ink"]), figma("Card · code", 9, [])]);
    answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "separate"])) }));
    return p;
  };
  it("is listed in the preview under its own key, before any --apply", () => {
    const d = envelope(surface(held(), "--register").out).data!["register"];
    expect(d["separateNameHeld"]).toEqual([{ name: "Card", heldBy: "Card · code" }]);
    expect(d["wouldRefuse"].byCode).toEqual({});
  });
  it("--apply is refused by its own code, writes nothing, and says what the owner does", () => {
    const p = held();
    const before = hashTree(p, ["design"]);
    const r = apply(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.code).toBe("SURFACE_SEPARATE_NAME_HELD");
    expect(e.message).toContain('"Card · code" is held by a record from figma:9:1'); // the facts; the answer cannot be changed by another answer (see fix3-small-fixes)
    expect(hashTree(p, ["design"])).toBe(before);
  });
});

describe("a linked record keeps every field the code reference does not own", () => {
  it("figmaNode, description, states and scope survive a link", () => {
    const p = readyProject([figma("Card", 1, ["color.ink"], { figmaNode: "Card.figma.json", description: "A card", states: ["hover"], scope: "global" })]);
    const before = registryOf(p).components.find((c) => c.name === "Card")!;
    answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "same"])) }));
    expect(apply(p).code).toBe(0);
    const after = registryOf(p).components.find((c) => c.name === "Card")!;
    const strip = (r: unknown): Record<string, unknown> => Object.fromEntries(Object.entries(r as Record<string, unknown>).filter(([k]) => k !== "code" && k !== "tokensUsed"));
    expect(strip(after)).toEqual(strip(before));
    expect(after.code).toBeDefined();
    expect((after as { figmaNode?: string }).figmaNode).toBe("Card.figma.json");
  });
});
