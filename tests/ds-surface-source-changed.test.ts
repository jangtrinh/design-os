/**
 * A registered component whose source changed is asked about, once per group (spec 033 FR-027, owner decision D18):
 * the question and its members, `refresh` (the narrow rewrite of a code record and of a linked record), `keep` (the
 * record stays and is listed as stale), a per-member answer from the `--format claude` key alone, and the removal of
 * the refusal that named a command which fails on a store that is not kit-bound.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { envelope, keyOf, submit, surface } from "./ds-surface-helpers.js";
import { NOW, apply, manifestOf, registryOf } from "./ds-surface-source-match-helpers.js";
import { CHANGED, clustersOf, edit, registeredAndEdited, registeredProject } from "./ds-surface-questions-helpers.js";

const optionOf = (k: ReturnType<typeof keyOf>[number], id: string): string => k.options.find((o) => o.id === id)!.id;
const answerAll = (p: string, id: string) => submit(p, keyOf(p).filter((k) => k.kind === CHANGED).map((k) => ({ fingerprint: k.fingerprint, choice: optionOf(k, id) })));
const preview = (p: string, ...more: string[]) => envelope(surface(p, "--register", ...more).out).data!["register"];

describe("the question", () => {
  it("lists each changed component with the recorded source, the current source and the hashes of both, in the claude key", () => {
    const p = registeredAndEdited();
    const was = registryOf(p).components;
    const heldAvatar = was.find((c) => c.name === "Avatar")!.provenance!;
    const heldCard = was.find((c) => c.name === "Card")!.code!;
    expect(surface(p, "--register").code).toBe(0);
    const [c] = clustersOf(p, CHANGED);
    expect(c!.members).toHaveLength(2);
    const [avatar, card] = c!.members;
    expect(avatar).toMatch(/^Avatar#sha256-\S+,sha256-\S+,src\/components\/kit\/Avatar\.tsx:\d+-\d+,src\/components\/kit\/Avatar\.tsx:\d+-\d+$/);
    expect(avatar).toContain(heldAvatar.sha256);
    expect(avatar).toContain(heldAvatar.sourceRef);
    expect(card).toContain(heldCard.sha256);
    expect(card).toContain(heldCard.sourceRef);
    expect(c!.options.map((o) => o.id)).toEqual(["refresh", "keep", "review-individually"]);
    // the sheet prints each label as `name (id)`
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", p]).out;
    expect(sheet).toContain(`- Avatar (${avatar})`);
    expect(sheet).toContain(`- Card (${card})`);
  });
  it("computes each consequence for its own option: records that get a new reference, tokens that are added, removed or kept", () => {
    const p = registeredAndEdited();
    surface(p, "--register");
    const [c] = clustersOf(p, CHANGED);
    expect(c!.options[0]!.consequence).toBe("2 record(s) get a new code reference; 1 token path(s) are added; 0 token path(s) are removed from code records; 0 token path(s) the code no longer references stay on linked records");
    expect(c!.options[1]!.consequence).toBe("2 record(s) stay as they are and are listed as stale until their source changes again");
  });
  it("counts a token the code stopped referencing as removed from a code record and kept on a linked record", () => {
    const p = registeredProject();
    edit(p, "src/components/ui/Card.tsx", " text-ink", ""); // the linked record keeps color.ink: it does not say which door a token came from
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
    surface(p, "--register");
    expect(clustersOf(p, CHANGED)[0]!.options[0]!.consequence).toContain("1 token path(s) are added; 0 token path(s) are removed from code records; 1 token path(s) the code no longer references stay on linked records");
  });
  it("is shown with the preview and blocks --apply and --register --out; a read, --out alone and --register do not", () => {
    const p = registeredAndEdited();
    const before = hashTree(p, [".design-os"]);
    const shown = preview(p);
    expect(shown["awaitingSourceChanged"].map((i: { name: string }) => i.name)).toEqual(["Avatar", "Card"]);
    expect(shown["staleByRuling"]).toEqual([]);
    const blocked = apply(p);
    expect(blocked.code).toBe(1);
    expect(envelope(blocked.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(clustersOf(p, CHANGED)).toHaveLength(1);
    const out = surface(p, "--register", "--out", "o.json");
    expect(envelope(out.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(existsSync(join(p, "o.json"))).toBe(false);
  });
  it("raises nothing without --register and does not drop a stored question", () => {
    const p = registeredAndEdited();
    surface(p);
    expect(clustersOf(p, CHANGED)).toHaveLength(0);
    surface(p, "--register");
    expect(clustersOf(p, CHANGED)).toHaveLength(1);
    surface(p);
    expect(clustersOf(p, CHANGED)).toHaveLength(1);
  });
  it("no output of the command names the removed refusal or a command that fails on a store that is not kit-bound", () => {
    const p = registeredAndEdited();
    for (const args of [["--register"], ["--register", "--apply", "--now", NOW]]) {
      const r = capture(["ds", "surface", "--cwd", p, ...args]);
      expect(r.out + r.err).not.toContain("SURFACE_REGISTERED_SOURCE_CHANGED");
      expect(r.out + r.err).not.toContain("--force");
      expect(r.out + r.err).not.toContain("ui registry register");
    }
  });
});

describe("refresh", () => {
  const refreshed = (): { p: string; before: ReturnType<typeof registryOf>["components"] } => {
    const p = registeredAndEdited();
    surface(p, "--register");
    const before = registryOf(p).components;
    expect(answerAll(p, "refresh").code).toBe(0);
    return { p, before };
  };
  it("rewrites a code record's provenance, markup, tokens and variants from the current source and keeps every other field", () => {
    const { p, before } = refreshed();
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const was = before.find((c) => c.name === "Avatar")!;
    const now = registryOf(p).components.find((c) => c.name === "Avatar")!;
    const { provenance, markup, tokensUsed, variants, ...rest } = now;
    const { provenance: wasProvenance, markup: wasMarkup, tokensUsed: wasTokens, variants: wasVariants, ...wasRest } = was;
    expect(rest).toEqual(wasRest); // category, scope, status and the rest: untouched
    expect(provenance).toMatchObject({ kind: "code", sourceRef: expect.stringMatching(/^src\/components\/kit\/Avatar\.tsx:\d+-\d+$/), sha256: expect.stringMatching(/^sha256-/) });
    expect(provenance!.sha256).not.toBe(wasProvenance!.sha256);
    expect(markup).toContain("rounded-full bg-surface");
    expect(wasMarkup).not.toContain("bg-surface");
    expect(tokensUsed).toEqual(["color.surface"]);
    expect(wasTokens).toEqual([]);
    expect(variants).toEqual(wasVariants);
  });
  it("rewrites only the code reference of a linked record and adds the tokens read from code; its name, markup, provenance, variants and Figma pointer stay byte for byte", () => {
    const { p, before } = refreshed();
    expect(apply(p).code).toBe(0);
    const was = before.find((c) => c.name === "Card")!;
    const now = registryOf(p).components.find((c) => c.name === "Card")!;
    const { code, ...rest } = now;
    const { code: wasCode, ...wasRest } = was;
    expect(rest).toEqual(wasRest);
    expect(code!.sourceRef).toBe(wasCode!.sourceRef); // p-4 became p-6 on the same line: the hash is what moved
    expect(code!.sha256).not.toBe(wasCode!.sha256);
    expect(now.provenance).toEqual({ kind: "figma", sourceRef: "figma:1:1", sha256: "sha256-AAAA" });
  });
  it("reseals once, notes every count, leaves `ui ds status` clean and writes nothing on a second --apply", () => {
    const { p } = refreshed();
    const generation = manifestOf(p).generation;
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(envelope(r.out).data!["applied"]).toMatchObject({ registered: 0, linked: 0, separate: 0, refreshed: 2, leftOut: 0, generation: generation + 1 });
    const entries = manifestOf(p).changelog.filter((e) => e.kind === "register");
    expect(entries.at(-1)!.note).toBe("0 new, 0 linked, 0 separate, 2 refreshed");
    expect(capture(["ds", "status", "--dir", p, "--json"]).code).toBe(0);
    const before = hashTree(p, [".design-os"]);
    const again = apply(p);
    expect(again.code, again.out).toBe(0);
    expect(envelope(again.out).data!["register"]).toMatchObject({ unchanged: 6, refreshes: [], staleByRuling: [], awaitingSourceChanged: [] });
    expect(manifestOf(p).generation).toBe(generation + 1);
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(clustersOf(p, CHANGED)).toHaveLength(0);
  });
  it("answers by option and per member from the claude key alone", () => {
    const p = registeredAndEdited();
    surface(p, "--register");
    const [entry] = keyOf(p).filter((k) => k.kind === CHANGED);
    expect(entry!.options.map((o) => o.id)).toEqual(["refresh", "keep", "review-individually"]);
    expect(entry!.options[0]!.assigns).toBeDefined();
    const members = entry!.perMemberAnswer!.members;
    expect(members).toHaveLength(2);
    const done = submit(p, [{ fingerprint: entry!.fingerprint, choice: entry!.perMemberAnswer!.choice, members: { [members[0]!]: "refresh", [members[1]!]: "keep" } }]);
    expect(done.code, done.out).toBe(0);
    const avatarBefore = registryOf(p).components.find((c) => c.name === "Avatar")!;
    const cardBefore = registryOf(p).components.find((c) => c.name === "Card")!;
    expect(apply(p).code).toBe(0);
    expect(registryOf(p).components.find((c) => c.name === "Avatar")).not.toEqual(avatarBefore); // members[0] is Avatar: the first by name
    expect(registryOf(p).components.find((c) => c.name === "Card")).toEqual(cardBefore);
    expect(manifestOf(p).changelog.filter((e) => e.kind === "register").at(-1)!.note).toBe("0 new, 0 linked, 0 separate, 1 refreshed");
  });
  it("names each outcome by the member id: renaming an unrelated file and reordering the tree ask nothing", () => {
    const { p } = refreshed();
    renameSync(join(p, "src/pages/home.tsx"), join(p, "src/pages/a-home.tsx"));
    surface(p, "--register");
    expect(clustersOf(p, CHANGED)).toHaveLength(0);
    expect(apply(p).code).toBe(0);
  });
});

describe("keep", () => {
  const kept = (): string => {
    const p = registeredAndEdited();
    surface(p, "--register");
    expect(answerAll(p, "keep").code).toBe(0);
    return p;
  };
  it("leaves the record untouched, lists it as stale in the preview and the text output, and does not block a write", () => {
    const p = kept();
    const before = registryOf(p).components;
    const generation = manifestOf(p).generation;
    const shown = preview(p);
    expect(shown["staleByRuling"].map((s: { name: string }) => s.name)).toEqual(["Avatar", "Card"]);
    expect(shown["awaitingSourceChanged"]).toEqual([]);
    const text = capture(["ds", "surface", "--cwd", p, "--register"]).out;
    expect(text).toMatch(/stale by ruling: 2 components[\s\S]*Avatar {2}registered src\/components\/kit\/Avatar\.tsx:\d+-\d+, tree src\/components\/kit\/Avatar\.tsx:\d+-\d+/);
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(registryOf(p).components).toEqual(before);
    expect(manifestOf(p).generation).toBe(generation); // nothing to write: no reseal
    expect(capture(["ds", "surface", "--cwd", p, "--register", "--apply", "--now", NOW]).out).toContain("stale by ruling: 2 components");
  });
  it("is written together with a new component in the one batch while the kept records stay as they are", () => {
    const p = kept();
    const before = registryOf(p).components;
    writeFileSync(join(p, "src/components/kit/Fresh.tsx"), "export function Fresh() { return <div className=\"bg-surface\" />; }\n");
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const after = registryOf(p).components;
    expect(after.map((c) => c.name)).toEqual([...before.map((c) => c.name), "Fresh"].sort());
    for (const c of before) expect(after.find((a) => a.name === c.name)).toEqual(c);
    expect(envelope(r.out).data!["register"]["staleByRuling"].map((s: { name: string }) => s.name)).toEqual(["Avatar", "Card"]);
  });
  it("is asked again when the source changes again, because the member names the current hash", () => {
    const p = kept();
    edit(p, "src/components/ui/Card.tsx", "p-6", "p-8");
    surface(p, "--register");
    const open = clustersOf(p, CHANGED);
    expect(open).toHaveLength(1);
    expect(open[0]!.members).toHaveLength(1);
    expect(open[0]!.members[0]).toMatch(/^Card#/);
  });
  it("a record whose source went back to what is registered is unchanged and is no longer stale", () => {
    const p = kept();
    edit(p, "src/components/ui/Card.tsx", "p-6", "p-4");
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full bg-surface", "rounded-full");
    const shown = preview(p);
    expect(shown["staleByRuling"]).toEqual([]);
    expect(shown["unchanged"]).toBe(6);
  });
});

describe("a component that moved to another file", () => {
  it("asks when the name now lives in one other file, with the old file in the member", () => {
    const p = registeredProject();
    renameSync(join(p, "src/components/kit/Avatar.tsx"), join(p, "src/components/kit/Face.tsx"));
    surface(p, "--register");
    const [c] = clustersOf(p, CHANGED);
    expect(c!.members).toHaveLength(1);
    expect(c!.members[0]).toContain("src/components/kit/Avatar.tsx:");
    expect(c!.members[0]).toContain("src/components/kit/Face.tsx:");
  });
});

describe("the ledger", () => {
  it("holds in every state: planned = written + linked + refreshed + unchanged + stale + left out + stopped + name held + awaiting", () => {
    const sum = (r: Record<string, number>): number => r["written"]! + r["linked"]! + r["refreshed"]! + r["unchanged"]! + r["staleByRuling"]! + r["leftOutByRuling"]! + r["stopped"]! + r["separateNameHeld"]! + r["awaitingRuling"]!;
    const p = registeredAndEdited();
    const asked = preview(p)["ledger"];
    expect(asked.awaitingRuling).toBe(2);
    expect(sum(asked)).toBe(asked.planned);
    surface(p, "--register");
    answerAll(p, "refresh");
    const refreshing = preview(p)["ledger"];
    expect(refreshing).toMatchObject({ refreshed: 2, awaitingRuling: 0 });
    expect(sum(refreshing)).toBe(refreshing.planned);
    expect(readFileSync(join(p, "design", "component-registry.json"), "utf8")).toContain("Avatar");
  });
});
