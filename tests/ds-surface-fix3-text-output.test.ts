/**
 * Fix round 3, section T: the text output of `ui ds surface --register` never names a next action that would fail. The
 * closing `next:` line is printed for what the run can do, and names no command when it can do nothing; the ledger says
 * "to write" in a preview and "written" after `--apply`; a source-changed member whose slice hash is unchanged is called
 * "moved, content unchanged", and the question says how many only moved; one number form everywhere ("N component(s)").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { answerKind, envelope, keyOf, sealedFixture, submit, surface } from "./ds-surface-helpers.js";
import { NOW, answerMatch, apply, figma, readyProject, registryOf } from "./ds-surface-source-match-helpers.js";
import { CHANGED, LINT, addUnregistrableComponent, clustersOf, edit, lintProject, registeredProject } from "./ds-surface-questions-helpers.js";

const COLLISION = "component-name-collision";
const run = (p: string, ...more: string[]): string => capture(["ds", "surface", "--cwd", p, "--register", ...more]).out;
const nextOf = (out: string): string[] => out.split("\n").filter((l) => /^ {2}next:/.test(l));
const ledgerOf = (out: string): string => out.split("\n").find((l) => l.startsWith("  ledger:")) ?? "";
const answerAll = (p: string, kind: string, id: string) => submit(p, keyOf(p).filter((k) => k.kind === kind).map((k) => ({ fingerprint: k.fingerprint, choice: k.options.find((o) => o.id === id)!.id })));

/** The fixture sealed, its collision ruled and its planted undeclared token removed: a run that has records to write and nothing that blocks. */
function writable(): string {
  const p = sealedFixture();
  surface(p);
  expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
  for (const f of ["src/components/ui/Button.tsx", "src/components/kit/Button.tsx"]) {
    const file = join(p, f);
    writeFileSync(file, readFileSync(file, "utf8").replace(', borderColor: "var(--color-missing)"', ""));
  }
  return p;
}

describe("the closing next line follows the state of the run", () => {
  it("something to write and nothing blocks: it names the apply command", () => {
    expect(nextOf(run(writable()))).toEqual(["  next: ui ds surface --register --apply writes these records"]);
  });
  it("a question is open: it names the questions command and no apply", () => {
    const next = nextOf(run(sealedFixture()));
    expect(next).toEqual(["  next: ui onboard questions --format claude; nothing is written until the open questions are answered"]);
  });
  it("a stop ruling holds the write: it says what SURFACE_LINT_STOPPED says", () => {
    const p = lintProject();
    expect(answerAll(p, LINT, "stop").code).toBe(0);
    const next = nextOf(run(p));
    expect(next).toHaveLength(1);
    const refused = envelope(surface(p, "--register", "--apply").out).error!;
    expect(refused.code).toBe("SURFACE_LINT_STOPPED");
    expect(refused.message).toContain(next[0]!.replace(/^ {2}next: /, ""));
    expect(next[0]).not.toMatch(/^ {2}next: ui ds surface --register --apply writes/);
  });
  it("a refusal is predicted for the write: it names no apply command", () => {
    const p = writable();
    addUnregistrableComponent(p);
    const out = run(p);
    expect(out).toContain("would be refused: 3 record(s)");
    expect(nextOf(out)).toEqual(["  next: nothing is written while the records listed under 'would be refused' are refused; change their source or the design system"]);
  });
  it("a separate name is held by another door: it names no apply command", () => {
    const p = readyProject([figma("Card", 1, ["color.ink"]), figma("Card · code", 9, [])]);
    answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "separate"])) }));
    const next = nextOf(run(p));
    expect(next).toEqual(["  next: nothing is written until the held names are free (listed under 'separate name held')"]);
  });
  it("nothing to write: it says so and names no command, right after a successful apply too", () => {
    const p = writable();
    const done = run(p, "--apply", "--now", NOW);
    expect(done).toContain("applied: ");
    expect(nextOf(done)).toEqual([]);
    const again = nextOf(run(p));
    expect(again).toEqual(["  next: nothing to write: the registry already holds what the tree says"]);
    expect(again[0]).not.toContain("ui ");
  });
});

