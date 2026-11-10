/**
 * The life of a question across runs: a member spelled two ways is one member, a command cleans up its own stored
 * questions, and an answer check sees every earlier ruling of the kind.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rulingsRow } from "../src/commands/onboard-rulings-row.js";
import { runOnboardAnswer } from "../src/commands/onboard-answer.js";
import { runOnboardQuestions } from "../src/commands/onboard-questions.js";
import { runStatus } from "../src/commands/onboard-status.js";
import { blockOnOpenClusters } from "../src/core/owner-rulings/block-contract.js";
import type { BlockInput } from "../src/core/owner-rulings/block-contract.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import type { KindDetection, KindEmitter } from "../src/core/owner-rulings/kind-emitter.js";
import { PENDING_REL, readPending, writePending } from "../src/core/owner-rulings/pending-store.js";
import { appendRulings } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { argsOf, capture, clusterOf, detectionOf, hashTree, optionsFor, scratchProject } from "./owner-rulings-helpers.js";

const NOW = "2026-11-10T14:00:00Z";
const AT = "2026-11-10T14:00:00.000Z";
const block = (dir: string, detections: KindDetection[], over: Partial<BlockInput> = {}): ReturnType<typeof blockOnOpenClusters> =>
  blockOnOpenClusters({ command: "ingest-figma-ds", projectDir: dir, json: true, ownKinds: ["token-path-collision"], detections, ...over });
const answersFile = (dir: string, body: unknown): string => { const f = join(dir, "answers.json"); writeFileSync(f, JSON.stringify(body)); return f; };
const answerAll = (dir: string, clusters: Cluster[]): number =>
  runOnboardAnswer(argsOf("--file", answersFile(dir, { answers: clusters.map((c) => ({ fingerprint: c.fingerprint, choice: "a" })) }), "--cwd", dir, "--now", NOW, "--json"), dir).exitCode;
const blockedClusters = (r: ReturnType<typeof blockOnOpenClusters>): Cluster[] => JSON.parse(r!.stdout!).data.blocked.clusters as Cluster[];

describe("a member spelled in NFD is one member across block, answer and the next run", () => {
  const nfd = "Café/color";
  it("block -> answer -> run again does not block, and ui onboard reports nothing pending and nothing stale", () => {
    const dir = scratchProject();
    const detection = (): KindDetection => detectionOf("scan-budget", [nfd]);
    const own = { ownKinds: ["scan-budget" as const] };
    const first = block(dir, [detection()], own);
    expect(first?.exitCode).toBe(1);
    expect(answerAll(dir, blockedClusters(first))).toBe(0);
    expect(block(dir, [detection()], own)).toBeNull();
    expect(block(dir, [detection()], own)).toBeNull();
    const emitter: KindEmitter = { kind: "scan-budget", sense: () => null, detect: detection };
    expect(rulingsRow(dir, [emitter])).toMatchObject({ pending: 0, recorded: 1, stale: 0 });
  });
});

describe("a command cleans up its own stored questions", () => {
  const pendingExists = (dir: string): boolean => existsSync(join(dir, PENDING_REL));

  it("when its anomaly disappears the next run removes its stored clusters; the file goes when it is empty", () => {
    const dir = scratchProject();
    expect(block(dir, [detectionOf("token-path-collision", ["p/a"])])?.exitCode).toBe(1);
    expect(readPending(dir).clusters).toHaveLength(1);
    expect(block(dir, [detectionOf("token-path-collision", [])])).toBeNull();
    expect(pendingExists(dir)).toBe(false);
    expect(rulingsRow(dir)).toMatchObject({ pending: 0, state: "done" });
  });

  it("leaves the clusters of other kinds untouched, and keeps the file while they remain", () => {
    const dir = scratchProject();
    const other = clusterOf("component-name-collision", ["Button"]);
    writePending(dir, [other, { ...clusterOf("token-path-collision", ["p/a"]), raisedBy: "ingest-figma-ds" }]);
    expect(block(dir, [detectionOf("token-path-collision", [])])).toBeNull();
    expect(readPending(dir).clusters).toEqual([other]);
  });

  it("a run that changes nothing does not rewrite the file", () => {
    const dir = scratchProject();
    const other = clusterOf("component-name-collision", ["Button"]);
    writePending(dir, [other]);
    const file = join(dir, PENDING_REL);
    // A rewrite goes through a temporary file and a rename, so it gives the file a new inode even with the same bytes.
    const stamp = (): string => { const s = statSync(file, { bigint: true }); return `${s.ino}:${s.mtimeNs}`; };
    const before = stamp();
    const bytes = readFileSync(file, "utf8");
    expect(block(dir, [detectionOf("token-path-collision", [])])).toBeNull();
    expect(readFileSync(file, "utf8")).toBe(bytes);
    expect(stamp()).toBe(before);
  });

  it("answering the last pending question removes the file", () => {
    const dir = scratchProject();
    const c = clusterOf("token-path-collision", ["p/a"]);
    writePending(dir, [c]);
    expect(answerAll(dir, [c])).toBe(0);
    expect(pendingExists(dir)).toBe(false);
  });

  it("ui onboard and ui onboard questions' read of the state never write", () => {
    const dir = scratchProject();
    block(dir, [detectionOf("token-path-collision", ["p/a"])]);
    const before = hashTree(dir);
    capture(["onboard", "--cwd", dir, "--json"]);
    capture(["onboard", "--cwd", dir, "--no-banner"]);
    expect(rulingsRow(dir)).toMatchObject({ pending: 1 });
    expect(hashTree(dir)).toBe(before);
  });
});

describe("a command replaces only the questions it raised", () => {
  const shared = (dir: string, command: string, members: string[]): ReturnType<typeof block> =>
    block(dir, [detectionOf("untypeable-tokens", members)], { command, ownKinds: ["untypeable-tokens"] });

  it("a second command that shares the kind and finds nothing neither blocks nor removes the first command's question", () => {
    const dir = scratchProject();
    expect(shared(dir, "ds-import", ["import:tok1"])?.exitCode).toBe(1);
    const bytes = readFileSync(join(dir, PENDING_REL), "utf8");
    expect(shared(dir, "ingest-figma-ds", [])).toBeNull();
    expect(readFileSync(join(dir, PENDING_REL), "utf8")).toBe(bytes);
    expect(rulingsRow(dir)).toMatchObject({ pending: 1 });
  });
  it("the second command that finds its own anomaly blocks only on its own question, and both stay stored", () => {
    const dir = scratchProject();
    shared(dir, "ds-import", ["import:tok1"]);
    const r = shared(dir, "ingest-figma-ds", ["ingest:tok2"]);
    expect(blockedClusters(r).map((c) => c.members)).toEqual([["ingest:tok2"]]);
    expect(readPending(dir).clusters.map((c) => c.raisedBy).sort()).toEqual(["ds-import", "ingest-figma-ds"]);
  });
  it("the command that raised a question replaces it when its anomaly is gone", () => {
    const dir = scratchProject();
    shared(dir, "ds-import", ["import:tok1"]);
    expect(shared(dir, "ds-import", [])).toBeNull();
    expect(existsSync(join(dir, PENDING_REL))).toBe(false);
  });
  it("a project-level kind the second command computes itself is replaced whoever raised it", () => {
    const dir = scratchProject();
    block(dir, [detectionOf("scan-budget", ["generated"])], { command: "door-a", ownKinds: ["scan-budget"] });
    expect(block(dir, [detectionOf("scan-budget", [])], { command: "door-b", ownKinds: ["scan-budget"] })).toBeNull();
    expect(existsSync(join(dir, PENDING_REL))).toBe(false);
  });
  it("the same question raised by two commands is stored once, as the later command's", () => {
    const dir = scratchProject();
    shared(dir, "ds-import", ["tok"]);
    const r = shared(dir, "ingest-figma-ds", ["tok"]);
    expect(blockedClusters(r)).toHaveLength(1);
    expect(readPending(dir).clusters.map((c) => c.raisedBy)).toEqual(["ingest-figma-ds"]);
  });
  it("a project-level kind is replaced by whichever command ran its detector", () => {
    const dir = scratchProject();
    block(dir, [detectionOf("scan-budget", ["generated"])], { command: "door-a", ownKinds: ["scan-budget"] });
    const quiet: KindEmitter = { kind: "scan-budget", sense: () => null, detect: () => null };
    expect(block(dir, [], { command: "door-b", ownKinds: [], runsProjectDetectors: true, emitters: [quiet] })).toBeNull();
    expect(existsSync(join(dir, PENDING_REL))).toBe(false);
  });
});

describe("ui onboard questions cleans up before it says nothing is pending", () => {
  it("removes a project-level question whose anomaly is gone, so it can no longer be answered", () => {
    const dir = scratchProject();
    const first = block(dir, [detectionOf("scan-budget", ["generated"])], { command: "door", ownKinds: ["scan-budget"] });
    const fp = blockedClusters(first)[0]!.fingerprint;
    const gone: KindEmitter = { kind: "scan-budget", sense: () => null, detect: () => null };
    const r = runOnboardQuestions(argsOf("--cwd", dir, "--json"), dir, [gone]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout!).error.code).toBe("NO_PENDING_QUESTIONS");
    expect(existsSync(join(dir, PENDING_REL))).toBe(false);
    const a = runOnboardAnswer(argsOf("--file", answersFile(dir, { answers: [{ fingerprint: fp, choice: "a" }] }), "--cwd", dir, "--now", NOW, "--json"), dir, [gone]);
    expect(a.exitCode).toBe(1);
    expect(JSON.parse(a.stdout!).error.code).toBe("STALE_ANSWER");
    expect(existsSync(join(dir, "design", "design-dir.json"))).toBe(false);
  });
});

describe("removing the last pending file", () => {
  it("removes the onboard directory when it is empty, and never .design-os itself", () => {
    const dir = scratchProject();
    block(dir, [detectionOf("token-path-collision", ["p/a"])]);
    expect(block(dir, [detectionOf("token-path-collision", [])])).toBeNull();
    expect(existsSync(join(dir, ".design-os", "onboard"))).toBe(false);
    expect(existsSync(join(dir, ".design-os"))).toBe(true);
  });
  it("keeps the onboard directory when it holds anything else", () => {
    const dir = scratchProject();
    block(dir, [detectionOf("token-path-collision", ["p/a"])]);
    writeFileSync(join(dir, ".design-os", "onboard", "notes.txt"), "keep me");
    expect(block(dir, [detectionOf("token-path-collision", [])])).toBeNull();
    expect(readdirSync(join(dir, ".design-os", "onboard"))).toEqual(["notes.txt"]);
  });
  it("the pending store's header lists every writer", () => {
    const header = readFileSync(join(process.cwd(), "src", "core", "owner-rulings", "pending-store.ts"), "utf8").split("*/")[0]!;
    for (const writer of ["blockOnOpenClusters", "ui onboard questions", "ui onboard answer"]) expect(header).toContain(writer);
    expect(header).not.toContain("and by nothing else");
  });
});

