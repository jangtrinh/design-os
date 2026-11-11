/**
 * Single-choice kinds in assigned mode (each option gives every member its own outcome) and member labels: the kernel
 * refuses a mix of plain and assigned, refuses an outcome a member may not take, records the assigns as the ruling's
 * members map, and prints `label (id)` wherever a member is shown.
 */
import { describe, expect, it } from "vitest";
import { validateAnswers } from "../src/core/owner-rulings/answer-validator.js";
import { buildCluster, parseStoredCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster, ClusterInput } from "../src/core/owner-rulings/cluster.js";
import { memberText } from "../src/core/owner-rulings/member-text.js";
import { toOwnerClaudePayload, toOwnerMarkdown } from "../src/core/owner-rulings/questions-format.js";
import { outcomeOf } from "../src/core/owner-rulings/ruling-store.js";
import { setValuedOptions } from "../src/core/owner-rulings/set-valued-options.js";

const AT = "2026-11-11T09:00:00Z";
const MEMBERS = ["m1", "m2"];
const choices = { m1: [{ id: "x1", label: "Keep x1" }, { id: "none", label: "None" }], m2: [{ id: "x2", label: "Keep x2" }, { id: "none", label: "None" }] };
const ASSIGNED: ClusterInput["options"] = [
  { id: "all-x", label: "Keep the x", consequence: "keeps one each", assigns: { m1: "x1", m2: "x2" } },
  { id: "none", label: "Exclude all", consequence: "drops", assigns: { m1: "none", m2: "none" } },
  { id: "review-individually", label: "Review individually", consequence: "per member" },
];
const assigned = (over: Partial<ClusterInput> = {}): Cluster =>
  buildCluster({ kind: "token-path-collision", question: "Which?", members: MEMBERS, options: ASSIGNED, memberChoices: choices, raisedBy: "test", ...over });

