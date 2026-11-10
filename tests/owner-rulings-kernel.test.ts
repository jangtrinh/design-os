/** The ruling kernel's stored formats: fingerprints, clusters, the ruling store and the pending store. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster, ClusterInput } from "../src/core/owner-rulings/cluster.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { mergePending, PENDING_REL, PendingStoreError, readPending, writePending } from "../src/core/owner-rulings/pending-store.js";
import { appendRulings, outcomeOf, readRulingStore, RulingStoreError } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { scratchProject } from "./owner-rulings-helpers.js";

const SINGLE: ClusterInput["options"] = [
  { id: "keep-all", label: "Keep all", consequence: "keeps every member" },
  { id: "keep-first", label: "Keep the first", consequence: "keeps one", recommended: true },
  { id: "review-individually", label: "Review individually", consequence: "asks per member" },
];
const single = (members: string[], kind: ClusterInput["kind"] = "scan-budget"): Cluster =>
  buildCluster({ kind, question: "Which?", members, options: SINGLE });

/** A set-valued cluster whose options stand for groups of members. */
const setValued = (groups: Record<string, string[]>, kind: ClusterInput["kind"] = "app-roots"): Cluster =>
  buildCluster({
    kind, question: "Which stay?", members: Object.values(groups).flat(),
    options: [
      ...Object.entries(groups).map(([id, selects]) => ({ id, label: id, consequence: `keeps ${selects.length}`, selects })),
      { id: "review-individually", label: "Review individually", consequence: "asks per member" },
    ],
  });

const AT = "2026-11-10T14:00:00.000Z";
const ruling = (c: Cluster, over: Partial<Ruling> = {}): Ruling => ({ kind: c.kind, fingerprint: c.fingerprint, choice: "keep-first", covers: c.members, actor: "owner", at: AT, ...over });

