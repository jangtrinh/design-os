/** Multi-select questions keep every option slot for members; the per-member sheet is always available. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { writePending } from "../src/core/owner-rulings/pending-store.js";
import { capture, clusterOf, hashTree, scratchProject } from "./owner-rulings-helpers.js";

const NOW = "2026-11-10T14:00:00Z";
const members = ["a", "b", "c", "d", "e", "f"];
/** Three single options, one group, an exclusive "none" is added only where a test needs it. */
const six = (): Cluster => clusterOf("app-roots", members);
const answer = (dir: string, c: Cluster, body: Record<string, unknown>): ReturnType<typeof capture> => {
  const file = join(dir, "answers.json");
  writeFileSync(file, JSON.stringify({ answers: [{ fingerprint: c.fingerprint, ...body }] }));
  return capture(["onboard", "answer", "--file", file, "--cwd", dir, "--now", NOW, "--json"]);
};
const code = (out: string): string => (JSON.parse(out) as { error: { code: string } }).error.code;

describe("the per-member answer on a multi-select question", () => {
  it("is accepted for every set-valued cluster, although review-individually is not one of its options", () => {
    const c = six();
    expect(c.options.map((o) => o.id)).not.toContain("review-individually");
    expect(c.options).toHaveLength(4);
    const dir = scratchProject();
    writePending(dir, [c]);
    const r = answer(dir, c, { choice: ["review-individually"], members: Object.fromEntries(members.map((m, i) => [m, i % 2 === 0 ? "keep" : "drop"])) });
    expect(r.code, r.out).toBe(0);
    expect(readRulingStore(dir).rulings[0]!.members).toMatchObject({ a: "keep", b: "drop", f: "drop" });
  });
  it("is still refused without the map, with a wrong map, or combined with another id", () => {
    const c = six();
    const dir = scratchProject();
    writePending(dir, [c]);
    const before = hashTree(dir, ["answers.json"]);
    for (const body of [
      { choice: ["review-individually"] },
      { choice: ["review-individually"], members: { a: "keep" } },
      { choice: ["keep-a", "review-individually"], members: Object.fromEntries(members.map((m) => [m, "keep"])) },
    ]) expect(code(answer(dir, c, body).out), JSON.stringify(body)).toBe("BAD_ANSWER");
    expect(hashTree(dir, ["answers.json"])).toBe(before);
  });
  it("an option that selects nothing is valid only as the single chosen option", () => {
    const c = buildCluster({
      kind: "app-roots", question: "q", members: ["a", "b"], raisedBy: "test-command",
      options: [{ id: "keep-a", label: "a", consequence: "a", selects: ["a"] }, { id: "keep-b", label: "b", consequence: "b", selects: ["b"] }, { id: "none", label: "none", consequence: "keeps none", selects: [] }],
    });
    const dir = scratchProject();
    writePending(dir, [c]);
    expect(code(answer(dir, c, { choice: ["none", "keep-a"] }).out)).toBe("BAD_ANSWER");
    expect(code(answer(dir, c, { choice: ["keep-a", "none"] }).out)).toBe("BAD_ANSWER");
    const r = answer(dir, c, { choice: ["none"] });
    expect(r.code, r.out).toBe(0);
    expect(readRulingStore(dir).rulings[0]!.members).toEqual({ a: "drop", b: "drop" });
  });
});

describe("the question outputs say the per-member answer exists", () => {
  const seeded = (): string => { const d = scratchProject(); writePending(d, [six(), clusterOf("scan-budget", ["walk"])]); return d; };
  it("the markdown sheet lists every member and explains the per-member answer", () => {
    const { out } = capture(["onboard", "questions", "--cwd", seeded(), "--format", "markdown"]);
    for (const m of members) expect(out).toContain(`- ${m}`);
    expect(out).toContain('"review-individually"');
    expect(out).toContain('"keep" or "drop"');
  });
  it("the claude payload and the json output carry a per-member answer note for multi-select questions", () => {
    const claude = JSON.parse(capture(["onboard", "questions", "--cwd", seeded(), "--format", "claude"]).out);
    const multi = claude.answerKey.find((k: { kind: string }) => k.kind === "app-roots");
    expect(multi.perMemberAnswer).toMatchObject({ choice: ["review-individually"], values: ["keep", "drop"], members: members });
    expect(claude.answerKey.find((k: { kind: string }) => k.kind === "scan-budget").perMemberAnswer).toBeUndefined();
    const json = JSON.parse(capture(["onboard", "questions", "--cwd", seeded()]).out);
    expect(json.perMemberAnswer).toContain("review-individually");
    expect(JSON.parse(capture(["onboard", "questions", "--cwd", seeded(), "--json"]).out).data.perMemberAnswer).toContain("review-individually");
  });
});

describe("the unreadable-store rows quote the reader's reason", () => {
  const bad = (rel: string, body: string): string => { const d = scratchProject(); mkdirSync(join(d, rel, ".."), { recursive: true }); writeFileSync(join(d, rel), body); return d; };
  it("an unreadable manifest: the row quotes the reason, does not send the owner to the lint, and the JSON carries it", () => {
    const dir = bad("design/design-dir.json", '{"version":2,"onboard":{"rulings":[{"kind":"app-roots"}]}}');
    const text = capture(["onboard", "--cwd", dir, "--no-banner"]).out;
    expect(text).toContain("owner rulings: unreadable");
    expect(text).toContain("onboard.rulings[0]");
    expect(text).not.toContain("ui design lint");
    const j = JSON.parse(capture(["onboard", "--cwd", dir, "--json"]).out).data;
    expect(j.rulings.unreadable).toContain("onboard.rulings[0]");
  });
  it("an unreadable pending file: the JSON carries the message and its fix, and ready is false", () => {
    const dir = bad(".design-os/onboard/pending.json", "garbage");
    const j = JSON.parse(capture(["onboard", "--cwd", dir, "--json"]).out).data;
    expect(j.ready).toBe(false);
    expect(j.rulings.unreadable).toContain("safe to delete");
    expect(j.rulings.unreadable).toContain("ui onboard questions");
  });
  it("a readable store adds no unreadable key", () => {
    const j = JSON.parse(capture(["onboard", "--cwd", scratchProject(), "--json"]).out).data;
    expect(j.rulings).toEqual({ pending: 0, recorded: 0, stale: 0 });
  });
});
