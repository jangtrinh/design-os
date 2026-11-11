/**
 * A token kept raw never replaces a token that is written: it lands beside the existing `raw` group's tokens, under a
 * name that is not taken, and the ledger counts what the sealed store holds.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, projectWith, submit } from "./project-kinds-helpers.js";

type Envelope = { data?: Record<string, any>; error?: { code: string; message: string } }; // eslint-disable-line @typescript-eslint/no-explicit-any

function importKeepingRaw(tokens: unknown): { project: string; out: Envelope } {
  const project = projectWith({ "package.json": "{}" });
  const src = join(mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ds-import-raw-")), "tokens.json");
  writeFileSync(src, JSON.stringify(tokens));
  const args = ["ds", "import", src, "--dir", project, "--json"];
  capture(args);
  expect(submit(project, keyOf(project).map((k) => ({ fingerprint: k.fingerprint, choice: "keep-raw" }))).code).toBe(0);
  const r = capture(args);
  return { project, out: JSON.parse(r.out) as Envelope };
}
const sealedTokens = (project: string): Record<string, Record<string, { $value: unknown }>> =>
  JSON.parse(readFileSync(join(project, "design", "design.tokens.json"), "utf8")) as Record<string, Record<string, { $value: unknown }>>;

describe("keep raw never replaces a token that is written", () => {
  it("a typed token already in the raw group stays, and the kept one is written beside it; the ledger equals the store", () => {
    const { project, out } = importKeepingRaw({ raw: { keepme: "#123456" }, colors: { n: "zzz" } });
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    const tokens = sealedTokens(project);
    expect(tokens["raw"]!["keepme"]!.$value).toBe("#123456");
    expect(tokens["raw"]!["colors-n"]!.$value).toBe("zzz");
    const stored = Object.values(tokens).reduce((n, g) => n + Object.keys(g).length, 0);
    expect(out.data!["ledger"].written.total).toBe(stored);
    expect(out.data!["ledger"].in).toBe(2);
  });
  it("a kept name that is already taken in the raw group gets a numeric suffix and overwrites nothing", () => {
    const { project, out } = importKeepingRaw({ raw: { "colors-n": "#123456" }, colors: { n: "zzz" } });
    expect(out.error, JSON.stringify(out)).toBeUndefined();
    const raw = sealedTokens(project)["raw"]!;
    expect(raw["colors-n"]!.$value).toBe("#123456");
    expect(raw["colors-n-2"]!.$value).toBe("zzz");
    expect(out.data!["ledger"].written.total).toBe(2);
  });
  it("two kept members whose sanitized names clash are told apart in id order", () => {
    const { project } = importKeepingRaw({ a: { "x y": "zz" }, "a-x": { y: "zz" } });
    expect(Object.keys(sealedTokens(project)["raw"]!).sort()).toEqual(["a-x-y", "a-x-y-2"]);
  });
});
