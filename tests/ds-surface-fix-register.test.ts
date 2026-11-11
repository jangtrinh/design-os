/**
 * Registration (review fix round, section G): the preview predicts the write with the same checks and lists what would be
 * refused, per code; a single literal is not a variant set; a props type with more than one literal union writes none.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readVariants, readVariantsDetail } from "../src/core/ds-surface/variants-reader.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { answerKind, envelope, pkg, projectFrom, sealedFixture, surface } from "./ds-surface-helpers.js";

const ruled = (): string => { const p = sealedFixture(); surface(p); answerKind(p, "component-name-collision", (k) => ({ choice: k.options[0]!.id })); return p; };

describe("the preview predicts the write", () => {
  it("lists the record that would be refused with its code, counted per code, and writes nothing", () => {
    const p = ruled(); // the planted undeclared var(--color-missing) in Button is refused by a sealed store's markup rule
    const before = hashTree(p, [".design-os"]);
    const d = envelope(surface(p, "--register").out).data!["register"];
    expect(d["wouldRefuse"].count).toBe(1);
    expect(d["wouldRefuse"].byCode).toEqual({ REGISTRY_MARKUP_DRIFT: 1 });
    expect(d["wouldRefuse"].items.map((i: { name: string }) => i.name)).toEqual(["Button"]);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("the write meets exactly the refusals the preview listed", () => {
    const p = ruled();
    const listed = envelope(surface(p, "--register").out).data!["register"]["wouldRefuse"].items.map((i: { name: string; code: string }) => `${i.name}:${i.code}`);
    const e = envelope(surface(p, "--register", "--apply").out).error!;
    expect(e.code).toBe("BATCH_REFUSED");
    for (const item of listed) expect(e.message).toContain(item.replace(":", ": "));
  });
  it("lists nothing when nothing would be refused, and the text says so only when something would", () => {
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/A.tsx": "export const Aaa = () => <i />;\n", "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n" });
    expect(envelope(surface(p, "--register").out).data!["register"]["wouldRefuse"]).toEqual({ count: 0, byCode: {}, items: [] });
    expect(capture(["ds", "surface", "--cwd", p, "--register"]).out).not.toContain("would be refused");
    const sealed = ruled();
    expect(capture(["ds", "surface", "--cwd", sealed, "--register"]).out).toContain("would be refused: 1 record (REGISTRY_MARKUP_DRIFT 1); --apply writes nothing while any is refused");
  });
  it("a store that drifted from its seal says the refusals could not be predicted, and the preview still shows", () => {
    const p = ruled();
    const file = join(p, "design", "design.tokens.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("#", "#0"));
    const r = envelope(surface(p, "--register").out);
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    expect(r.data!["register"]["wouldRefuse"].notChecked).toMatch(/^DS_TAMPERED/);
    expect(r.data!["register"]["records"].length).toBeGreaterThan(0);
  });
});

describe("variants are read only from exactly one literal union", () => {
  it("a single literal is not a variant set", () => {
    expect(readVariants("Tag", 'interface TagProps { kind: "only"; }\nexport const Tag = () => <i />;')).toEqual([]);
    expect(readVariantsDetail("Tag", 'interface TagProps { kind: "only"; }\nexport const Tag = () => <i />;')).toEqual({ variants: [], severalUnions: false });
  });
  it("one union is read", () => {
    expect(readVariants("Tag", 'interface TagProps { tone?: "a" | "b"; label: string }\nexport const Tag = () => <i />;')).toEqual(["Tone=a", "Tone=b"]);
  });
  it("more than one union writes none, and the component is listed under severalUnions in the preview", () => {
    const src = 'interface TagProps { tone?: "a" | "b"; size?: "s" | "m" }\nexport const Tag = (p: TagProps) => <i />;\n';
    expect(readVariantsDetail("Tag", src)).toEqual({ variants: [], severalUnions: true });
    const p = projectFrom({ "package.json": pkg({ react: "18" }), "src/components/Tag.tsx": src, "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n" });
    const d = envelope(surface(p, "--register").out).data!["register"];
    expect(d["records"].find((r: { name: string }) => r.name === "Tag").variants).toEqual([]);
    expect(d["notRead"].severalUnions).toEqual(["Tag"]);
    expect(d["notRead"].components).toContain("Tag");
    expect(capture(["ds", "surface", "--cwd", p, "--register"]).out).toContain("several variant unions: Tag hold more than one literal union");
  });
});