describe("a failing detector is state for ui onboard and a bug for every command that writes", () => {
  const boom: KindEmitter = { kind: "scan-budget", sense: () => null, detect: () => { throw new Error("emitter bug"); } };
  it("ui onboard exits 0, prints its other rows, names the kind and the error in the rulings row, and is not ready", () => {
    const dir = scratchProject();
    const text = runStatus(argsOf("--cwd", dir, "--no-banner"), [boom]);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain("git initialized");
    expect(text.stdout).toContain("scan-budget");
    expect(text.stdout).toContain("emitter bug");
    expect(text.stdout).toContain("SETUP");
    const json = JSON.parse(runStatus(argsOf("--cwd", dir, "--json"), [boom]).stdout!).data;
    expect(json.ready).toBe(false);
    expect(json.steps.find((x: { id: string }) => x.id === "rulings").state).toBe("pending");
    expect(json.rulings.unreadable).toContain("scan-budget");
    expect(json.rulings.unreadable).toContain("emitter bug");
  });
  it("a detector whose question builder throws is reported the same way", () => {
    const e: KindEmitter = { kind: "scan-budget", sense: () => null, detect: () => ({ kind: "scan-budget", members: ["x"], domain: ["x"], ask: () => { throw new Error("ask bug"); } }) };
    const r = JSON.parse(runStatus(argsOf("--cwd", scratchProject(), "--json"), [e]).stdout!).data;
    expect(r.rulings.unreadable).toContain("scan-budget");
    expect(r.rulings.unreadable).toContain("ask bug");
  });
  it("an exception that did not come from an emitter's detector is not swallowed by the status", () => {
    const broken = { get kind(): never { throw new Error("not a detector"); } } as unknown as KindEmitter;
    expect(() => runStatus(argsOf("--cwd", scratchProject(), "--json"), [broken])).toThrow("not a detector");
  });
  it("the blocking contract, ui onboard questions and ui onboard answer still propagate the same exception", () => {
    const dir = scratchProject();
    expect(() => block(dir, [], { ownKinds: [], runsProjectDetectors: true, emitters: [boom] })).toThrow("emitter bug");
    expect(() => runOnboardQuestions(argsOf("--cwd", dir), dir, [boom])).toThrow("emitter bug");
    const c = clusterOf("token-path-collision", ["p/a"]);
    writePending(dir, [c]);
    expect(() => runOnboardAnswer(argsOf("--file", answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: "a" }] }), "--cwd", dir, "--now", NOW, "--json"), dir, [boom])).toThrow("emitter bug");
  });
});

