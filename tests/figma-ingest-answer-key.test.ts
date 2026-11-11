/**
 * The answer key of `ui onboard questions --format claude` is enough, on its own, to build an answer that
 * `ui onboard answer` accepts: for an assigned question the per-member answer is `{ choice: "review-individually", members }`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colorVar, comp, ingestArgs, newProject, scanOf, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

interface KeyEntry {
  fingerprint: string;
  kind: string;
  options: { id: string }[];
  memberChoices?: Record<string, { id: string }[]>;
  perMemberAnswer?: { choice: unknown; members: unknown };
}

const LIB = { id: "0:1", name: "Library" };
const SCANS: [string, Record<string, unknown>][] = [
  ["token-path-collision", scanOf({ tokens: [colorVar("1:1", "color/primary", "Only"), colorVar("2:1", "color/primary", "Only")] })],
  ["duplicate-component-names", scanOf({ components: [comp("1:1", "Card", LIB), comp("1:2", "Card", LIB)] })],
  ["untypeable-tokens", scanOf({ tokens: [{ id: "VariableID:1:1", name: "flags/x", type: "BOOLEAN", collection: "C", value: true }] })],
];

/** Raises the question, reads the claude payload, and returns the key entry of the kind. */
function keyFor(kind: string, scan: Record<string, unknown>): { project: string; entry: KeyEntry } {
  const project = newProject();
  expect(capture(ingestArgs(writeScan(project, scan), project, newProject())).code).toBe(1);
  const payload = JSON.parse(capture(["onboard", "questions", "--format", "claude", "--cwd", project]).out) as { answerKey: KeyEntry[] };
  return { project, entry: payload.answerKey.find((k) => k.kind === kind)! };
}
const submit = (project: string, answer: Record<string, unknown>): { code: number; out: string } => {
  const file = join(project, `answer-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify({ answers: [answer] }));
  return capture(["onboard", "answer", "--file", file, "--cwd", project, "--now", "2026-11-11T09:00:00Z", "--json"]);
};

describe("an answer built from the claude answer key alone is accepted by `ui onboard answer`", () => {
  for (const [kind, scan] of SCANS) {
    it(`${kind}: an option answer`, () => {
      const { project, entry } = keyFor(kind, scan);
      const r = submit(project, { fingerprint: entry.fingerprint, choice: entry.options[0]!.id });
      expect(r.code, r.out).toBe(0);
    });
    it(`${kind}: the per-member answer, exactly as the key gives it`, () => {
      const { project, entry } = keyFor(kind, scan);
      const per = entry.perMemberAnswer!;
      expect(per.choice).toBe("review-individually");
      const members = Object.fromEntries((per.members as string[]).map((m) => [m, entry.memberChoices![m]![0]!.id]));
      const r = submit(project, { fingerprint: entry.fingerprint, choice: per.choice, members });
      expect(r.code, r.out).toBe(0);
    });
  }
});
