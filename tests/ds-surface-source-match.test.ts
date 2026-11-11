/**
 * A component found in code whose name is already in the sealed registry from another door is asked about once per group
 * (spec 033 FR-027, owner decision D16): the question and its members, "same" (the record keeps everything and gains the
 * code reference and the tokens), "separate" (the code component is its own record `<name> · code`), and a per-member answer.
 */
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { TOKENS_FILE, envelope, keyOf, sealedFixture, submit, surface } from "./ds-surface-helpers.js";
import { BASE, COLLISION, MATCH, answerMatch, apply, figma, manifestOf, pending, readyProject, registryOf, sealedFromFigma } from "./ds-surface-source-match-helpers.js";

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
    expect(envelope(r.out).data!["register"]).toMatchObject({ unchanged: 6, staleByRuling: [], awaitingSourceChanged: [], records: [], links: [] });
    expect(manifestOf(p).generation).toBe(generation);
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("a source that changed after --apply is asked about, nothing is written, and no refusal names a command that fails on a store that is not kit-bound", () => {
    const p = same();
    apply(p);
    const file = join(p, "src/components/ui/Card.tsx");
    writeFileSync(file, readFileSync(file, "utf8").replace("p-4", "p-6"));
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(e.message).not.toContain("--force");
    expect(e.message).not.toContain("ui registry register");
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
    expect(envelope(again.out).data!["register"]).toMatchObject({ unchanged: 6, staleByRuling: [], awaitingSourceChanged: [], records: [] });
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