describe("an answer check sees every earlier ruling of the kind", () => {
  /** A collections-like kind: keeping a member whose alias target was dropped earlier would leave an alias dangling. */
  const aliases: Record<string, string> = { c7: "c5" };
  const emitter: KindEmitter & { seen: Record<string, string>[] } = {
    kind: "figma-collections", seen: [],
    detect: () => null,
    checkAnswer(_cluster, outcomes) {
      this.seen.push({ ...outcomes });
      const dangling = Object.entries(aliases).filter(([from, to]) => outcomes[from] === "keep" && outcomes[to] === "drop");
      return dangling.length === 0 ? null : `keeping ${dangling.map(([f]) => f).join(", ")} leaves ${dangling.length} alias(es) pointing at a dropped collection`;
    },
  };
  const earlier = (target: "keep" | "drop"): Ruling => ({
    kind: "figma-collections", fingerprint: fingerprintOf("figma-collections", ["c5"]), choice: target === "keep" ? ["keep-c5"] : ["keep-none"], covers: ["c5"],
    members: { c5: target }, actor: "owner", at: AT,
  });
  const delta = (): Cluster => ({ ...clusterOf("figma-collections", ["c7"]), delta: true, options: optionsFor("figma-collections", ["c7"]) });
  const setup = (target: "keep" | "drop"): { dir: string; file: string } => {
    const dir = scratchProject();
    appendRulings(dir, [earlier(target)]);
    const c = delta();
    writePending(dir, [c]);
    return { dir, file: answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: ["keep-c7"] }] }) };
  };
  const run = (dir: string, file: string): ReturnType<typeof runOnboardAnswer> =>
    runOnboardAnswer(argsOf("--file", file, "--cwd", dir, "--now", NOW, "--json"), dir, [emitter]);

  it("refuses a delta answer that keeps a member whose alias target an earlier ruling dropped; the manifest is byte-identical", () => {
    const { dir, file } = setup("drop");
    const manifest = readFileSync(join(dir, "design", "design-dir.json"), "utf8");
    const before = hashTree(dir);
    const r = run(dir, file);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout!).error.code).toBe("DANGLING_AFTER_SELECTION");
    expect(readFileSync(join(dir, "design", "design-dir.json"), "utf8")).toBe(manifest);
    expect(hashTree(dir)).toBe(before);
  });
  it("accepts the same answer when the earlier ruling kept the target", () => {
    const { dir, file } = setup("keep");
    expect(run(dir, file).exitCode).toBe(0);
  });
  it("hands the check the merged outcomes of the kind: earlier rulings plus the new answer", () => {
    const { dir, file } = setup("keep");
    emitter.seen.length = 0;
    run(dir, file);
    expect(emitter.seen).toEqual([{ c5: "keep", c7: "keep" }]);
  });
  it("sees an earlier answer of the same file: dropping one collection and keeping its dependant in one file is refused", () => {
    const dir = scratchProject();
    const target = { ...clusterOf("figma-collections", ["c5"]) };
    const dependant = { ...clusterOf("figma-collections", ["c7"]) };
    writePending(dir, [target, dependant]);
    const file = answersFile(dir, { answers: [{ fingerprint: target.fingerprint, choice: ["keep-none"] }, { fingerprint: dependant.fingerprint, choice: ["keep-c7"] }] });
    const r = run(dir, file);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout!).error.code).toBe("DANGLING_AFTER_SELECTION");
    expect(existsSync(join(dir, "design", "design-dir.json"))).toBe(false);
  });
  it("does not depend on the order of the answers in a file", () => {
    const dir = scratchProject();
    appendRulings(dir, [earlier("drop")]);
    const reKeep = clusterOf("figma-collections", ["c5"]);
    const dependant = delta();
    const other = clusterOf("scan-budget", ["walk"]);
    const keepDependant = { fingerprint: dependant.fingerprint, choice: ["keep-c7"] };
    const keepTarget = { fingerprint: reKeep.fingerprint, choice: ["keep-c5"] };
    const unrelated = { fingerprint: other.fingerprint, choice: "a" };
    writePending(dir, [reKeep, dependant, other]);
    for (const answers of [[keepDependant, keepTarget], [keepTarget, keepDependant]]) {
      const r = run(dir, answersFile(dir, { answers }));
      expect(r.exitCode, JSON.stringify(answers)).toBe(0);
      rmSync(join(dir, "design"), { recursive: true });
      appendRulings(dir, [earlier("drop")]);
      writePending(dir, [reKeep, dependant, other]);
    }
    for (const answers of [[keepDependant], [unrelated, keepDependant], [keepDependant, unrelated]]) {
      const r = run(dir, answersFile(dir, { answers }));
      expect(r.exitCode, JSON.stringify(answers)).toBe(1);
      expect(JSON.parse(r.stdout!).error.code).toBe("DANGLING_AFTER_SELECTION");
    }
  });
  it("the new answer wins over an earlier ruling of the same member", () => {
    const dir = scratchProject();
    appendRulings(dir, [{ ...earlier("drop"), covers: ["c5", "c7"], members: { c5: "drop", c7: "drop" } }]);
    const c = { ...clusterOf("figma-collections", ["c7"]), options: optionsFor("figma-collections", ["c7"]) };
    writePending(dir, [c]);
    emitter.seen.length = 0;
    run(dir, answersFile(dir, { answers: [{ fingerprint: c.fingerprint, choice: ["keep-c7"] }] }));
    expect(emitter.seen[0]).toMatchObject({ c5: "drop", c7: "keep" });
  });
});