describe("the ledger says what the run did", () => {
  it("a preview says to write, to link and to refresh; the JSON names do not change", () => {
    const out = run(writable());
    expect(ledgerOf(out)).toMatch(/^ {2}ledger: \d+ planned = \d+ to write \+ \d+ to link \+ \d+ to refresh \+ /);
    const l = envelope(capture(["ds", "surface", "--cwd", writable(), "--register", "--json"]).out).data!["register"]["ledger"];
    expect(Object.keys(l)).toEqual(["planned", "written", "linked", "refreshed", "unchanged", "staleByRuling", "leftOutByRuling", "stopped", "separateNameHeld", "awaitingRuling"]);
  });
  it("after --apply it says written, linked and refreshed", () => {
    const out = run(writable(), "--apply", "--now", NOW);
    expect(ledgerOf(out)).toMatch(/^ {2}ledger: \d+ planned = \d+ written \+ \d+ linked \+ \d+ refreshed \+ /);
  });
});

/** Card has only moved (a line above it), Avatar's content changed: the two ways a recorded source differs from the tree. */
function movedAndChanged(): string {
  const p = registeredProject();
  const card = join(p, "src/components/ui/Card.tsx");
  writeFileSync(card, `\n${readFileSync(card, "utf8")}`);
  edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
  return p;
}

describe("a member whose slice hash is unchanged is called moved", () => {
  it("the question counts the ones that only moved, apart from the ones that changed", () => {
    const p = movedAndChanged();
    surface(p, "--register");
    const [c] = clustersOf(p, CHANGED);
    expect(c!.options.find((o) => o.id === "refresh")!.consequence).toContain("(1 only moved, content unchanged)");
    expect(c!.options.find((o) => o.id === "keep")!.consequence).not.toContain("moved");
  });
  it("a question with no moved member keeps its consequence as it was", () => {
    const p = registeredProject();
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
    surface(p, "--register");
    const [c] = clustersOf(p, CHANGED);
    expect(c!.options.find((o) => o.id === "refresh")!.consequence).not.toContain("only moved");
  });
  it("the awaiting lines say which one moved and which one changed", () => {
    const p = movedAndChanged();
    const out = run(p);
    expect(out).toMatch(/awaiting a ruling: 2 component\(s\) are registered from a source that has changed since/);
    expect(out).toMatch(/Avatar {2}registered src\/components\/kit\/Avatar\.tsx:\d+-\d+, tree src\/components\/kit\/Avatar\.tsx:\d+-\d+; content changed/);
    expect(out).toMatch(/Card {2}registered src\/components\/ui\/Card\.tsx:3-5, tree src\/components\/ui\/Card\.tsx:4-6; moved, content unchanged/);
  });
  it("the stale lines say the same, and the JSON carries the fact", () => {
    const p = movedAndChanged();
    surface(p, "--register");
    expect(answerAll(p, CHANGED, "keep").code).toBe(0);
    const out = run(p);
    expect(out).toMatch(/stale by ruling: 2 component\(s\) registered/);
    expect(out).toMatch(/Avatar {2}registered .*; content changed/);
    expect(out).toMatch(/Card {2}registered .*; moved, content unchanged/);
    const stale = envelope(capture(["ds", "surface", "--cwd", p, "--register", "--json"]).out).data!["register"]["staleByRuling"] as { name: string; contentChanged: boolean }[];
    expect(stale.map((s) => [s.name, s.contentChanged])).toEqual([["Avatar", true], ["Card", false]]);
  });
  it("a stale line never prints two identical references without saying what differs", () => {
    const p = registeredProject();
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
    surface(p, "--register");
    expect(answerAll(p, CHANGED, "keep").code).toBe(0);
    const line = run(p).split("\n").find((l) => /^ {4}Avatar {2}registered/.test(l))!;
    expect(line.endsWith("; content changed")).toBe(true);
  });
  it("refresh still rewrites a moved record from the source (its reference moves)", () => {
    const p = movedAndChanged();
    surface(p, "--register");
    expect(answerAll(p, CHANGED, "refresh").code).toBe(0);
    expect(apply(p).code).toBe(0);
    expect(registryOf(p).components.find((c) => c.name === "Card")!.code!.sourceRef).toMatch(/Card\.tsx:4-6$/);
  });
});

describe("one number form in the sentences: N component(s)", () => {
  it("a single component never reads '1 component are'", () => {
    const p = registeredProject();
    edit(p, "src/components/kit/Avatar.tsx", "rounded-full", "rounded-full bg-surface");
    const out = run(p);
    expect(out).toContain("awaiting a ruling: 1 component(s) are registered from a source that has changed since");
    expect(out).not.toContain("1 component are");
  });
});
