/**
 * Fix round 4: Z4 (in an undecided file a component whose span reaches the undecided part is listed) and the small items:
 * the declaration index (the reader was quadratic in the braced names of a file), the preview ledger wording when a write
 * is blocked, and a keyword that is in exactly one of claimed and listed.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { capture } from "./owner-rulings-helpers.js";
import { envelope, sealedFixture, surface } from "./ds-surface-helpers.js";

const read = (src: string) => readComponentExports("src/components/P.tsx", src);

describe("Z4: a component whose span reaches the undecided part is listed", () => {
  const TICKY = 'export function Ticky() {\n  const r = /`/;\n  const t = `<i className="bg-surface"/>`;\n  return <b />;\n}\n';
  it("the reader lists it with the undecided reason and does not read it", () => {
    const r = read(TICKY);
    expect(r.components).toEqual([]);
    expect(r.unread.find((u) => u.name === "Ticky")?.reason).toMatch(/could not be decided from line 2 on/);
  });
  it("through the register preview: no record, no token", () => {
    const p = sealedFixture();
    writeFileSync(join(p, "src/components/ui/Ticky.tsx"), TICKY);
    const d = envelope(surface(p, "--register").out).data!;
    expect((d["register"]["records"] as { name: string }[]).map((r) => r.name)).not.toContain("Ticky");
    expect((d["components"] as { name: string }[]).map((c) => c.name)).not.toContain("Ticky");
    expect((d["unread"].exports as { name: string }[]).map((u) => u.name)).toContain("Ticky");
  });
  it("a component that ends before the boundary is still read", () => {
    const r = read('export function Before() { return <i className="p-2" />; }\nconst r = /`/;\nconst t = 1;\n');
    expect(r.components.map((c) => c.name)).toEqual(["Before"]);
  });
});

describe("the declaration index: a braced export of many names reads in linear time", () => {
  it("a 1.2 MB file with 1,000 braced names reads in under 2 seconds", () => {
    const names = Array.from({ length: 1000 }, (_v, i) => `Comp${String.fromCharCode(97 + (i % 26))}${i}`);
    const decls = names.map((n) => `function ${n}() { return <i />; }`);
    const filler = Array.from({ length: 20000 }, (_v, i) => `const filler${i} = ${i}; // padding padding padding`);
    const src = `${filler.join("\n")}\n${decls.join("\n")}\nexport { ${names.join(", ")} };\n`;
    expect(src.length).toBeGreaterThan(1_000_000);
    const started = Date.now();
    const r = read(src);
    const elapsed = Date.now() - started;
    appendFileSync(`${process.env["TMPDIR"] ?? "."}/decl-index-timing.log`, `${elapsed} ms\n`);
    expect(r.components).toHaveLength(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("the preview ledger is not a promise while the write is blocked", () => {
  it("a question is open: the ledger says would write, not to write", () => {
    const out = capture(["ds", "surface", "--cwd", sealedFixture(), "--register"]).out;
    const ledger = out.split("\n").find((l) => l.startsWith("  ledger:")) ?? "";
    expect(ledger).toMatch(/ would write \+ \d+ would link \+ \d+ would refresh /);
    expect(ledger).not.toContain("to write");
  });
});

describe("a keyword is in exactly one of claimed and listed", () => {
  const src = [
    "export default function () { return <i />; }", // anonymous default: listed
    'export const API_URL = "x";', // no lower-case letter: listed
    "export const Plain = 1;", // holds no markup: listed
    "export function Real() { return <i />; }", // read: claimed
    "export type T = string;", // type only: claimed
    "",
  ].join("\n");
  it("every keyword that put a reason in `unread` is listed, the others are claimed, none is both", () => {
    const r = read(src);
    expect(r.accounting).toEqual({ keywords: 5, claimed: 2, listed: 3 });
    expect(r.unread).toHaveLength(r.accounting.listed);
  });
  it("a braced export of a name that holds no markup is listed too", () => {
    const r = read("const Plain = 1;\nexport { Plain };\nfunction Real() { return <i />; }\nexport { Real };\n");
    expect(r.accounting).toEqual({ keywords: 2, claimed: 1, listed: 1 });
  });
});
