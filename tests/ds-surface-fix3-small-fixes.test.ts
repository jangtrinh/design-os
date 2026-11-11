/**
 * Fix round 3, section U: a predicted refusal carries no absolute path (so a `--register --out` file is the same from
 * any checkout), `export =` is counted and listed, an exported function that is also the default export is read once,
 * `SURFACE_SEPARATE_NAME_HELD` is in the help and the signature and states facts only, and an answered question that is
 * answered again is refused, so no message may send the owner to that.
 */
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signatureFor } from "../src/core/command-signatures.js";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { capture } from "./owner-rulings-helpers.js";
import { envelope, keyOf, submit, surface } from "./ds-surface-helpers.js";
import { MATCH, answerMatch, apply, figma, readyProject } from "./ds-surface-source-match-helpers.js";
import { LINT, addUnregistrableComponent, lintProject } from "./ds-surface-questions-helpers.js";
import { writable } from "./ds-surface-fix3-helpers.js";

const read = (src: string, file = "src/components/P.tsx") => readComponentExports(file, src);

describe("a predicted refusal is the same from any checkout", () => {
  const twoCheckouts = (): [string, string] => {
    const a = writable();
    addUnregistrableComponent(a);
    const b = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-surface-deep-")), "one", "two", "three");
    mkdirSync(b, { recursive: true });
    cpSync(a, b, { recursive: true });
    return [a, b];
  };
  it("the --register --json preview is byte-identical, and the refusal names the reference, not a path", () => {
    const [a, b] = twoCheckouts();
    const first = surface(a, "--register");
    const second = surface(b, "--register");
    expect(first.code).toBe(0);
    expect(second.out).toBe(first.out);
    const items = envelope(first.out).data!["register"]["wouldRefuse"].items as { code: string; message: string }[];
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.code).toBe("REGISTRY_BAD_SOURCE_REF");
      expect(i.message).toContain("does not exist under the project root");
      expect(i.message).not.toContain(a);
      expect(i.message).not.toContain(tmpdir());
    }
  });
  it("the BATCH_REFUSED text of --apply holds no absolute path either", () => {
    const [a] = twoCheckouts();
    const done = apply(a);
    expect(done.code).toBe(1);
    const message = envelope(done.out).error!.message;
    expect(message).toContain("does not exist under the project root");
    expect(message).not.toContain(a);
  });
  it("`ui registry register` still refuses a missing source file, with the same wording and no path", () => {
    const p = writable();
    const markup = join(p, "m.html");
    cpSync(join(p, "design", "ds.manifest.json"), markup); // any readable file: the refusal comes from the source reference
    const r = capture(["registry", "register", "Ghost/Missing", "--category", "x", "--markup", markup, "--source-ref", "src/nowhere/Ghost.tsx:1-3", "--file", join(p, "design", "component-registry.json"), "--json"]);
    expect(r.code).toBe(1);
    const e = envelope(r.out).error!;
    expect(e.message).toContain("does not exist under the project root");
    expect(e.message).not.toContain(p);
  });
});

describe("`export =` is counted and listed", () => {
  const r = read("export function Real() { return <i />; }\nexport = Real;\n");
  it("counts the keyword and lists it with its reason", () => {
    expect(r.accounting).toEqual({ keywords: 2, claimed: 1, listed: 1 });
    expect(r.unread).toEqual([{ name: "(export =)", line: 2, reason: "an export assignment is not read" }]);
  });
  it("a JSX attribute called export is no keyword", () => {
    const attr = read("export function Real() {\n  return <Tool export={true} />;\n}\n");
    expect(attr.accounting.keywords).toBe(1);
    expect(attr.unread).toEqual([]);
  });
  it("a script file lists it too", () => {
    const ts = read("export = Real;\n", "src/lib/x.ts");
    expect(ts.accounting).toEqual({ keywords: 1, claimed: 0, listed: 1 });
  });
});