describe("fingerprint encoding", () => {
  it("is the sha256 of the JSON array [kind, sorted unique members]", async () => {
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(JSON.stringify(["app-roots", ["a", "b"]])).digest("hex");
    expect(fingerprintOf("app-roots", ["b", "a", "a"])).toBe(expected);
  });
  it("tells one member 'a\\nb' from the two members 'a' and 'b'", () => {
    expect(fingerprintOf("app-roots", ["a\nb"])).not.toBe(fingerprintOf("app-roots", ["a", "b"]));
  });
  it("gives one fingerprint to the NFC and the NFD spelling of a name", () => {
    const nfc = "Café";
    const nfd = "Café";
    expect(nfc).not.toBe(nfd);
    expect(fingerprintOf("app-roots", [nfc])).toBe(fingerprintOf("app-roots", [nfd]));
    expect(buildCluster({ kind: "scan-budget", question: "q", members: [nfd], options: SINGLE }).members).toEqual([nfc]);
  });
  it("is unchanged by reordering or repeating members, changes with one more member and with the kind", () => {
    const base = fingerprintOf("figma-collections", ["a", "b"]);
    expect(fingerprintOf("figma-collections", ["b", "a", "b"])).toBe(base);
    expect(fingerprintOf("figma-collections", ["a", "b", "c"])).not.toBe(base);
    expect(fingerprintOf("app-roots", ["a", "b"])).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildCluster", () => {
  it("sorts members, caps samples at 5, counts, puts the recommended option first and review individually last", () => {
    const c = single(["g", "f", "e", "d", "c", "b", "a"]);
    expect(c.members).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(c.samples).toEqual(["a", "b", "c", "d", "e"]);
    expect(c.count).toBe(7);
    expect(c.options.map((o) => o.id)).toEqual(["keep-first", "keep-all", "review-individually"]);
  });
  it("refuses no members, fewer than 2 or more than 4 options, a repeated option id", () => {
    const base: ClusterInput = { kind: "scan-budget", question: "q", members: ["a"], options: SINGLE };
    expect(() => buildCluster({ ...base, members: [] })).toThrow(/no members/);
    expect(() => buildCluster({ ...base, options: SINGLE.slice(0, 1) })).toThrow(/2-4 options/);
    expect(() => buildCluster({ ...base, options: [...SINGLE, { id: "x", label: "x", consequence: "x" }, { id: "y", label: "y", consequence: "y" }] })).toThrow(/2-4 options/);
    expect(() => buildCluster({ ...base, options: [SINGLE[0]!, SINGLE[0]!] })).toThrow(/repeated option id/);
  });
  it("refuses selects on a single-choice kind", () => {
    expect(() => buildCluster({ kind: "scan-budget", question: "q", members: ["a"], options: [{ id: "x", label: "x", consequence: "x", selects: ["a"] }, SINGLE[0]!] })).toThrow(/selects/);
  });
  it("on a set-valued kind requires selects that are disjoint and together equal the members", () => {
    const opt = (id: string, selects?: string[]): ClusterInput["options"][number] => ({ id, label: id, consequence: id, ...(selects === undefined ? {} : { selects }) });
    const make = (options: ClusterInput["options"], members = ["a", "b", "c"]): Cluster => buildCluster({ kind: "app-roots", question: "q", members, options });
    expect(make([opt("x", ["a", "b"]), opt("y", ["c"])]).count).toBe(3);
    expect(() => make([opt("x", ["a", "b"]), opt("y", ["b", "c"])])).toThrow(/disjoint/);
    expect(() => make([opt("x", ["a"]), opt("y", ["b"])])).toThrow(/every member/);
    expect(() => make([opt("x", ["a", "b", "c", "z"]), opt("y", [])])).toThrow(/not a member/);
    expect(() => make([opt("x", ["a", "b", "c"]), opt("y")])).toThrow(/selects/);
  });
});

describe("outcomeOf — the only reader of a ruling's answer", () => {
  it("returns keep or drop per member for a set-valued ruling", () => {
    const c = setValued({ web: ["web"], api: ["api"] });
    const r = ruling(c, { choice: ["web"], members: { web: "keep", api: "drop" } });
    expect(outcomeOf(r, "web")).toBe("keep");
    expect(outcomeOf(r, "api")).toBe("drop");
  });
  it("returns members[member] ?? choice for a single-choice ruling", () => {
    const c = single(["m1", "m2"]);
    expect(outcomeOf(ruling(c, { choice: "keep-all" }), "m1")).toBe("keep-all");
    expect(outcomeOf(ruling(c, { choice: "review-individually", members: { m1: "keep-all", m2: "keep-first" } }), "m2")).toBe("keep-first");
  });
});

describe("ruling store (manifest version 2)", () => {
  const write = (dir: string, doc: unknown): void => { mkdirSync(join(dir, "design"), { recursive: true }); writeFileSync(join(dir, "design", "design-dir.json"), typeof doc === "string" ? doc : JSON.stringify(doc)); };
  const read = (dir: string): string => readFileSync(join(dir, "design", "design-dir.json"), "utf8");

  it("reads a missing manifest and a version 1 manifest as no rulings", () => {
    const dir = scratchProject();
    expect(readRulingStore(dir)).toMatchObject({ version: null, rulings: [] });
    write(dir, { version: 1, derived: [] });
    expect(readRulingStore(dir)).toMatchObject({ version: 1, rulings: [] });
  });

  it("keeps key order and every key other than version and onboard equal — compact one-line manifest", () => {
    const dir = scratchProject();
    write(dir, '{"version":1,"derived":[{"path":"design/x.tokens.json","derived_from":"design/tokens.json"}],"note":{"a":[1,2,{"b":null}]}}');
    appendRulings(dir, [ruling(single(["a"]))]);
    const after = JSON.parse(read(dir));
    expect(Object.keys(after)).toEqual(["version", "derived", "note", "onboard"]);
    expect(after.version).toBe(2);
    expect(after.derived).toEqual([{ path: "design/x.tokens.json", derived_from: "design/tokens.json" }]);
    expect(after.note).toEqual({ a: [1, 2, { b: null }] });
    expect(read(dir).endsWith("}\n")).toBe(true);
    expect(read(dir)).toContain('\n  "version": 2,');
  });

  it("keeps the example of the design-directory docs intact when a ruling is written", () => {
    const docs = readFileSync(join(process.cwd(), "docs", "design-directory.md"), "utf8");
    const example = /## Declaring a derived token file\s+```json\n([\s\S]*?)\n```/.exec(docs)?.[1];
    expect(example).toBeDefined();
    const dir = scratchProject();
    write(dir, example!);
    appendRulings(dir, [ruling(single(["a"]))]);
    const after = JSON.parse(read(dir));
    expect(Object.keys(after)).toEqual(["version", "derived", "onboard"]);
    expect(after.derived).toEqual(JSON.parse(example!).derived);
  });

  it("states in the docs that the manifest is re-serialised and has a single writer", () => {
    const docs = readFileSync(join(process.cwd(), "docs", "design-directory.md"), "utf8");
    expect(docs).toMatch(/re-serialised/);
    expect(docs).toMatch(/one writer at a time/);
  });

  it("creates the manifest when there is none; a re-answer of the same fingerprint replaces the earlier ruling", () => {
    const dir = scratchProject();
    const c = single(["a"]);
    appendRulings(dir, [ruling(c, { choice: "keep-all" })]);
    appendRulings(dir, [ruling(c, { choice: "keep-first" })]);
    expect(readRulingStore(dir).rulings.map((r) => r.choice)).toEqual(["keep-first"]);
  });

  it("refuses an unreadable store with BAD_MANIFEST and leaves it as it was", () => {
    const dir = scratchProject();
    write(dir, "{ not json");
    expect(() => appendRulings(dir, [ruling(single(["a"]))])).toThrow(RulingStoreError);
    expect(read(dir)).toBe("{ not json");
  });

  it("cannot write a ruling its own reader rejects (nothing is written)", () => {
    const dir = scratchProject();
    write(dir, { version: 1 });
    const before = read(dir);
    const good = ruling(single(["a"]));
    const bad: Ruling[] = [
      { ...good, fingerprint: "f" },
      { ...good, fingerprint: good.fingerprint.toUpperCase() },
      { ...good, covers: [1, 2] as unknown as string[] },
      { ...good, actor: "agent" as "owner" },
      { ...good, members: { a: 5 } as unknown as Record<string, string> },
      { ...good, choice: ["x"], members: undefined },
    ];
    for (const r of bad) {
      expect(() => appendRulings(dir, [good, r]), JSON.stringify(r)).toThrow(RulingStoreError);
      expect(read(dir)).toBe(before);
    }
  });

  it("requires a set-valued ruling to carry a keep/drop map over exactly its covers", () => {
    const c = setValued({ web: ["web"], api: ["api"] });
    const dir = scratchProject();
    const ok = ruling(c, { choice: ["web"], members: { web: "keep", api: "drop" } });
    expect(() => appendRulings(dir, [{ ...ok, members: undefined }])).toThrow(/members/);
    expect(() => appendRulings(dir, [{ ...ok, members: { web: "keep" } }])).toThrow(/members/);
    expect(() => appendRulings(dir, [{ ...ok, members: { web: "keep", api: "maybe" } }])).toThrow(/members/);
    expect(() => appendRulings(dir, [{ ...ok, choice: "web" }])).toThrow(/choice/);
    appendRulings(dir, [ok]);
    expect(readRulingStore(dir).rulings).toEqual([ok]);
  });

  it("the schema and the reader agree: 64 lowercase hex and string member values", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "design-dir.schema.json"), "utf8"));
    const validate = new Ajv({ strict: false }).compile(schema);
    const c = setValued({ web: ["web"], api: ["api"] });
    const good = ruling(c, { choice: ["web"], members: { web: "keep", api: "drop" } });
    const doc = (r: unknown): unknown => ({ version: 2, onboard: { rulings: [r] } });
    expect(validate(doc(good))).toBe(true);
    expect(validate(doc({ ...good, fingerprint: good.fingerprint.toUpperCase() }))).toBe(false);
    expect(validate(doc({ ...good, fingerprint: "abc" }))).toBe(false);
    expect(validate(doc({ ...good, members: { web: 5 } }))).toBe(false);
  });
});

