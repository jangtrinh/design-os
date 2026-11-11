/**
 * A component name exported from more than one file is asked, never resolved (spec 033 FR-020, AC-10). The question is
 * assigned: each member is one name plus its files, each option says which directory is the public layer and gives
 * every member the file in it by path, and nothing is dropped: the losing files are listed as shadowed with the
 * fingerprint of the ruling. The answer key alone is enough to answer, with an option and with a per-member answer.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import { collisionMemberOf, collisionNameDetections, componentNameCollisionEmitter } from "../src/core/owner-rulings/kind-component-name-collision.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { answerKind, envelope, sealedFixture, surface } from "./ds-surface-helpers.js";

const BUTTON = "Button#src/components/kit/Button.tsx,src/components/ui/Button.tsx";
const UI_BUTTON = "src/components/ui/Button.tsx";
const KIT_BUTTON = "src/components/kit/Button.tsx";
const COLLISION = "component-name-collision";
const pending = (p: string) => readPending(p).clusters.filter((c) => c.kind === COLLISION);

describe("the emitter", () => {
  const input = { collisions: [{ name: "Button", files: [KIT_BUTTON, UI_BUTTON] }, { name: "Chip", files: ["src/a/Chip.tsx", "src/b/Chip.tsx", "src/c/Chip.tsx"] }], dirSizes: { "src/components/ui": 9, "src/components/kit": 3, "src/a": 1, "src/b": 5, "src/c": 5 } };
  const clusterOf = (members: string[], d = collisionNameDetections(input)[0]!) => { const a = d.ask(members); return buildCluster({ kind: COLLISION, members, ...a, raisedBy: "ds surface" }); };

  it("raises on a name exported from two directories and not on an empty list (the kinds coverage pair)", () => {
    expect(componentNameCollisionEmitter.detect({ collisions: [] })?.members).toEqual([]);
    expect(componentNameCollisionEmitter.detect(input)?.members).toEqual([BUTTON]);
  });
  it("makes one detection per set of directories that collide with each other", () => {
    expect(collisionNameDetections(input).map((d) => d.members)).toEqual([[BUTTON], ["Chip#src/a/Chip.tsx,src/b/Chip.tsx,src/c/Chip.tsx"]]);
  });
  it("a member is the name plus the sorted files, whatever order the files came in", () => {
    expect(collisionMemberOf({ name: "Button", files: [UI_BUTTON, KIT_BUTTON] })).toBe(BUTTON);
  });
  it("offers a directory option per directory that holds one file of every member, largest first, ties by path, then review individually", () => {
    const c = clusterOf(["Chip#src/a/Chip.tsx,src/b/Chip.tsx,src/c/Chip.tsx"], collisionNameDetections(input)[1]!);
    expect(c.options.map((o) => o.id)).toEqual(["public-dir:src/b", "public-dir:src/c", "public-dir:src/a", "review-individually"]);
    expect(Object.values(c.options[0]!.assigns!)).toEqual(["keep:src/b/Chip.tsx"]);
  });
  it("offers no positional option and no exclude outcome, and gives each member its files as choices by path", () => {
    const c = clusterOf([BUTTON]);
    expect(c.options.map((o) => o.id).join(" ")).not.toMatch(/first|exclude|none|drop/i);
    expect(c.memberChoices![BUTTON]!.map((m) => m.id)).toEqual([`keep:${KIT_BUTTON}`, `keep:${UI_BUTTON}`]);
    expect(c.labels![BUTTON]).toBe(`Button: ${KIT_BUTTON} or ${UI_BUTTON}`);
  });
  it("computes each consequence for its own option: the losing files per directory", () => {
    const wide = { collisions: [{ name: "Chip", files: ["src/a/Chip.tsx", "src/b/Chip.tsx", "src/c/Chip.tsx"] }, { name: "Tag", files: ["src/a/Tag.tsx", "src/b/Tag.tsx"] }] };
    // Tag runs between a and b only, so it is its own group: the Chip group has one member and two losing files per option.
    expect(collisionNameDetections(wide)).toHaveLength(2);
    const chip = buildCluster({ kind: COLLISION, members: collisionNameDetections(wide)[0]!.members, ...collisionNameDetections(wide)[0]!.ask(collisionNameDetections(wide)[0]!.members), raisedBy: "x" });
    expect(chip.options[0]!.consequence).toContain("the 2 other file(s) are listed as shadowed; no component leaves the output");
  });
  it("a directory with two files of one name is no option; a name no directory fits is asked on its own, per file", () => {
    const twice = { collisions: [{ name: "Chip", files: ["src/a/Chip.tsx", "src/a/Chip.jsx", "src/b/Chip.tsx"] }] };
    expect(collisionNameDetections(twice)[0]!.ask(collisionNameDetections(twice)[0]!.members).options.map((o) => o.id)).toEqual(["public-dir:src/b", "review-individually"]);
    const none = { collisions: [{ name: "Chip", files: ["src/a/Chip.tsx", "src/a/Chip.jsx", "src/b/Chip.tsx", "src/b/Chip.jsx"] }] };
    const [only] = collisionNameDetections(none);
    expect(collisionNameDetections(none)).toHaveLength(1);
    expect(only!.members).toEqual([collisionMemberOf(none.collisions[0]!)]);
    const ask = only!.ask(only!.members);
    expect(ask.options.map((o) => o.id)).toEqual(["public-file:src/a/Chip.jsx", "public-file:src/a/Chip.tsx", "public-file:src/b/Chip.jsx", "review-individually"]);
    expect(ask.memberChoices![only!.members[0]!]!.map((c) => c.id)).toEqual(["keep:src/a/Chip.jsx", "keep:src/a/Chip.tsx", "keep:src/b/Chip.jsx", "keep:src/b/Chip.tsx"]); // every file is a choice of the sheet
  });
});

describe("the question at the command", () => {
  it("is written to pending.json by a read-only run, which still reports the surface and exits 0", () => {
    const p = sealedFixture();
    const r = surface(p);
    expect(r.code).toBe(0);
    expect(envelope(r.out).data!["collisions"]).toHaveLength(1);
    const [c] = pending(p);
    expect(c).toMatchObject({ kind: COLLISION, raisedBy: "ds surface", members: [BUTTON] });
    expect(c!.options.map((o) => o.id)).toEqual(["public-dir:src/components/ui", "public-dir:src/components/kit", "review-individually"]);
  });
  it("the Markdown sheet prints each member as `name: files (id)` with its choices by path", () => {
    const p = sealedFixture();
    surface(p);
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", p]).out;
    expect(sheet).toContain(`- Button: ${KIT_BUTTON} or ${UI_BUTTON} (${BUTTON})`);
    expect(sheet).toContain(`\`keep:${KIT_BUTTON}\``);
  });
  it("blocks a write and writes nothing but the pending questions", () => {
    const p = sealedFixture();
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, "--out", "surface.json");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(pending(p)).toHaveLength(1);
  });
});

describe("after the ruling", () => {
  const ruled = (pick: "option" | "member") => {
    const p = sealedFixture();
    surface(p);
    const done = answerKind(p, COLLISION, (k) => pick === "option"
      ? { choice: k.options[0]!.id }
      : { choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, `keep:${KIT_BUTTON}`])) });
    expect(done.code, done.out).toBe(0);
    return p;
  };
  it("answered as an option from the claude key alone: the losing file is shadowed with the ruling's fingerprint and no component leaves the output", () => {
    const p = ruled("option");
    const d = envelope(surface(p).out).data!;
    const stored = JSON.parse(readFileSync(join(p, "design", "design-dir.json"), "utf8")).onboard.rulings.find((r: { kind: string }) => r.kind === COLLISION);
    expect(d["shadowed"]).toEqual([{ name: "Button", file: KIT_BUTTON, fingerprint: stored.fingerprint }]);
    expect(stored.members).toEqual({ [BUTTON]: `keep:${UI_BUTTON}` });
    expect(d["components"]).toHaveLength(7);
    expect(pending(p)).toHaveLength(0);
  });
  it("answered per member from the claude key alone: the file the owner named stays public and the other is shadowed", () => {
    const p = ruled("member");
    expect(envelope(surface(p).out).data!["shadowed"]).toMatchObject([{ name: "Button", file: UI_BUTTON }]);
  });
  it("a write now goes through: --out writes the surface, shadowed included, and nothing else", () => {
    const p = ruled("option");
    const r = surface(p, "--out", "out/surface.json");
    expect(r.code, r.out).toBe(0);
    expect(JSON.parse(readFileSync(join(p, "out", "surface.json"), "utf8")).shadowed).toHaveLength(1);
  });
  it("a reorder of the tree and an unrelated rename ask nothing and change nothing", () => {
    const p = ruled("option");
    const before = envelope(surface(p).out).data!["shadowed"];
    renameSync(join(p, "src/components/kit/Avatar.tsx"), join(p, "src/components/kit/Face.tsx"));
    writeFileSync(join(p, "src/components/kit/Face.tsx"), readFileSync(join(p, "src/components/kit/Face.tsx"), "utf8").replace("Avatar", "Face"));
    const after = envelope(surface(p).out).data!;
    expect(after["shadowed"]).toEqual(before);
    expect(pending(p)).toHaveLength(0);
  });
  it("a renamed directory is a new member and is asked again", () => {
    const p = ruled("option");
    renameSync(join(p, "src/components/kit"), join(p, "src/components/widgets"));
    const d = envelope(surface(p).out).data!;
    expect(d["shadowed"]).toEqual([]);
    expect(pending(p)).toHaveLength(1);
    expect(pending(p)[0]!.members[0]).toContain("src/components/widgets/Button.tsx");
  });
  it("a new file under a ruled name is a new member and is asked again", () => {
    const p = ruled("option");
    writeFileSync(join(p, "src/components/ui/ButtonCopy.tsx"), "export const Button = () => <button />;\n");
    surface(p);
    expect(pending(p)).toHaveLength(1);
    expect(pending(p)[0]!.members[0]).toContain("src/components/ui/ButtonCopy.tsx");
    expect(existsSync(join(p, "design", "design-dir.json"))).toBe(true);
  });
  it("a name exported twice from one directory in every directory it runs between is asked, per file, and the answer is honoured", () => {
    const p = sealedFixture();
    for (const dir of ["ui", "kit"]) for (const ext of ["tsx", "jsx"]) writeFileSync(join(p, `src/components/${dir}/Chip.${ext}`), "export const Chip = () => <i />;\n");
    expect(surface(p).code).toBe(0);
    expect(envelope(surface(p).out).data!["collisions"].map((c: { name: string }) => c.name)).toContain("Chip");
    expect(pending(p).map((c) => c.members.map((m) => m.split("#")[0]))).toEqual(expect.arrayContaining([["Button"], ["Chip"]])); // each is asked, the Chip group on its own
    expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
    const r = surface(p, "--out", "surface.json");
    expect(r.code, r.out).toBe(0);
    const out = JSON.parse(readFileSync(join(p, "surface.json"), "utf8")) as { shadowed: { name: string; file: string }[] };
    expect(out.shadowed.filter((s) => s.name === "Chip")).toHaveLength(3); // one file is kept, the other three are listed
    expect(pending(p)).toHaveLength(0);
  });
  it("the text says a question is in pending.json only for what was written there", () => {
    const p = sealedFixture();
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    expect(capture(["ds", "surface", "--cwd", p]).out).not.toContain("question:");
    writeFileSync(join(p, "src/components/ui/Chip.tsx"), "export const Chip = () => <i />;\n");
    writeFileSync(join(p, "src/components/ui/Chip.jsx"), "export const Chip = () => <i />;\n");
    expect(capture(["ds", "surface", "--cwd", p]).out).toContain("question: 1 open question in .design-os/onboard/pending.json");
  });
  it("the question goes when the collision goes", () => {
    const p = sealedFixture();
    surface(p);
    expect(pending(p)).toHaveLength(1);
    writeFileSync(join(p, KIT_BUTTON), "export function Knob() { return <button />; }\n");
    surface(p);
    expect(pending(p)).toHaveLength(0);
  });
});
