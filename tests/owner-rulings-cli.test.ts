/** `ui onboard questions` and `ui onboard answer` (AC-19), plus the block contract. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearChoiceChecks, registerChoiceCheck } from "../src/core/owner-rulings/answer-validator.js";
import { blockOnOpenClusters } from "../src/core/owner-rulings/block-contract.js";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { CLAUDE_HEADER_MAX, CLAUDE_MAX_OPTIONS, CLAUDE_MAX_QUESTIONS } from "../src/core/brief-questions-format.js";
import type { ClusterKind } from "../src/core/owner-rulings/cluster-kinds.js";
import { clearProjectDetectors, registerProjectDetector } from "../src/core/owner-rulings/project-detectors.js";
import { PENDING_REL, readPending, writePending } from "../src/core/owner-rulings/pending-store.js";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { capture, hashTree, scratchProject } from "./owner-rulings-helpers.js";

const NOW = "2026-11-10T21:00:00+07:00";
const OPTS = [
  { id: "a", label: "Option A", consequence: "does A to 3", recommended: true },
  { id: "b", label: "Option B", consequence: "does B" },
  { id: "review-individually", label: "Review individually", consequence: "asks per member" },
];
const make = (kind: ClusterKind, members: string[]): Cluster => buildCluster({ kind, question: `Question for ${kind}?`, members, options: OPTS });

afterEach(() => { clearProjectDetectors(); clearChoiceChecks(); });

function seeded(...clusters: Cluster[]): string {
  const dir = scratchProject();
  writePending(dir, clusters);
  return dir;
}
function answersFile(dir: string, body: unknown): string {
  const file = join(dir, "answers.json");
  writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  return file;
}
const answer = (dir: string, file: string, extra: string[] = ["--now", NOW]): ReturnType<typeof capture> =>
  capture(["onboard", "answer", "--file", file, "--cwd", dir, "--json", ...extra]);
const errorCode = (out: string): string => (JSON.parse(out) as { error: { code: string } }).error.code;

describe("ui onboard questions", () => {
  const six = (): Cluster[] => [
    make("scan-budget", ["walk"]), make("app-roots", ["web", "api"]), make("source-authority", ["tokens"]),
    make("figma-collections", ["A", "B", "C"]), make("token-path-collision", ["x.y"]), make("figma-library-pages", ["Lib", "Other"]),
  ];

  it("claude format respects the limits, sets multiSelect for set-valued kinds and pages by round", () => {
    const dir = seeded(...six());
    const r1 = JSON.parse(capture(["onboard", "questions", "--cwd", dir, "--format", "claude"]).out);
    expect(r1.questions).toHaveLength(CLAUDE_MAX_QUESTIONS);
    expect(r1.remaining).toBe(2);
    for (const q of r1.questions) {
      expect(q.header.length).toBeLessThanOrEqual(CLAUDE_HEADER_MAX);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(CLAUDE_MAX_OPTIONS);
      expect(q.options[0].label).toMatch(/\(Recommended\)$/);
    }
    // ask order: scan-budget (single), app-roots (multi), source-authority (single), figma-collections (multi)
    expect(r1.questions.map((q: { multiSelect: boolean }) => q.multiSelect)).toEqual([false, true, false, true]);
    expect(r1.answerKey).toHaveLength(4);
    expect(r1.answerKey[0]).toMatchObject({ kind: "scan-budget", multiSelect: false });
    const r2 = JSON.parse(capture(["onboard", "questions", "--cwd", dir, "--format", "claude", "--round", "2"]).out);
    expect(r2.questions).toHaveLength(2);
    expect(r2.remaining).toBe(0);
    expect(errorCode(capture(["onboard", "questions", "--cwd", dir, "--format", "claude", "--round", "3", "--json"]).out)).toBe("NO_PENDING_QUESTIONS");
  });

  it("markdown lists every member of every cluster and the fingerprint to answer with", () => {
    const c = make("figma-collections", ["A", "B", "C", "D", "E", "F", "G"]);
    const { out } = capture(["onboard", "questions", "--cwd", seeded(c), "--format", "markdown"]);
    for (const m of c.members) expect(out).toContain(`- ${m}`);
    expect(out).toContain(c.fingerprint);
  });

  it("json format returns the clusters as stored; exit 1 NO_PENDING_QUESTIONS when nothing is pending", () => {
    const c = make("scan-budget", ["walk"]);
    const stored = JSON.parse(capture(["onboard", "questions", "--cwd", seeded(c)]).out);
    expect(stored.clusters).toEqual([c]);
    const empty = capture(["onboard", "questions", "--cwd", scratchProject(), "--json"]);
    expect(empty.code).toBe(1);
    expect(errorCode(empty.out)).toBe("NO_PENDING_QUESTIONS");
  });

  it("writes the project-level clusters of every registered detector into pending.json in one pass, and rejects a bad flag", () => {
    registerProjectDetector("scan-budget", () => make("scan-budget", ["walk"]));
    registerProjectDetector("app-roots", () => make("app-roots", ["web", "api"]));
    registerProjectDetector("source-authority", () => null);
    const dir = scratchProject();
    const r = capture(["onboard", "questions", "--cwd", dir, "--json"]);
    expect(r.code).toBe(0);
    expect(readPending(dir).clusters.map((c) => c.kind).sort()).toEqual(["app-roots", "scan-budget"]);
    expect(capture(["onboard", "questions", "--cwd", dir, "--format", "yaml", "--json"]).code).toBe(1);
    expect(capture(["onboard", "questions", "--cwd", dir, "--bogus", "--json"]).code).toBe(1);
  });

  it("refuses a detector registered for a kind a command raises from its own input", () => {
    expect(() => registerProjectDetector("figma-collections", () => null)).toThrow(/not a project-level kind/);
  });
});

describe("ui onboard answer — success", () => {
  it("records a multi-select answer as one ruling, removes the cluster from pending.json and says what remains", () => {
    const collections = make("figma-collections", ["A", "B", "C"]);
    const budget = make("scan-budget", ["walk"]);
    const dir = seeded(collections, budget);
    const file = answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["a", "b"] }] });
    const r = answer(dir, file);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data;
    expect(data.recorded).toHaveLength(1);
    expect(data.remaining).toBe(1);
    const rulings = readRulingStore(dir).rulings;
    expect(rulings).toEqual([{ kind: "figma-collections", fingerprint: collections.fingerprint, choice: ["a", "b"], covers: ["A", "B", "C"], actor: "owner", at: NOW }]);
    expect(readPending(dir).clusters.map((c) => c.kind)).toEqual(["scan-budget"]);
  });

  it("text mode prints one summary line per ruling and the next command", () => {
    const c = make("scan-budget", ["walk"]);
    const dir = seeded(c);
    const r = capture(["onboard", "answer", "--file", answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "b" }] }), "--cwd", dir, "--now", NOW]);
    expect(r.out).toContain("recorded 1 ruling(s)");
    expect(r.out).toContain("scan-budget: b (1 covered");
    expect(r.out).toContain("0 question(s) remain");
  });

  it("review individually needs a members map that covers every member with a per-member option", () => {
    const c = make("duplicate-component-names", ["m1", "m2"]);
    const dir = seeded(c);
    const bad = answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "review-individually", members: { m1: "a" } }] });
    expect(errorCode(answer(dir, bad).out)).toBe("BAD_ANSWER");
    const good = answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "review-individually", members: { m1: "a", m2: "b" } }] });
    expect(answer(dir, good).code).toBe(0);
    expect(readRulingStore(dir).rulings[0]!.members).toEqual({ m1: "a", m2: "b" });
  });
});

describe("ui onboard answer — refusals write nothing (tree hash)", () => {
  const collections = make("figma-collections", ["A", "B", "C"]);
  const budget = make("scan-budget", ["walk"]);

  const refused = (body: unknown, code: string, extra?: string[]): void => {
    const dir = seeded(collections, budget);
    const file = answersFile(dir, body);
    const before = hashTree(dir);
    const r = answer(dir, file, extra);
    expect(r.code, r.out).toBe(1);
    expect(errorCode(r.out)).toBe(code);
    expect(hashTree(dir)).toBe(before);
  };

  it("STALE_ANSWER: a fingerprint that matches no pending cluster", () => refused({ answers: [{ fingerprint: "0".repeat(64), choice: "a" }] }, "STALE_ANSWER"));
  it("STALE_ANSWER: a project with no pending file at all", () => {
    const dir = scratchProject();
    const file = answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["a"] }] });
    const before = hashTree(dir);
    expect(errorCode(answer(dir, file).out)).toBe("STALE_ANSWER");
    expect(hashTree(dir)).toBe(before);
  });
  it("BAD_ANSWER: a choice outside the cluster's options", () => refused({ answers: [{ fingerprint: budget.fingerprint, choice: "zzz" }] }, "BAD_ANSWER"));
  it("BAD_ANSWER: a list given for a single-choice kind", () => refused({ answers: [{ fingerprint: budget.fingerprint, choice: ["a"] }] }, "BAD_ANSWER"));
  it("BAD_ANSWER: a single id given for a set-valued kind", () => refused({ answers: [{ fingerprint: collections.fingerprint, choice: "a" }] }, "BAD_ANSWER"));
  it("BAD_ANSWER: an empty selection, a repeated id, an unknown id inside a list", () => {
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: [] }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: ["a", "a"] }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: ["a", "q"] }] }, "BAD_ANSWER");
  });
  it("BAD_ANSWER: members without review individually", () => refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a", members: { walk: "a" } }] }, "BAD_ANSWER"));
  it("BAD_ANSWER: a file that answers nothing, malformed JSON, a repeated fingerprint", () => {
    refused({ answers: [] }, "BAD_ANSWER");
    refused("{ not json", "BAD_ANSWER");
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a" }, { fingerprint: budget.fingerprint, choice: "b" }] }, "BAD_ANSWER");
  });
  it("is all or nothing: one bad answer among good ones records none", () => {
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a" }, { fingerprint: collections.fingerprint, choice: "nope" }] }, "BAD_ANSWER");
  });
  it("DANGLING_AFTER_SELECTION: a registered per-kind check refuses a set that would leave an alias dangling", () => {
    registerChoiceCheck("figma-collections", (_c, choice) => (Array.isArray(choice) && !choice.includes("b") ? "keeping only [a] leaves 12 aliases pointing into an unselected collection" : null));
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: ["a"] }] }, "DANGLING_AFTER_SELECTION");
    const dir = seeded(collections);
    expect(answer(dir, answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["a", "b"] }] })).code).toBe(0);
  });
  it("BAD_ARG: --now missing or not ISO, --file missing; FILE_NOT_FOUND for a missing file", () => {
    const dir = seeded(budget);
    const file = answersFile(dir, { answers: [{ fingerprint: budget.fingerprint, choice: "a" }] });
    const before = hashTree(dir);
    expect(errorCode(capture(["onboard", "answer", "--file", file, "--cwd", dir, "--json"]).out)).toBe("BAD_ARG");
    expect(errorCode(answer(dir, file, ["--now", "yesterday"]).out)).toBe("BAD_ARG");
    expect(errorCode(capture(["onboard", "answer", "--cwd", dir, "--now", NOW, "--json"]).out)).toBe("BAD_ARG");
    expect(errorCode(answer(dir, join(dir, "missing.json")).out)).toBe("FILE_NOT_FOUND");
    expect(hashTree(dir)).toBe(before);
  });
  it("BAD_MANIFEST: an unreadable ruling store is never overwritten", () => {
    const dir = seeded(budget);
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design-dir.json"), "{ nope");
    const file = answersFile(dir, { answers: [{ fingerprint: budget.fingerprint, choice: "a" }] });
    const before = hashTree(dir);
    expect(errorCode(answer(dir, file).out)).toBe("BAD_MANIFEST");
    expect(hashTree(dir)).toBe(before);
  });
});

describe("the block contract", () => {
  const input = (dir: string, json: boolean): Parameters<typeof blockOnOpenClusters>[0] =>
    ({ command: "ingest-figma-ds", projectDir: dir, clusters: [make("figma-collections", ["A", "B"]), make("figma-library-pages", ["Lib", "Other"])], ownKinds: ["figma-collections", "figma-library-pages"], json });

  it("exits 1 ONBOARD_BLOCKED_NEEDS_OWNER_RULING, leaves the output directory byte-identical and writes only pending.json", () => {
    const project = scratchProject();
    const out = join(project, "out");
    mkdirSync(out);
    writeFileSync(join(out, "tokens.json"), "{}");
    const before = hashTree(out);
    const r = blockOnOpenClusters(input(project, true));
    expect(r?.exitCode).toBe(1);
    const env = JSON.parse(r!.stdout!);
    expect(env.error.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(env.error.message).toContain("ui onboard questions");
    expect(env.data.blocked.clusters).toHaveLength(2);
    expect(env.data.blocked.pendingPath).toBe(PENDING_REL);
    expect(hashTree(out)).toBe(before);
    expect(readPending(project).clusters).toHaveLength(2);
    expect(readFileSync(join(project, PENDING_REL), "utf8")).toContain("figma-library-pages");
  });
  it("text mode prints one line per cluster plus the next command", () => {
    const r = blockOnOpenClusters(input(scratchProject(), false));
    expect(r?.stderr).toContain("figma-collections: 2 affected");
    expect(r?.stderr).toContain("figma-library-pages: 2 affected");
    expect(r?.stderr).toContain("Next: ui onboard questions");
  });
  it("lets the command write once every cluster has a ruling (null = go on)", () => {
    const project = scratchProject();
    const blocked = JSON.parse(blockOnOpenClusters(input(project, true))!.stdout!).data.blocked.clusters as Cluster[];
    const file = answersFile(project, { answers: blocked.map((c) => ({ fingerprint: c.fingerprint, choice: c.kind === "figma-collections" || c.kind === "figma-library-pages" ? ["a"] : "a" })) });
    expect(answer(project, file).code).toBe(0);
    expect(blockOnOpenClusters(input(project, true))).toBeNull();
  });
  it("keeps pending clusters of kinds it did not compute", () => {
    const project = seeded(make("scan-budget", ["walk"]));
    blockOnOpenClusters(input(project, true));
    expect(readPending(project).clusters.map((c) => c.kind).sort()).toEqual(["figma-collections", "figma-library-pages", "scan-budget"]);
  });
});
