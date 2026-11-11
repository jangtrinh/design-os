/**
 * Fix round 2, section K: the source-match question belongs to `--register`. A call without it neither raises nor is
 * blocked by it (and never drops a stored one); `--register` with `--out` or `--apply` is blocked by it; and `--out` is
 * written only after everything that can refuse the call has passed.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { hashTree } from "./owner-rulings-helpers.js";
import { answerKind, envelope, surface } from "./ds-surface-helpers.js";
import { BASE, COLLISION, MATCH, NOW, answerMatch, readyProject, sealedFromFigma } from "./ds-surface-source-match-helpers.js";

const kinds = (p: string): string[] => readPending(p).clusters.map((c) => c.kind);
const withOpenSourceMatch = (): string => {
  const p = readyProject();
  expect(kinds(p)).toContain(MATCH);
  return p;
};

describe("block matrix of an open component-source-match question", () => {
  const rows: { name: string; args: string[]; blocked: boolean }[] = [
    { name: "read", args: [], blocked: false },
    { name: "--out", args: ["--out", "o.json"], blocked: false },
    { name: "--register", args: ["--register"], blocked: false },
    { name: "--register --out", args: ["--register", "--out", "o.json"], blocked: true },
    { name: "--register --apply", args: ["--register", "--apply"], blocked: true },
  ];
  it.each(rows)("$name", ({ args, blocked }) => {
    const p = withOpenSourceMatch();
    const before = hashTree(p, [".design-os"]);
    const r = surface(p, ...args);
    if (blocked) {
      expect(r.code, r.out).toBe(1);
      expect(envelope(r.out).error?.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
      expect(existsSync(join(p, "o.json"))).toBe(false);
      expect(hashTree(p, [".design-os"])).toBe(before);
    } else {
      expect(r.code, r.out).toBe(0);
      expect(existsSync(join(p, "o.json"))).toBe(args.includes("--out"));
    }
    expect(kinds(p), "a call never drops a stored source-match question").toContain("component-source-match");
  });
  it("a call without --register does not raise the question", () => {
    const p = sealedFromFigma(BASE()); surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    surface(p, "--out", "o.json");
    expect(kinds(p)).not.toContain(MATCH);
  });
});

describe("--out is written only after the batch has passed", () => {
  it("a refused batch leaves no --out file", () => {
    const p = sealedFromFigma(BASE()); // the planted undeclared var(--color-missing) in Button is refused by the sealed store's markup rule
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    surface(p, "--register");
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    const r = surface(p, "--register", "--apply", "--now", NOW, "--out", "o.json");
    expect(envelope(r.out).error?.code, r.out).toBe("BATCH_REFUSED");
    expect(existsSync(join(p, "o.json"))).toBe(false);
  });
  it("a passed batch writes it", () => {
    const p = readyProject();
    answerMatch(p, (k) => ({ choice: k.options[0]!.id }));
    const r = surface(p, "--register", "--apply", "--now", NOW, "--out", "o.json");
    expect(r.code, r.out).toBe(0);
    expect(existsSync(join(p, "o.json"))).toBe(true);
  });
});