describe("a single-choice cluster is plain or assigned, never a mix", () => {
  it("builds an assigned cluster and keeps the assigns and the choices", () => {
    const c = assigned();
    expect(c.memberChoices).toEqual(choices);
    expect(c.options[0]!.assigns).toEqual({ m1: "x1", m2: "x2" });
  });
  it("refuses options with assigns and no memberChoices", () => {
    expect(() => assigned({ memberChoices: undefined })).toThrow(/mixes plain and assigned/);
  });
  it("refuses memberChoices beside an option with no assigns", () => {
    const options = [ASSIGNED[0]!, { id: "plain", label: "Plain", consequence: "plain" }, ASSIGNED[2]!];
    expect(() => assigned({ options })).toThrow(/mixes plain and assigned/);
  });
  it("refuses assigns that do not cover exactly the members, or take a value outside the member's choices", () => {
    expect(() => assigned({ options: [{ ...ASSIGNED[0]!, assigns: { m1: "x1" } }, ASSIGNED[1]!, ASSIGNED[2]!] })).toThrow(/cover exactly/);
    expect(() => assigned({ options: [{ ...ASSIGNED[0]!, assigns: { m1: "x2", m2: "x2" } }, ASSIGNED[1]!, ASSIGNED[2]!] })).toThrow(/not one of that member's choices/);
  });
  it("refuses memberChoices that miss a member or give one no choice", () => {
    expect(() => assigned({ memberChoices: { m1: choices.m1 } })).toThrow(/cover exactly its members/);
    expect(() => assigned({ memberChoices: { m1: choices.m1, m2: [] } })).toThrow(/at least one choice/);
  });
  it("a set-valued kind carries neither assigns nor memberChoices", () => {
    expect(() => buildCluster({ kind: "app-roots", question: "q", members: MEMBERS, options: [{ id: "a", label: "a", consequence: "c", selects: ["m1"], assigns: { m1: "x" } }, { id: "b", label: "b", consequence: "c", selects: ["m2"] }] })).toThrow();
    expect(() => buildCluster({ kind: "app-roots", question: "q", members: MEMBERS, memberChoices: choices, options: [{ id: "a", label: "a", consequence: "c", selects: ["m1"] }, { id: "b", label: "b", consequence: "c", selects: ["m2"] }] })).toThrow(/neither assigns nor memberChoices/);
  });
  it("the stored form is read in full: a stored mix is refused and an assigned cluster round-trips", () => {
    const c = assigned();
    expect(parseStoredCluster(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const mixed = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    delete mixed["memberChoices"];
    expect(parseStoredCluster(mixed)).toMatch(/mixes plain and assigned/);
    const outside = JSON.parse(JSON.stringify(c)) as { options: { assigns?: Record<string, string> }[] };
    outside.options[0]!.assigns!["m1"] = "nope";
    expect(parseStoredCluster(outside)).toMatch(/not one of that member's choices/);
  });
});

describe("answering an assigned question", () => {
  const answer = (c: Cluster, entry: Record<string, unknown>): ReturnType<typeof validateAnswers> => validateAnswers([c], { answers: [{ fingerprint: c.fingerprint, ...entry }] }, AT);

  it("choosing an option records its assigns as the ruling's members map; outcomeOf reads it", () => {
    const c = assigned();
    const r = answer(c, { choice: "all-x" });
    if (!r.ok) throw new Error(r.message);
    expect(r.rulings[0]!.members).toEqual({ m1: "x1", m2: "x2" });
    expect(outcomeOf(r.rulings[0]!, "m2")).toBe("x2");
  });
  it("review individually takes one of each member's own choices", () => {
    const c = assigned();
    const r = answer(c, { choice: "review-individually", members: { m1: "none", m2: "x2" } });
    if (!r.ok) throw new Error(r.message);
    expect(r.rulings[0]!.members).toEqual({ m1: "none", m2: "x2" });
  });
  it("a members value outside that member's choices is BAD_ANSWER, even when another member could take it", () => {
    const c = assigned();
    const r = answer(c, { choice: "review-individually", members: { m1: "x2", m2: "x2" } });
    expect(r).toMatchObject({ ok: false, code: "BAD_ANSWER" });
  });
  it("members beside an option is refused", () => {
    const c = assigned();
    expect(answer(c, { choice: "all-x", members: { m1: "x1", m2: "x2" } })).toMatchObject({ ok: false, code: "BAD_ANSWER" });
  });
});

describe("members are printed as `label (id)`", () => {
  const labelled = (): Cluster => assigned({ labels: { m1: "Path one", m2: "Path two" } });
  it("memberText falls back to the id when there is no label, and to the label alone for an empty id", () => {
    expect(memberText({}, "m1")).toBe("m1");
    expect(memberText({ labels: { "": "(no collection)" } }, "")).toBe("(no collection)");
    expect(memberText(labelled(), "m1")).toBe("Path one (m1)");
  });
  it("the sheet lists every member with its label and its choices", () => {
    const sheet = toOwnerMarkdown([labelled()]);
    expect(sheet).toContain("- Path one (m1)");
    expect(sheet).toContain("  - `x1` Keep x1");
    expect(sheet).toContain("- Path two (m2)");
  });
  it("the question sample and the answer key carry the labels", () => {
    const payload = toOwnerClaudePayload([labelled()], 1) as { questions: { question: string }[]; answerKey: { labels: Record<string, string>; memberChoices: unknown }[] };
    expect(payload.questions[0]!.question).toContain("Path one (m1)");
    expect(payload.answerKey[0]!.labels).toEqual({ m1: "Path one", m2: "Path two" });
    expect(payload.answerKey[0]!.memberChoices).toEqual(choices);
  });
  it("a label for something that is not a member is refused", () => {
    expect(() => assigned({ labels: { stray: "x" } })).toThrow(/not a member/);
  });
});

describe("the shared option builder breaks a tie by scan order, never by comparing member strings", () => {
  const sizeOf = (): number => 5;
  const describeOne = (g: readonly string[]): { label: string; consequence: string } => ({ label: g.join("+"), consequence: "c" });
  it("equal sizes keep the order the members were given in ('10:1' stays before '9:1')", () => {
    const options = setValuedOptions({ members: ["10:1", "9:1", "2:1"], weight: sizeOf, describe: describeOne });
    expect(options.map((o) => o.id)).toEqual(["member:10:1", "member:9:1", "member:2:1"]);
  });
  it("with a recommendation, the remaining members are largest first and ties keep scan order", () => {
    const sizes: Record<string, number> = { r: 1, a: 3, b: 9, c: 3, d: 3 };
    const options = setValuedOptions({ members: ["r", "a", "b", "c", "d"], recommended: ["r"], weight: (m) => sizes[m] ?? 0, describe: describeOne });
    expect(options.map((o) => o.id)).toEqual(["keep:recommended", "member:b", "member:a", "keep:rest"]);
    expect(options[3]!.selects).toEqual(["c", "d"]);
  });
});