describe("pending store", () => {
  const putRaw = (dir: string, doc: unknown): void => { mkdirSync(join(dir, ".design-os", "onboard"), { recursive: true }); writeFileSync(join(dir, PENDING_REL), typeof doc === "string" ? doc : JSON.stringify(doc)); };
  const raw = (c: Cluster): Record<string, unknown> => JSON.parse(JSON.stringify(c));

  it("round-trips clusters and replaces only the kinds the caller computed", () => {
    const dir = scratchProject();
    const a = single(["a"], "scan-budget");
    const b = single(["b"], "source-authority");
    expect(writePending(dir, [a, b])).toContain(PENDING_REL);
    expect(readPending(dir).clusters).toEqual([a, b]);
    const a2 = single(["a", "a2"], "scan-budget");
    expect(mergePending([a, b], [a2], ["scan-budget"])).toEqual([b, a2]);
  });

  it("a missing file is no pending state", () => {
    expect(readPending(scratchProject()).clusters).toEqual([]);
  });

  it("refuses every malformed file with BAD_PENDING naming the path, that it is safe to delete, and the rebuild command", () => {
    const good = single(["a", "b"]);
    const cases: Record<string, unknown> = {
      "not json": "{ nope",
      "an empty file": "",
      "no clusters array": { version: 1 },
      "a non-string member": { version: 1, round: 1, clusters: [{ ...raw(good), members: [1, 2] }] },
      "a wrong fingerprint": { version: 1, round: 1, clusters: [{ ...raw(good), fingerprint: "f".repeat(64) }] },
      "a short fingerprint": { version: 1, round: 1, clusters: [{ ...raw(good), fingerprint: "f" }] },
      "a wrong count": { version: 1, round: 1, clusters: [{ ...raw(good), count: 9 }] },
      "unsorted members": { version: 1, round: 1, clusters: [{ ...raw(good), members: ["b", "a"] }] },
      "options without ids": { version: 1, round: 1, clusters: [{ ...raw(good), options: [{ id: "a" }, { id: "b" }] }] },
      "one option": { version: 1, round: 1, clusters: [{ ...raw(good), options: [raw(good)["options"] as unknown as never] }] },
      "an unknown kind": { version: 1, round: 1, clusters: [{ ...raw(good), kind: "invented" }] },
      "a good cluster beside a bad one": { version: 1, round: 1, clusters: [raw(good), { ...raw(good), count: 9 }] },
    };
    for (const [name, doc] of Object.entries(cases)) {
      const dir = scratchProject();
      putRaw(dir, doc);
      let thrown: unknown;
      try { readPending(dir); } catch (e) { thrown = e; }
      expect(thrown, name).toBeInstanceOf(PendingStoreError);
      const err = thrown as PendingStoreError;
      expect(err.code, name).toBe("BAD_PENDING");
      expect(err.message, name).toContain(PENDING_REL);
      expect(err.message, name).toContain("safe to delete");
      expect(err.message, name).toContain("ui onboard questions");
    }
  });

  it("refuses a stored set-valued cluster whose selects do not partition its members", () => {
    const dir = scratchProject();
    const c = raw(setValued({ web: ["web"], api: ["api"] }));
    (c["options"] as { selects?: string[] }[])[0]!.selects = ["web", "api"];
    putRaw(dir, { version: 1, round: 1, clusters: [c] });
    expect(() => readPending(dir)).toThrow(PendingStoreError);
  });
});
