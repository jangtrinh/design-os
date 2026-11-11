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
import { CHANGED, LINT, addUnregistrableComponent, cleanButtons, lintProject, registeredAndEdited } from "./ds-surface-questions-helpers.js";
import { BASE, COLLISION, MATCH, NOW, answerMatch, readyProject, sealedFromFigma } from "./ds-surface-source-match-helpers.js";

const kinds = (p: string): string[] => readPending(p).clusters.map((c) => c.kind);
/** The three questions of `--register`, each open in its own project: what the registry write would do depends on the answer. */
const OPEN: { kind: string; open: () => string }[] = [
  { kind: MATCH, open: () => readyProject() },
  { kind: CHANGED, open: () => registeredAndEdited() },
  { kind: LINT, open: () => lintProject() },
];

describe.each(OPEN)("block matrix of an open $kind question", ({ kind, open }) => {
  const rows: { name: string; args: string[]; blocked: boolean }[] = [
    { name: "read", args: [], blocked: false },
    { name: "--out", args: ["--out", "o.json"], blocked: false },
    { name: "--register", args: ["--register"], blocked: false },
    { name: "--register --out", args: ["--register", "--out", "o.json"], blocked: true },
    { name: "--register --apply", args: ["--register", "--apply"], blocked: true },
  ];
  const withOpenQuestion = (): string => {
    const p = open();
    surface(p, "--register"); // the question is raised by --register
    expect(kinds(p)).toContain(kind);
    return p;
  };
  it.each(rows)("$name", ({ args, blocked }) => {
    const p = withOpenQuestion();
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
    expect(kinds(p), `a call never drops a stored ${kind} question`).toContain(kind);
  });
});

/** Projects where the question is due but no `--register` call has raised it yet. */
const DUE: { kind: string; due: () => string }[] = [
  { kind: MATCH, due: () => { const p = sealedFromFigma(BASE()); surface(p); answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })); cleanButtons(p); return p; } },
  { kind: CHANGED, due: () => registeredAndEdited() },
  { kind: LINT, due: () => lintProject(false) },
];
describe.each(DUE)("a call without --register does not raise $kind", ({ kind, due }) => {
  it.each([[], ["--out", "o.json"]])("%j", (...args) => {
    const p = due();
    expect(kinds(p)).not.toContain(kind);
    expect(surface(p, ...args.flat() as string[]).code).toBe(0);
    expect(kinds(p)).not.toContain(kind);
    surface(p, "--register");
    expect(kinds(p)).toContain(kind); // and it is due: --register does raise it
  });
});

describe("--out is written only after the batch has passed", () => {
  it("a refused batch leaves no --out file", () => {
    const p = sealedFromFigma(BASE());
    surface(p);
    answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id }));
    cleanButtons(p);
    addUnregistrableComponent(p); // refused by name: a refusal that is not of the lint family is never asked
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
