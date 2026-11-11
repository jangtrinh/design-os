/** `ui onboard questions` and `ui onboard answer`, and the block contract. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_HEADER_MAX, CLAUDE_MAX_OPTIONS, CLAUDE_MAX_QUESTIONS } from "../src/core/brief-questions-format.js";
import { runOnboardAnswer } from "../src/commands/onboard-answer.js";
import { runOnboardQuestions } from "../src/commands/onboard-questions.js";
import { blockOnOpenClusters } from "../src/core/owner-rulings/block-contract.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import type { KindEmitter } from "../src/core/owner-rulings/kind-emitter.js";
import { PENDING_REL, readPending, writePending } from "../src/core/owner-rulings/pending-store.js";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { argsOf, capture, clusterOf, detectionOf, hashTree, scratchProject } from "./owner-rulings-helpers.js";

const NOW = "2026-11-10T14:00:00Z";

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
    clusterOf("figma-collections", ["web", "api"]), clusterOf("token-path-collision", ["x.y"]), clusterOf("figma-library-pages", ["Lib", "Other"]),
    clusterOf("screen-pages", ["A", "B", "C"]), clusterOf("classification-conflicts", ["n1"]), clusterOf("archived-marked-nodes", ["n2"]),
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
    expect(r1.questions.map((q: { multiSelect: boolean }) => q.multiSelect)).toEqual([true, false, true, true]);
    expect(r1.answerKey[0].options[0]).toMatchObject({ id: "keep-web", selects: ["web"] });
    const r2 = JSON.parse(capture(["onboard", "questions", "--cwd", dir, "--format", "claude", "--round", "2"]).out);
    expect(r2.questions).toHaveLength(2);
    expect(errorCode(capture(["onboard", "questions", "--cwd", dir, "--format", "claude", "--round", "3", "--json"]).out)).toBe("NO_PENDING_QUESTIONS");
  });

  it("markdown lists every member, the fingerprint, what each option stands for, and how to review member by member", () => {
    const c = clusterOf("figma-collections", ["A", "B", "C", "D", "E", "F", "G"]);
    const { out } = capture(["onboard", "questions", "--cwd", seeded(c), "--format", "markdown"]);
    for (const m of c.members) expect(out).toContain(`- ${m}`);
    expect(out).toContain(c.fingerprint);
    expect(out).toContain("stands for:");
    expect(out).toContain('"keep" or "drop"');
  });

  it("json format returns the clusters as stored; exit 1 NO_PENDING_QUESTIONS when nothing is pending", () => {
    const c = clusterOf("token-path-collision", ["walk"]);
    expect(JSON.parse(capture(["onboard", "questions", "--cwd", seeded(c)]).out).clusters).toEqual([c]);
    const empty = capture(["onboard", "questions", "--cwd", scratchProject(), "--json"]);
    expect(empty.code).toBe(1);
    expect(errorCode(empty.out)).toBe("NO_PENDING_QUESTIONS");
    expect(JSON.parse(empty.out).error.message).toBe("nothing is pending: the kernel detects no anomaly in this project, and no owner ruling is recorded");
  });

  it("with injected project-level emitters, one pass writes every detected cluster to pending.json", () => {
    const emitter = (kind: "scan-budget" | "app-roots", members: string[]): KindEmitter => ({ kind, sense: () => members, detect: (i) => detectionOf(kind, i as string[]) });
    const dir = scratchProject();
    const r = runOnboardQuestions(argsOf("--cwd", dir, "--json"), dir, [emitter("scan-budget", ["walk"]), emitter("app-roots", ["web", "api"])]);
    expect(r.exitCode).toBe(0);
    expect(readPending(dir).clusters.map((c) => c.kind).sort()).toEqual(["app-roots", "scan-budget"]);
  });

  it("rejects a bad format and an unknown flag", () => {
    const dir = scratchProject();
    expect(capture(["onboard", "questions", "--cwd", dir, "--format", "yaml", "--json"]).code).toBe(1);
    expect(capture(["onboard", "questions", "--cwd", dir, "--bogus", "--json"]).code).toBe(1);
  });
});

describe("a malformed pending file is refused loudly and never reaches the manifest", () => {
  const bad = (): { dir: string; manifest: string } => {
    const dir = scratchProject();
    const good = clusterOf("scan-budget", ["walk"]);
    const manifest = JSON.stringify({ version: 2, onboard: { rulings: [] } }, null, 2) + "\n";
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design-dir.json"), manifest);
    mkdirSync(join(dir, ".design-os", "onboard"), { recursive: true });
    writeFileSync(join(dir, PENDING_REL), JSON.stringify({ version: 1, round: 1, clusters: [{ ...good, members: [1, 2], fingerprint: "f" }] }));
    return { dir, manifest };
  };

  it("answer: exit 1 BAD_PENDING (not 2), the manifest byte-identical", () => {
    const { dir, manifest } = bad();
    const file = answersFile(dir, { answers: [{ fingerprint: "f", choice: "a" }] });
    const before = hashTree(dir);
    const r = answer(dir, file);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("BAD_PENDING");
    expect(JSON.parse(r.out).error.message).toContain("safe to delete");
    expect(readFileSync(join(dir, "design", "design-dir.json"), "utf8")).toBe(manifest);
    expect(hashTree(dir)).toBe(before);
  });
  it("questions: exit 1 BAD_PENDING (not 2), nothing written", () => {
    const { dir } = bad();
    const before = hashTree(dir);
    const r = capture(["onboard", "questions", "--cwd", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("BAD_PENDING");
    expect(hashTree(dir)).toBe(before);
  });
  it("ui onboard: exit 0, an unreadable row naming the file, ready false", () => {
    const { dir } = bad();
    const j = JSON.parse(capture(["onboard", "--cwd", dir, "--json"]).out);
    expect(j.data.ready).toBe(false);
    expect(j.data.steps.find((s: { id: string }) => s.id === "rulings").state).toBe("pending");
    const t = capture(["onboard", "--cwd", dir, "--no-banner"]);
    expect(t.code).toBe(0);
    expect(t.out).toContain("owner rulings: unreadable pending file");
    expect(t.out).toContain(PENDING_REL);
  });
});

describe("ui onboard answer — multi-select kinds", () => {
  const roots = clusterOf("app-roots", ["api", "docs", "web"]); // options keep-api, keep-docs, keep-web (+ review individually)
  const run = (choice: unknown, members?: unknown): { dir: string; r: ReturnType<typeof capture>; before: string } => {
    const dir = seeded(roots);
    const file = answersFile(dir, { answers: [{ fingerprint: roots.fingerprint, choice, ...(members === undefined ? {} : { members }) }] });
    const before = hashTree(dir);
    return { dir, r: answer(dir, file), before };
  };

  it("refuses review-individually alone without a members map; nothing written", () => {
    const { dir, r, before } = run(["review-individually"]);
    expect(r.code).toBe(1);
    expect(errorCode(r.out)).toBe("BAD_ANSWER");
    expect(hashTree(dir)).toBe(before);
  });
  it("refuses review-individually next to another option; nothing written", () => {
    const { dir, r, before } = run(["keep-api", "review-individually"]);
    expect(errorCode(r.out)).toBe("BAD_ANSWER");
    expect(hashTree(dir)).toBe(before);
    const withMap = run(["keep-api", "review-individually"], { api: "keep", docs: "keep", web: "keep" });
    expect(errorCode(withMap.r.out)).toBe("BAD_ANSWER");
  });
  it("accepts review-individually alone with a keep/drop map for exactly the members, and stores that map", () => {
    const { dir, r } = run(["review-individually"], { api: "keep", docs: "drop", web: "keep" });
    expect(r.code, r.out).toBe(0);
    const [stored] = readRulingStore(dir).rulings;
    expect(stored).toMatchObject({ kind: "app-roots", choice: ["review-individually"], covers: ["api", "docs", "web"], members: { api: "keep", docs: "drop", web: "keep" } });
  });
  it("refuses a members map with a missing member, an extra member or a value other than keep/drop", () => {
    for (const map of [{ api: "keep", docs: "drop" }, { api: "keep", docs: "drop", web: "keep", extra: "keep" }, { api: "keep", docs: "drop", web: "a" }]) {
      const { dir, r, before } = run(["review-individually"], map);
      expect(errorCode(r.out), JSON.stringify(map)).toBe("BAD_ANSWER");
      expect(hashTree(dir)).toBe(before);
    }
  });
  it("stores a normal multi-select answer as a per-member keep/drop map expanded from the options", () => {
    const { dir, r } = run(["keep-api", "keep-web"]);
    expect(r.code, r.out).toBe(0);
    expect(readRulingStore(dir).rulings[0]).toMatchObject({ choice: ["keep-api", "keep-web"], members: { api: "keep", docs: "drop", web: "keep" } });
  });
  it("members without review individually is refused", () => {
    expect(errorCode(run(["keep-api"], { api: "keep", docs: "keep", web: "keep" }).r.out)).toBe("BAD_ANSWER");
  });
});

describe("ui onboard answer — success and refusals", () => {
  const budget = clusterOf("token-path-collision", ["walk"]);
  const collections = clusterOf("figma-collections", ["A", "B", "C"]);

  it("records a multi-select answer as one ruling, removes the cluster from pending.json and says what remains", () => {
    const dir = seeded(collections, budget);
    const r = answer(dir, answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A", "keep-B"] }] }));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.remaining).toBe(1);
    expect(readRulingStore(dir).rulings).toHaveLength(1);
    expect(readPending(dir).clusters.map((c) => c.kind)).toEqual(["token-path-collision"]);
  });

  it("text mode prints one summary line per ruling and the next command", () => {
    const dir = seeded(budget);
    const r = capture(["onboard", "answer", "--file", answersFile(dir, { answers: [{ fingerprint: budget.fingerprint, choice: "b" }] }), "--cwd", dir, "--now", NOW]);
    expect(r.out).toContain("recorded 1 ruling(s)");
    expect(r.out).toContain("token-path-collision: b (1 covered");
    expect(r.out).toContain("0 question(s) remain");
  });

  it("--now is optional: the ruling then carries the current time as a UTC instant", () => {
    const dir = seeded(budget);
    const r = answer(dir, answersFile(dir, { answers: [{ fingerprint: budget.fingerprint, choice: "a" }] }), []);
    expect(r.code, r.out).toBe(0);
    const at = readRulingStore(dir).rulings[0]!.at;
    expect(at).toMatch(/Z$/);
    expect(Math.abs(Date.parse(at) - Date.now())).toBeLessThan(60_000);
  });

  it("--now must be a real UTC instant: an impossible date, a bare date, an offset and an unparsable value are refused", () => {
    const dir = seeded(budget);
    const file = answersFile(dir, { answers: [{ fingerprint: budget.fingerprint, choice: "a" }] });
    const before = hashTree(dir);
    for (const now of ["2026-02-30T00:00:00Z", "2026-11-10", "yesterday", "2026-11-10T14:00:00+07:00"]) {
      expect(errorCode(answer(dir, file, ["--now", now]).out), now).toBe("BAD_ARG");
    }
    expect(hashTree(dir)).toBe(before);
    expect(answer(dir, file, ["--now", "2026-11-10T14:00:00.123Z"]).code).toBe(0);
  });

  it("review individually on a single-choice kind needs a members map over exactly the members", () => {
    const c = clusterOf("duplicate-component-names", ["m1", "m2"]);
    const dir = seeded(c);
    const bad = answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "review-individually", members: { m1: "a" } }] });
    expect(errorCode(answer(dir, bad).out)).toBe("BAD_ANSWER");
    const good = answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "review-individually", members: { m1: "a", m2: "b" } }] });
    expect(answer(dir, good).code).toBe(0);
    expect(readRulingStore(dir).rulings[0]!.members).toEqual({ m1: "a", m2: "b" });
  });

  const refused = (body: unknown, code: string, extra?: string[]): string => {
    const dir = seeded(collections, budget);
    const file = answersFile(dir, body);
    const before = hashTree(dir);
    const r = answer(dir, file, extra);
    expect(r.code, r.out).toBe(1);
    expect(errorCode(r.out)).toBe(code);
    expect(hashTree(dir)).toBe(before);
    return r.out;
  };

  it("STALE_ANSWER: says it was already answered or the source changed, and names the next command", () => {
    const out = refused({ answers: [{ fingerprint: "0".repeat(64), choice: "a" }] }, "STALE_ANSWER");
    expect(out).toContain("it was already answered, or the source changed since it was asked");
    expect(out).toContain("ui onboard questions");
  });
  it("STALE_ANSWER: a project with no pending file at all", () => {
    const dir = scratchProject();
    const file = answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A"] }] });
    const before = hashTree(dir);
    expect(errorCode(answer(dir, file).out)).toBe("STALE_ANSWER");
    expect(hashTree(dir)).toBe(before);
  });
  it("BAD_ANSWER: a choice outside the options, a list for a single-choice kind, a single id for a multi-select kind", () => {
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "zzz" }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: ["a"] }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: "keep-A" }] }, "BAD_ANSWER");
  });
  it("BAD_ANSWER: an empty selection, a repeated id, an unknown id inside a list", () => {
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: [] }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A", "keep-A"] }] }, "BAD_ANSWER");
    refused({ answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A", "q"] }] }, "BAD_ANSWER");
  });
  it("BAD_ANSWER: members without review individually; a file that answers nothing; malformed JSON; a repeated fingerprint", () => {
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a", members: { walk: "a" } }] }, "BAD_ANSWER");
    refused({ answers: [] }, "BAD_ANSWER");
    refused("{ not json", "BAD_ANSWER");
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a" }, { fingerprint: budget.fingerprint, choice: "b" }] }, "BAD_ANSWER");
  });
  it("is all or nothing: one bad answer among good ones records none", () => {
    refused({ answers: [{ fingerprint: budget.fingerprint, choice: "a" }, { fingerprint: collections.fingerprint, choice: ["nope"] }] }, "BAD_ANSWER");
  });
  it("DANGLING_AFTER_SELECTION: an emitter's answer check refuses a set that would leave an alias dangling", () => {
    const emitter: KindEmitter = {
      kind: "figma-collections", detect: () => null,
      checkAnswer: (_c, outcomes) => (outcomes["B"] === "drop" && outcomes["A"] === "keep" ? "keeping A but not B leaves 12 aliases pointing into an unselected collection" : null),
    };
    const dir = seeded(collections);
    const bad = answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A"] }] });
    const before = hashTree(dir);
    const r = runOnboardAnswer(argsOf("--file", bad, "--cwd", dir, "--now", NOW, "--json"), dir, [emitter]);
    expect(r.exitCode).toBe(1);
    expect(errorCode(r.stdout!)).toBe("DANGLING_AFTER_SELECTION");
    expect(hashTree(dir)).toBe(before);
    const good = answersFile(dir, { answers: [{ fingerprint: collections.fingerprint, choice: ["keep-A", "keep-B"] }] });
    expect(runOnboardAnswer(argsOf("--file", good, "--cwd", dir, "--now", NOW, "--json"), dir, [emitter]).exitCode).toBe(0);
  });
  it("BAD_ARG: --file missing; FILE_NOT_FOUND for a missing file", () => {
    const dir = seeded(budget);
    const before = hashTree(dir);
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

describe("ui onboard — subcommands", () => {
  it("an unknown subcommand exits 1 and lists the subcommands", () => {
    const r = capture(["onboard", "frobnicate", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.message).toContain("status, questions, answer");
  });
});

describe("the block contract", () => {
  const blockInput = (dir: string, json = true): Parameters<typeof blockOnOpenClusters>[0] => ({
    command: "ingest-figma-ds", projectDir: dir, json, ownKinds: ["figma-collections", "figma-library-pages"],
    detections: [detectionOf("figma-collections", ["A", "B"]), detectionOf("figma-library-pages", ["Lib", "Other"])],
  });

  it("exits 1 ONBOARD_BLOCKED_NEEDS_OWNER_RULING, leaves the output directory byte-identical and writes only pending.json", () => {
    const project = scratchProject();
    const out = join(project, "out");
    mkdirSync(out);
    writeFileSync(join(out, "tokens.json"), "{}");
    const before = hashTree(out);
    const r = blockOnOpenClusters(blockInput(project));
    expect(r?.exitCode).toBe(1);
    const env = JSON.parse(r!.stdout!);
    expect(env.error.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(env.error.message).toContain("ui onboard questions");
    expect(env.data.blocked.clusters).toHaveLength(2);
    expect(env.data.blocked.pendingPath).toBe(PENDING_REL);
    expect(hashTree(out)).toBe(before);
    expect(readPending(project).clusters).toHaveLength(2);
  });

  it("with the output directory equal to the project root, nothing is written except .design-os/", () => {
    const project = scratchProject();
    writeFileSync(join(project, "tokens.json"), "{}");
    mkdirSync(join(project, "design"));
    writeFileSync(join(project, "design", "design-dir.json"), '{"version":1}');
    const before = hashTree(project, [".design-os"]);
    expect(blockOnOpenClusters(blockInput(project))?.exitCode).toBe(1);
    expect(hashTree(project, [".design-os"])).toBe(before);
    expect(hashTree(project)).not.toBe(hashTree(project, [".design-os"]));
  });

  it("text mode prints one line per cluster plus the next command", () => {
    const r = blockOnOpenClusters(blockInput(scratchProject(), false));
    expect(r?.stderr).toContain("figma-collections: 2 affected");
    expect(r?.stderr).toContain("figma-library-pages: 2 affected");
    expect(r?.stderr).toContain("Next: ui onboard questions");
  });

  it("lets the command write once every cluster has a ruling (null = go on)", () => {
    const project = scratchProject();
    const blocked = JSON.parse(blockOnOpenClusters(blockInput(project))!.stdout!).data.blocked.clusters as Cluster[];
    const file = answersFile(project, { answers: blocked.map((c) => ({ fingerprint: c.fingerprint, choice: [c.options[0]!.id] })) });
    expect(answer(project, file).code).toBe(0);
    expect(blockOnOpenClusters(blockInput(project))).toBeNull();
  });

  it("a pending cluster another command left does not block, and is kept in the merged file when this command blocks", () => {
    const project = seeded(clusterOf("component-name-collision", ["Button"]));
    const own = { ...blockInput(project), detections: [], ownKinds: ["figma-collections" as const] };
    expect(blockOnOpenClusters(own)).toBeNull();
    const r = blockOnOpenClusters(blockInput(project));
    expect(JSON.parse(r!.stdout!).data.blocked.clusters.map((c: Cluster) => c.kind).sort()).toEqual(["figma-collections", "figma-library-pages"]);
    expect(readPending(project).clusters.map((c) => c.kind).sort()).toEqual(["component-name-collision", "figma-collections", "figma-library-pages"]);
  });

  it("the doors that run the project-level detectors also block on a stored project-level cluster (no detector of that kind ran)", () => {
    const project = seeded(clusterOf("scan-budget", ["walk"]));
    const input = { ...blockInput(project), detections: [], ownKinds: ["figma-collections" as const], emitters: [] };
    expect(blockOnOpenClusters(input)).toBeNull();
    const door = blockOnOpenClusters({ ...input, runsProjectDetectors: true });
    expect(door?.exitCode).toBe(1);
    expect(JSON.parse(door!.stdout!).data.blocked.clusters.map((c: Cluster) => c.kind)).toEqual(["scan-budget"]);
  });

  it("never throws: a bad manifest, a bad pending file and an unwritable pending path become exit-1 envelopes", () => {
    const badManifest = scratchProject();
    mkdirSync(join(badManifest, "design"));
    writeFileSync(join(badManifest, "design", "design-dir.json"), "{ nope");
    expect(errorCode(blockOnOpenClusters(blockInput(badManifest))!.stdout!)).toBe("BAD_MANIFEST");

    const badPending = scratchProject();
    mkdirSync(join(badPending, ".design-os", "onboard"), { recursive: true });
    writeFileSync(join(badPending, PENDING_REL), "garbage");
    const r = blockOnOpenClusters(blockInput(badPending));
    expect(r?.exitCode).toBe(1);
    expect(errorCode(r!.stdout!)).toBe("BAD_PENDING");

    const unwritable = scratchProject();
    writeFileSync(join(unwritable, ".design-os"), "a file where the directory must go");
    const w = blockOnOpenClusters(blockInput(unwritable));
    expect(w?.exitCode).toBe(1);
    expect(errorCode(w!.stdout!)).toBe("WRITE_ERROR");
    const text = blockOnOpenClusters(blockInput(badManifest, false));
    expect(text?.exitCode).toBe(1);
    expect(text?.stderr).toContain("BAD_MANIFEST");
  });
});