describe("an emitter's own failure is not relabelled", () => {
  const boom = (): KindDetection => ({ kind: "token-path-collision", members: ["x"], domain: ["x"], ask: () => { throw new Error("emitter bug"); } });
  it("a throwing ask propagates out of the block contract instead of becoming a store or write error", () => {
    expect(() => block(scratchProject(), [boom()])).toThrow("emitter bug");
  });
  it("a throwing emitter propagates out of ui onboard questions", () => {
    const e: KindEmitter = { kind: "scan-budget", sense: () => null, detect: () => { throw new Error("emitter bug"); } };
    const dir = scratchProject();
    expect(() => runOnboardQuestions(argsOf("--cwd", dir), dir, [e])).toThrow("emitter bug");
  });
  it("a write failure is WRITE_ERROR and a store read failure keeps the store's code", () => {
    const unwritable = scratchProject();
    writeFileSync(join(unwritable, ".design-os"), "a file where the directory must go");
    expect(JSON.parse(block(unwritable, [detectionOf("token-path-collision", ["p"])])!.stdout!).error.code).toBe("WRITE_ERROR");
    const badStore = scratchProject();
    mkdirSync(join(badStore, "design"));
    writeFileSync(join(badStore, "design", "design-dir.json"), "{ nope");
    expect(JSON.parse(block(badStore, [detectionOf("token-path-collision", ["p"])])!.stdout!).error.code).toBe("BAD_MANIFEST");
  });
  it("READ_ERROR is not a code any command returns", () => {
    for (const f of ["onboard-questions.ts", "onboard-answer.ts"]) {
      expect(readFileSync(join(process.cwd(), "src", "commands", f), "utf8")).not.toContain("READ_ERROR");
    }
  });
});
