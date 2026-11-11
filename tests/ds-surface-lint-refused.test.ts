/**
 * Records the design-system lint refuses are asked about, then the rest is written (spec 033 FR-027, owner decision D17):
 * the question with its counts, `leave-out` (the other records are written in one batch, the left-out names are listed),
 * `stop` (nothing is written until the components pass), a per-member answer from the `--format claude` key alone, a
 * member that changes or passes, a name that still awaits another question, a refreshed record that fails the lint, and
 * a store that drifted from its seal.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { answerKind, envelope, keyOf, sealedFixture, submit, surface } from "./ds-surface-helpers.js";
import { BASE, COLLISION, NOW, answerMatch, apply, manifestOf, registryOf, sealedFromFigma } from "./ds-surface-source-match-helpers.js";
import { CHANGED, LAMP, LAMP_SOURCE, LINT, addUnregistrableComponent, clustersOf, edit, lintProject, registeredProject } from "./ds-surface-questions-helpers.js";

const BUTTON_FILES = ["src/components/ui/Button.tsx", "src/components/kit/Button.tsx"];

const optionOf = (k: ReturnType<typeof keyOf>[number], id: string): string => k.options.find((o) => o.id === id)!.id;
const answerAll = (p: string, id: string) => submit(p, keyOf(p).filter((k) => k.kind === LINT).map((k) => ({ fingerprint: k.fingerprint, choice: optionOf(k, id) })));
const members = (p: string): string[] => clustersOf(p, LINT).flatMap((c) => c.members);
const register = (p: string) => envelope(surface(p, "--register").out).data!["register"];
const fixButton = (p: string): void => { for (const f of BUTTON_FILES) if (readFileSync(join(p, f), "utf8").includes("color-missing")) edit(p, f, ', borderColor: "var(--color-missing)"', ""); };
const NAMES = ["Avatar", "Badge", "Card", "Panel", "Tabs"];

describe("the question", () => {
  it("names the counts and the refusal codes, lists each member as name, file and hash, and prints `name (id)` on the sheet", () => {
    const p = lintProject();
    const [c] = clustersOf(p, LINT);
    expect(c!.question).toBe("2 of 7 component(s) the registry would write fail the design-system lint (REGISTRY_MARKUP_DRIFT 2). What should happen to them?");
    expect(c!.members).toHaveLength(2);
    expect(c!.members[0]).toMatch(/^Button#sha256-\S+,src\/components\/ui\/Button\.tsx$/); // the ids are sorted: the hash before the file
    expect(c!.members[1]).toMatch(/^Lamp#sha256-\S+,src\/components\/kit\/Lamp\.tsx$/);
    expect(c!.options.map((o) => o.id)).toEqual(["leave-out", "stop", "review-individually"]);
    const sheet = capture(["onboard", "questions", "--format", "markdown", "--cwd", p]).out;
    expect(sheet).toContain(`- Button (${c!.members[0]})`);
    expect(sheet).toContain(`- Lamp (${c!.members[1]})`);
  });
  it("computes each consequence for its own option", () => {
    const [c] = clustersOf(lintProject(), LINT);
    expect(c!.options[0]!.consequence).toBe("2 component(s) are not registered and are listed by name with their refusal code; the other records are written in one batch");
    expect(c!.options[1]!.consequence).toBe("--apply writes nothing and exits 1 naming the 2 component(s) until their source or the design system changes");
  });
  it("is shown with the preview and blocks --apply and --register --out; a read does not; the tree is unchanged but for pending.json", () => {
    const p = lintProject();
    const before = hashTree(p, [".design-os"]);
    const shown = register(p);
    expect(shown["awaitingLintRuling"].map((i: { name: string }) => i.name)).toEqual(["Button", "Lamp"]);
    expect(shown["records"].map((r: { name: string }) => r.name)).toEqual(NAMES);
    expect(shown["wouldRefuse"]).toEqual({ count: 0, byCode: {}, items: [] }); // the lint family is asked, it is not a refusal
    for (const args of [["--register", "--apply"], ["--register", "--out", "o.json"]]) {
      const r = surface(p, ...args);
      expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    }
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(clustersOf(p, LINT)).toHaveLength(1);
  });
  it("raises nothing without --register and never drops a stored question", () => {
    const p = lintProject();
    surface(p);
    expect(clustersOf(p, LINT)).toHaveLength(1);
    const q = sealedFixture();
    surface(q);
    expect(clustersOf(q, LINT)).toHaveLength(0);
  });
  it("asks only the lint family: a refusal by another code stays a refusal by name and is never a member", () => {
    const p = lintProject();
    addUnregistrableComponent(p);
    const shown = register(p);
    expect(shown["wouldRefuse"].byCode).toEqual({ REGISTRY_BAD_SOURCE_REF: 3 });
    expect(members(p).map((m) => m.split("#")[0])).toEqual(["Button", "Lamp"]);
  });
});

describe("leave-out", () => {
  const leftOut = (): string => { const p = lintProject(); expect(answerAll(p, "leave-out").code).toBe(0); return p; };
  it("writes the other records in one batch with one reseal, lists the left-out names with their code in every output, and registers nothing against the lint", () => {
    const p = leftOut();
    const generation = manifestOf(p).generation;
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const names = registryOf(p).components.map((c) => c.name);
    expect(names).toEqual(NAMES);
    expect(names).not.toContain("Button");
    expect(names).not.toContain("Lamp");
    expect(manifestOf(p).generation).toBe(generation + 1);
    expect(manifestOf(p).changelog.filter((e) => e.kind === "register").at(-1)!.note).toBe("5 new, 0 linked, 0 separate, 2 left out by ruling");
    const data = envelope(r.out).data!;
    expect(data["applied"]).toMatchObject({ registered: 5, leftOut: 2 });
    expect(data["register"]["leftOutByRuling"]).toMatchObject([{ name: "Button", code: "REGISTRY_MARKUP_DRIFT" }, { name: "Lamp", code: "REGISTRY_MARKUP_DRIFT" }]);
    expect(data["register"]["awaitingLintRuling"]).toEqual([]);
    // what is not registered is not "registered with no variants" either: Badge reads its variants, so four of the five written have none
    expect(data["register"]["notRead"]).toMatchObject({ count: 4, components: ["Avatar", "Card", "Panel", "Tabs"] });
    const text = capture(["ds", "surface", "--cwd", p, "--register", "--apply", "--now", NOW]).out;
    expect(text).toMatch(/left out by ruling: 2 component\(s\) fail the design-system lint and are not registered \(REGISTRY_MARKUP_DRIFT 2\)\n {4}Button {2}REGISTRY_MARKUP_DRIFT {2}src\/components\/ui\/Button\.tsx\n {4}Lamp {2}REGISTRY_MARKUP_DRIFT {2}src\/components\/kit\/Lamp\.tsx/);
    expect(capture(["ds", "status", "--dir", p, "--json"]).code).toBe(0);
  });
  it("a second --apply writes nothing and does not reseal, and the left-out names are still listed", () => {
    const p = leftOut();
    apply(p);
    const generation = manifestOf(p).generation;
    const before = hashTree(p, [".design-os"]);
    const again = apply(p);
    expect(again.code, again.out).toBe(0);
    expect(manifestOf(p).generation).toBe(generation);
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(envelope(again.out).data!["register"]["leftOutByRuling"].map((i: { name: string }) => i.name)).toEqual(["Button", "Lamp"]);
  });
  it("keeps the ledger: planned = written + linked + refreshed + unchanged + stale + left out + stopped + name held + awaiting", () => {
    const sum = (l: Record<string, number>): number => l["written"]! + l["linked"]! + l["refreshed"]! + l["unchanged"]! + l["staleByRuling"]! + l["leftOutByRuling"]! + l["stopped"]! + l["separateNameHeld"]! + l["awaitingRuling"]!;
    const asked = register(lintProject())["ledger"];
    expect(asked).toMatchObject({ planned: 7, written: 5, awaitingRuling: 2 });
    expect(sum(asked)).toBe(7);
    const p = leftOut();
    const done = register(p)["ledger"];
    expect(done).toMatchObject({ planned: 7, written: 5, leftOutByRuling: 2, awaitingRuling: 0 });
    expect(sum(done)).toBe(7);
  });
  it("the message of a non-askable refusal in the same run still stops the batch: nothing is written", () => {
    const p = leftOut();
    addUnregistrableComponent(p);
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(envelope(r.out).error?.code).toBe("BATCH_REFUSED");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
});

describe("stop", () => {
  const stopped = (): string => { const p = lintProject(); expect(answerAll(p, "stop").code).toBe(0); return p; };
  it("writes nothing and exits 1 under one named code that lists the components and names a next action", () => {
    const p = stopped();
    const before = hashTree(p, [".design-os"]);
    const r = apply(p);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.code).toBe("SURFACE_LINT_STOPPED");
    expect(e.message).toContain("Button (src/components/ui/Button.tsx)");
    expect(e.message).toContain("Lamp (src/components/kit/Lamp.tsx)");
    expect(e.message).toContain("ui ds reseal --apply");
    expect(e.message).toContain("ui ds surface --register --apply");
    expect(hashTree(p, [".design-os"])).toBe(before);
    expect(register(p)["lintStopped"].map((i: { name: string }) => i.name)).toEqual(["Button", "Lamp"]); // a read still shows it
  });
  it("the first named action works: fixing the components lets the same command write", () => {
    const p = stopped();
    fixButton(p);
    writeFileSync(join(p, LAMP), "export function Lamp() { return <i />; }\n");
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(registryOf(p).components.map((c) => c.name)).toEqual(["Avatar", "Badge", "Button", "Card", "Lamp", "Panel", "Tabs"]);
    expect(clustersOf(p, LINT)).toHaveLength(0); // a member that now passes leaves the question
  });
  it("the second named action works: the token the component needs is added to the store and adopted, then the same command writes", () => {
    const p = stopped();
    const file = join(p, "design", "design.tokens.json");
    const doc = JSON.parse(readFileSync(file, "utf8")) as { color: Record<string, unknown> };
    doc.color["missing"] = { $type: "color", $value: "#ff0000" };
    doc.color["ghost"] = { $type: "color", $value: "#00ff00" };
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    const adopted = capture(["ds", "reseal", "--dir", p, "--apply", "--reason", "add the tokens two components need", "--json"]);
    expect(adopted.code, adopted.out + adopted.err).toBe(0);
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(registryOf(p).components.map((c) => c.name)).toContain("Button");
    expect(registryOf(p).components.map((c) => c.name)).toContain("Lamp");
    expect(clustersOf(p, LINT)).toHaveLength(0);
  });
});

describe("per member, from the claude key alone", () => {
  it("answers a mix: one left out and one stopped; the stop wins the write and names only the stopped one", () => {
    const p = lintProject();
    const [entry] = keyOf(p).filter((k) => k.kind === LINT);
    expect(entry!.options.map((o) => o.id)).toEqual(["leave-out", "stop", "review-individually"]);
    expect(entry!.options[0]!.assigns).toBeDefined();
    const [button, lamp] = entry!.perMemberAnswer!.members;
    const done = submit(p, [{ fingerprint: entry!.fingerprint, choice: entry!.perMemberAnswer!.choice, members: { [button!]: "leave-out", [lamp!]: "stop" } }]);
    expect(done.code, done.out).toBe(0);
    const e = envelope(apply(p).out).error!;
    expect(e.code).toBe("SURFACE_LINT_STOPPED");
    expect(e.message).toContain("Lamp");
    expect(e.message).not.toContain("Button");
    writeFileSync(join(p, LAMP), "export function Lamp() { return <i />; }\n");
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    const names = registryOf(p).components.map((c) => c.name);
    expect(names).toContain("Lamp");
    expect(names).not.toContain("Button");
  });
});

describe("a member changes or passes", () => {
  it("a member whose source changes is asked again, with only that member, and the answered one stays answered", () => {
    const p = lintProject();
    answerAll(p, "leave-out");
    apply(p);
    edit(p, LAMP, "var(--color-ghost)", "var(--color-phantom)");
    surface(p, "--register");
    const open = clustersOf(p, LINT);
    expect(open).toHaveLength(1);
    expect(open[0]!.members).toHaveLength(1);
    expect(open[0]!.members[0]).toMatch(/^Lamp#/);
    expect(open[0]!.question).toContain("1 of 7 component(s)");
  });
  it("a member that passes after its source is fixed is no longer a member, and the question goes away", () => {
    const p = lintProject();
    fixButton(p);
    writeFileSync(join(p, LAMP), "export function Lamp() { return <i />; }\n");
    surface(p, "--register");
    expect(clustersOf(p, LINT)).toHaveLength(0);
  });
});

describe("a name that still awaits another question is not a member yet", () => {
  it("a collision that is open holds its name back: only the other component is asked", () => {
    const p = sealedFixture();
    writeFileSync(join(p, LAMP), LAMP_SOURCE);
    surface(p);
    surface(p, "--register");
    expect(members(p).map((m) => m.split("#")[0])).toEqual(["Lamp"]);
    expect(clustersOf(p, COLLISION)).toHaveLength(1);
  });
  describe("a name held by a record of another door", () => {
    const heldByFigma = (): string => {
      const p = sealedFromFigma(BASE());
      surface(p);
      answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
      fixButton(p);
      edit(p, "src/components/ui/Card.tsx", "p-4", "p-4\" style={{ color: \"var(--color-ghost)\" }} data-x=\"");
      return p;
    };
    it("while the source-match question is open, the name is not a lint member", () => {
      const p = heldByFigma();
      surface(p, "--register");
      expect(clustersOf(p, "component-source-match")).toHaveLength(1);
      expect(clustersOf(p, LINT)).toHaveLength(0);
    });
    it("answered `same`, the record is linked and a link is not linted: no member", () => {
      const p = heldByFigma();
      surface(p, "--register");
      answerMatch(p, (k) => ({ choice: optionOf(k, "same") }));
      surface(p, "--register");
      expect(clustersOf(p, LINT)).toHaveLength(0);
    });
    it("answered `separate`, the record `Card · code` is a new record the rulings would write, so it is a member in the next round", () => {
      const p = heldByFigma();
      surface(p, "--register");
      answerMatch(p, (k) => ({ choice: optionOf(k, "separate") }));
      surface(p, "--register");
      expect(members(p).map((m) => m.split("#")[0])).toEqual(["Card · code"]);
    });
  });
});

describe("a refreshed record is linted like a new one", () => {
  it("a code record refreshed from a source that fails the lint is a member in the next round, and nothing of it is written until that is answered", () => {
    const p = registeredProject();
    const before = registryOf(p).components.find((c) => c.name === "Avatar")!;
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full\" style={{ color: \"var(--color-ghost)\" }} data-x=\"");
    surface(p, "--register");
    expect(answerKind(p, CHANGED, (k) => ({ choice: optionOf(k, "refresh") })).code).toBe(0);
    surface(p, "--register");
    expect(members(p).map((m) => m.split("#")[0])).toEqual(["Avatar"]);
    expect(envelope(apply(p).out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(registryOf(p).components.find((c) => c.name === "Avatar")).toEqual(before);
    expect(answerAll(p, "leave-out").code).toBe(0);
    const r = apply(p);
    expect(r.code, r.out).toBe(0);
    expect(registryOf(p).components.find((c) => c.name === "Avatar")).toEqual(before); // left out: the record stays as registered
    expect(envelope(r.out).data!["register"]["leftOutByRuling"].map((i: { name: string }) => i.name)).toEqual(["Avatar"]);
  });
});

describe("a store that drifted from its seal", () => {
  it("the prediction cannot run: no question is raised, and the write is refused as before", () => {
    const p = sealedFixture();
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    const file = join(p, "design", "design.tokens.json");
    writeFileSync(file, readFileSync(file, "utf8").replace("#", "#0"));
    const shown = envelope(surface(p, "--register").out).data!["register"];
    expect(shown["wouldRefuse"].notChecked).toMatch(/^DS_TAMPERED/);
    expect(clustersOf(p, LINT)).toHaveLength(0);
    const r = surface(p, "--register", "--apply");
    expect(r.code).toBe(1);
    expect(envelope(r.out).error?.code).not.toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
  });
});