describe("an exported function that is also the default export is read once", () => {
  it("export default X after export function X: one component, the default one, nothing listed", () => {
    const r = read("export function Card() { return <i />; }\nexport default Card;\n");
    expect(r.components).toEqual([{ name: "Card", isDefault: true, startLine: 1, endLine: 1 }]);
    expect(r.unread).toEqual([]);
  });
  it("export { X as default } after export function X is the same", () => {
    const r = read("export function Card() { return <i />; }\nexport { Card as default };\n");
    expect(r.components.map((c) => [c.name, c.isDefault])).toEqual([["Card", true]]);
    expect(r.unread).toEqual([]);
  });
  it("a default export of a name declared nowhere is still listed with its reason", () => {
    const r = read("export default Nowhere;\n");
    expect(r.unread).toEqual([expect.objectContaining({ name: "Nowhere", reason: "the default export names a binding that is not declared in this file" })]);
  });
});

/** A name ruled `separate` whose `<name> · code` is held by a record of another door. */
function nameHeld(): string {
  const p = readyProject([figma("Card", 1, ["color.ink"]), figma("Card · code", 9, [])]);
  answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "separate"])) }));
  return p;
}

describe("SURFACE_SEPARATE_NAME_HELD", () => {
  it("is in the help text and the command signature", () => {
    const out = capture(["ds", "--help"]).out;
    const start = out.indexOf("'ds surface' options:");
    const section = out.slice(start, out.indexOf("'ds specimen' options:", start));
    expect(section.slice(section.indexOf("--apply"), section.indexOf("--now"))).toContain("SURFACE_SEPARATE_NAME_HELD");
    expect(section.slice(section.indexOf("Error codes:"))).toContain("SURFACE_SEPARATE_NAME_HELD");
    expect(signatureFor("ds", "surface")!.errorCodes).toContain("SURFACE_SEPARATE_NAME_HELD");
  });
  it("states which name is held and by a record of which source, and names no action that was not run", () => {
    const e = envelope(apply(nameHeld()).out).error!;
    expect(e.code).toBe("SURFACE_SEPARATE_NAME_HELD");
    expect(e.message).toContain('"Card · code" is held by a record from figma:9:1');
    expect(e.message).toContain("Nothing was written.");
    expect(e.message).not.toMatch(/rename|remove|ui onboard answer/);
  });
});

describe("an answered question that is answered again", () => {
  it("a `separate` answer cannot be changed to `same` with ui onboard answer: STALE_ANSWER, and the apply is still refused", () => {
    const p = readyProject([figma("Card", 1, ["color.ink"]), figma("Card · code", 9, [])]);
    const key = keyOf(p).filter((k) => k.kind === MATCH);
    expect(answerMatch(p, (k) => ({ choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "separate"])) })).code).toBe(0);
    const again = submit(p, key.map((k) => ({ fingerprint: k.fingerprint, choice: k.perMemberAnswer!.choice, members: Object.fromEntries(k.perMemberAnswer!.members.map((m) => [m, "same"])) })));
    expect(again.code).toBe(1);
    expect(envelope(again.out).error).toMatchObject({ code: "STALE_ANSWER", message: expect.stringContaining("already answered") });
    expect(envelope(apply(p).out).error!.code).toBe("SURFACE_SEPARATE_NAME_HELD");
  });
  it("a `stop` answer cannot be changed to `leave-out`: STALE_ANSWER, and the apply is still stopped", () => {
    const p = lintProject();
    const key = keyOf(p).filter((k) => k.kind === LINT);
    const choose = (id: string) => submit(p, key.map((k) => ({ fingerprint: k.fingerprint, choice: k.options.find((o) => o.id === id)!.id })));
    expect(choose("stop").code).toBe(0);
    const again = choose("leave-out");
    expect(again.code).toBe(1);
    expect(envelope(again.out).error!.code).toBe("STALE_ANSWER");
    expect(envelope(apply(p).out).error!.code).toBe("SURFACE_LINT_STOPPED");
  });
});
