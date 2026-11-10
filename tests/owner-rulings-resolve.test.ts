/** Detections become questions in the kernel only; rulings govern member by member; staleness is judged on the domain. */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { ClusterOption } from "../src/core/owner-rulings/cluster.js";
import type { ClusterKind } from "../src/core/owner-rulings/cluster-kinds.js";
import type { KindDetection } from "../src/core/owner-rulings/kind-emitter.js";
import { governingRuling, resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import { computeRulingState } from "../src/core/owner-rulings/ruling-state.js";
import { writePending } from "../src/core/owner-rulings/pending-store.js";
import { appendRulings } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { scratchProject } from "./owner-rulings-helpers.js";

const AT = "2026-11-10T14:00:00.000Z";

/** A multi-select detection whose options name exactly the members they are asked about. */
function collections(members: string[], domain: string[] = members): KindDetection & { asked: string[][] } {
  const asked: string[][] = [];
  return {
    kind: "figma-collections", members, domain, asked,
    ask(these) {
      asked.push([...these]);
      const options: ClusterOption[] = these.map((m) => ({ id: `keep-${m}`, label: `Keep ${m}`, consequence: `keeps ${m}`, selects: [m] }));
      if (options.length < 2) options.push({ id: "keep-none", label: "None of these", consequence: "keeps none", selects: [] });
      return { question: `Which of ${these.join(", ")} stay?`, options, evidence: { asked: these } };
    },
  };
}
/** A single-choice detection. */
function authority(members: string[], domain: string[] = members): KindDetection {
  return {
    kind: "source-authority", members, domain,
    ask: (these) => ({ question: `Which source wins for ${these.join(", ")}?`, options: [{ id: "a", label: "A", consequence: "a" }, { id: "b", label: "B", consequence: "b" }] }),
  };
}
const setRuling = (kind: ClusterKind, covers: string[], keep: string[], at = AT): Ruling => ({
  kind, fingerprint: fingerprintOf(kind, covers), choice: keep.map((m) => `keep-${m}`), covers,
  members: Object.fromEntries(covers.map((m) => [m, keep.includes(m) ? "keep" : "drop"])), actor: "owner", at,
});
const singleRuling = (covers: string[], choice: string, tag = choice): Ruling => ({ kind: "source-authority", fingerprint: fingerprintOf("source-authority", [...covers, tag]), choice, covers, actor: "owner", at: AT });

describe("an open question is built by the kernel from ask(), for exactly the members still open", () => {
  it("asks about all members when no ruling exists", () => {
    const d = collections(["Alpha", "Beta", "Gamma"]);
    const r = resolveDetections([d], []);
    expect(d.asked).toEqual([["Alpha", "Beta", "Gamma"]]);
    expect(r.open).toHaveLength(1);
    expect(r.open[0]!.delta).toBeUndefined();
    expect(r.open[0]!.evidence).toEqual({ asked: ["Alpha", "Beta", "Gamma"] });
  });
  it("a delta question's options come from ask(unruled members) and name only those members", () => {
    const d = collections(["Alpha", "Beta", "Gamma"]);
    const r = resolveDetections([d], [setRuling("figma-collections", ["Alpha", "Beta"], ["Alpha"])]);
    expect(d.asked).toEqual([["Gamma"]]);
    const c = r.open[0]!;
    expect(c.members).toEqual(["Gamma"]);
    expect(c.delta).toBe(true);
    const text = JSON.stringify([c.question, c.options]);
    expect(text).toContain("Gamma");
    expect(text).not.toMatch(/Alpha|Beta/);
    expect(c.options.find((o) => o.id === "keep-Gamma")?.selects).toEqual(["Gamma"]);
  });
  it("raises nothing when every member has a governing ruling, and exposes the outcomes", () => {
    const d = collections(["Alpha", "Beta"]);
    const r = resolveDetections([d], [setRuling("figma-collections", ["Alpha", "Beta"], ["Alpha"])]);
    expect(r.open).toEqual([]);
    expect(r.outcomes["figma-collections"]).toEqual({ Alpha: "keep", Beta: "drop" });
  });
});

describe("one spelling of a member everywhere", () => {
  const nfc = "Caf\u00e9/color";
  const nfd = "Cafe\u0301/color";
  it("a detection that spells a member in NFD is resolved by a ruling stored in NFC: not open, an outcome, not stale", () => {
    expect(nfc).not.toBe(nfd);
    const r = resolveDetections([authority([nfd], [nfd])], [singleRuling([nfc], "a")]);
    expect(r.open).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(r.outcomes["source-authority"]).toEqual({ [nfc]: "a" });
  });
  it("a domain that spells a covered member in NFD does not make its ruling stale", () => {
    const r = resolveDetections([authority([], [nfd])], [singleRuling([nfc], "a")]);
    expect(r.stale).toEqual([]);
  });
  it("members and domain are de-duplicated after normalising", () => {
    const r = resolveDetections([authority([nfc, nfd], [nfc, nfd])], []);
    expect(r.open[0]!.members).toEqual([nfc]);
    expect(r.open[0]!.count).toBe(1);
  });
});

describe("resolution is linear in the number of members", () => {
  it("20000 members under one ruling resolve to 20000 outcomes and no open question", () => {
    const members = Array.from({ length: 20_000 }, (_, i) => `path/${String(i).padStart(5, "0")}`);
    const r = resolveDetections([authority(members)], [singleRuling(members, "a")]);
    expect(r.open).toEqual([]);
    expect(Object.keys(r.outcomes["source-authority"]!)).toHaveLength(20_000);
  });
});

describe("which ruling governs a member", () => {
  it("is the last ruling of the kind, in store order, that covers it — member by member", () => {
    const first = singleRuling(["m1", "m2"], "a", "first");
    const second = singleRuling(["m2", "m3"], "b", "second");
    expect(governingRuling([first, second], "source-authority", "m1")).toBe(first);
    expect(governingRuling([first, second], "source-authority", "m2")).toBe(second);
    expect(governingRuling([second, first], "source-authority", "m2")).toBe(first);
    const r = resolveDetections([authority(["m1", "m2", "m3"])], [first, second]);
    expect(r.open).toEqual([]);
    expect(r.outcomes["source-authority"]).toEqual({ m1: "a", m2: "b", m3: "b" });
  });
  it("ignores a ruling of another kind", () => {
    const other = { ...singleRuling(["m1"], "a"), kind: "scan-budget" as const };
    expect(governingRuling([other], "source-authority", "m1")).toBeUndefined();
  });
});

describe("stale rulings are judged against the domain of a detection that ran", () => {
  const covers = ["x", "y"];
  const rulings = [singleRuling(covers, "a")];
  it("a detector that finds no anomaly while the members still exist: not stale", () => {
    expect(resolveDetections([authority([], ["x", "y"])], rulings).stale).toEqual([]);
  });
  it("every covered member gone from the domain: stale — the ruling is reported, not removed", () => {
    expect(resolveDetections([authority([], ["z"])], rulings).stale).toEqual(rulings);
    expect(resolveDetections([authority([], [])], rulings).stale).toEqual(rulings);
  });
  it("a kind with no detection in this call is never judged", () => {
    expect(resolveDetections([collections(["only"])], rulings).stale).toEqual([]);
    expect(resolveDetections([], rulings).stale).toEqual([]);
  });
  it("one member lost: not stale", () => {
    expect(resolveDetections([authority([], ["x"])], rulings).stale).toEqual([]);
  });
});

describe("ruling state over a project", () => {
  const stored = (): { dir: string; cluster: ReturnType<typeof buildCluster> } => {
    const dir = scratchProject();
    const cluster = buildCluster({ kind: "source-authority", question: "Which source wins?", members: ["tokens"], options: [{ id: "a", label: "A", consequence: "a" }, { id: "b", label: "B", consequence: "b" }] });
    writePending(dir, [cluster]);
    return { dir, cluster };
  };
  it("keeps a stored cluster of a kind no detection ran for, as stored", () => {
    const { dir, cluster } = stored();
    expect(computeRulingState(dir, { emitters: [] }).pending).toEqual([cluster]);
  });
  it("drops a stored cluster only when every member has a governing ruling", () => {
    const { dir, cluster } = stored();
    appendRulings(dir, [{ ...singleRuling(["tokens"], "a"), fingerprint: cluster.fingerprint }]);
    expect(computeRulingState(dir, { emitters: [] }).pending).toEqual([]);
  });
  it("a stored cluster of a kind the caller recomputed is replaced by the detection", () => {
    const { dir } = stored();
    const state = computeRulingState(dir, { emitters: [], detections: [authority(["tokens", "more"])], ownKinds: ["source-authority"] });
    expect(state.pending).toHaveLength(1);
    expect(state.pending[0]!.members).toEqual(["more", "tokens"]);
    const none = computeRulingState(dir, { emitters: [], detections: [], ownKinds: ["source-authority"] });
    expect(none.pending).toEqual([]);
  });
  it("keeps a stored cluster when only some of its members are governed, and drops it when all are", () => {
    const dir = scratchProject();
    const cluster = buildCluster({ kind: "source-authority", question: "q", members: ["one", "two"], options: [{ id: "a", label: "A", consequence: "a" }, { id: "b", label: "B", consequence: "b" }] });
    writePending(dir, [cluster]);
    appendRulings(dir, [singleRuling(["one"], "a")]);
    expect(computeRulingState(dir, { emitters: [] }).pending).toEqual([cluster]);
    appendRulings(dir, [singleRuling(["two"], "b", "two")]);
    expect(computeRulingState(dir, { emitters: [] }).pending).toEqual([]);
  });
  it("runs the project-level emitters' sense and detect over plain data", () => {
    const dir = scratchProject();
    mkdirSync(join(dir, "marker"), { recursive: true });
    const emitter = {
      kind: "scan-budget" as const,
      sense: (p: string): unknown => readdirSync(join(p, "marker")),
      detect: (input: unknown): KindDetection | null => {
        const names = input as string[];
        return names.length === 0 ? null : { kind: "scan-budget", members: names, domain: names, ask: (t) => ({ question: `Skip ${t.join(", ")}?`, options: [{ id: "skip", label: "Skip", consequence: "s" }, { id: "keep", label: "Keep", consequence: "k" }] }) };
      },
    };
    expect(computeRulingState(dir, { emitters: [emitter] }).pending).toEqual([]);
    writeFileSync(join(dir, "marker", "generated"), "");
    const state = computeRulingState(dir, { emitters: [emitter] });
    expect(state.pending.map((c) => [c.kind, c.members])).toEqual([["scan-budget", ["generated"]]]);
    expect(computeRulingState(dir, { emitters: [emitter], projectLevel: false }).pending).toEqual([]);
  });
});

describe("the kernel is the only place that builds a cluster", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
  const src = join(process.cwd(), "src");
  const files = walk(src);
  const inKernel = (f: string): boolean => f.startsWith(join(src, "core", "owner-rulings"));

  it("buildCluster is not imported outside src/core/owner-rulings/", () => {
    const offenders = files.filter((f) => !inKernel(f) && /\bbuildCluster\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
  it("the probe can go red: the kernel itself does mention buildCluster", () => {
    expect(files.filter((f) => inKernel(f) && /\bbuildCluster\b/.test(readFileSync(f, "utf8"))).length).toBeGreaterThan(0);
  });
  it("reshapeCluster and a reshape option are gone", () => {
    expect(files.filter((f) => /reshapeCluster|reshape\??:/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
  it("no side-effect registration remains", () => {
    expect(files.filter((f) => /registerProjectDetector|registerChoiceCheck|clearProjectDetectors|clearChoiceChecks/.test(readFileSync(f, "utf8")))).toEqual([]);
  });
  it("the production code has no way to load an emitter from outside itself", () => {
    const risky = files.filter((f) => inKernel(f) || /src[\\/]commands[\\/]onboard/.test(f))
      .filter((f) => /\bimport\s*\(|\brequire\s*\(|process\.env|createRequire/.test(readFileSync(f, "utf8")));
    expect(risky).toEqual([]);
  });
});
