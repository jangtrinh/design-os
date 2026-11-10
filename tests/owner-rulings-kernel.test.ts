/** The ruling kernel: fingerprints, clusters, the ruling store, the pending store and how rulings are applied. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRulings } from "../src/core/owner-rulings/apply-rulings.js";
import { buildCluster } from "../src/core/owner-rulings/cluster.js";
import type { Cluster, ClusterInput } from "../src/core/owner-rulings/cluster.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { mergePending, PENDING_REL, readPending, writePending } from "../src/core/owner-rulings/pending-store.js";
import { appendRulings, readRulingStore, RulingStoreError } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { scratchProject } from "./owner-rulings-helpers.js";

const OPTIONS: ClusterInput["options"] = [
  { id: "keep-all", label: "Keep all", consequence: "keeps every member" },
  { id: "keep-first", label: "Keep the first", consequence: "keeps one", recommended: true },
  { id: "review-individually", label: "Review individually", consequence: "asks per member" },
];
const cluster = (members: string[], kind: ClusterInput["kind"] = "figma-collections"): Cluster =>
  buildCluster({ kind, question: "Which collections stay?", members, options: OPTIONS });
const ruling = (c: Cluster, choice = "keep-first"): Ruling => ({ kind: c.kind, fingerprint: c.fingerprint, choice, covers: c.members, actor: "owner", at: "2026-11-10T21:00:00+07:00" });

describe("fingerprint", () => {
  it("is unchanged by reordering or repeating members", () => {
    expect(fingerprintOf("figma-collections", ["c", "a", "b"])).toBe(fingerprintOf("figma-collections", ["a", "b", "c", "a"]));
  });
  it("changes when one member is added, and with the kind", () => {
    const base = fingerprintOf("figma-collections", ["a", "b"]);
    expect(fingerprintOf("figma-collections", ["a", "b", "c"])).not.toBe(base);
    expect(fingerprintOf("app-roots", ["a", "b"])).not.toBe(base);
  });
  it("is a SHA-256 hex digest", () => {
    expect(fingerprintOf("scan-budget", ["x"])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildCluster", () => {
  it("sorts members, caps samples at 5, counts, puts the recommended option first and review individually last", () => {
    const c = cluster(["g", "f", "e", "d", "c", "b", "a"]);
    expect(c.members).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(c.samples).toEqual(["a", "b", "c", "d", "e"]);
    expect(c.count).toBe(7);
    expect(c.options.map((o) => o.id)).toEqual(["keep-first", "keep-all", "review-individually"]);
  });
  it("refuses a cluster without members, with fewer than 2 or more than 4 options, or a repeated option id", () => {
    const base: ClusterInput = { kind: "app-roots", question: "q", members: ["a"], options: OPTIONS };
    expect(() => buildCluster({ ...base, members: [] })).toThrow(/no members/);
    expect(() => buildCluster({ ...base, options: OPTIONS.slice(0, 1) })).toThrow(/2-4 options/);
    expect(() => buildCluster({ ...base, options: [...OPTIONS, { id: "x", label: "x", consequence: "x" }, { id: "y", label: "y", consequence: "y" }] })).toThrow(/2-4 options/);
    expect(() => buildCluster({ ...base, options: [OPTIONS[0]!, OPTIONS[0]!] })).toThrow(/repeated option id/);
  });
});

describe("ruling store (schema version 2)", () => {
  it("reads a version 1 manifest as no rulings, and a missing manifest as none", () => {
    const dir = scratchProject();
    expect(readRulingStore(dir)).toMatchObject({ version: null, rulings: [] });
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design-dir.json"), JSON.stringify({ version: 1, derived: [{ path: "design/x.tokens.json", derived_from: "design/tokens.json" }] }));
    expect(readRulingStore(dir)).toMatchObject({ version: 1, rulings: [] });
  });
  it("writing a ruling upgrades to version 2 and keeps the derived block byte for byte", () => {
    const dir = scratchProject();
    mkdirSync(join(dir, "design"), { recursive: true });
    const derived = `  "derived": [\n    {\n      "path": "design/x.tokens.json",\n      "derived_from": "design/tokens.json"\n    }\n  ]`;
    const before = `{\n  "version": 1,\n${derived}\n}\n`;
    writeFileSync(join(dir, "design", "design-dir.json"), before);
    const c = cluster(["a", "b"]);
    appendRulings(dir, [ruling(c)]);
    const after = readFileSync(join(dir, "design", "design-dir.json"), "utf8");
    expect(after).toContain(derived);
    expect(JSON.parse(after).version).toBe(2);
    expect(readRulingStore(dir).rulings).toEqual([ruling(c)]);
  });
  it("creates the manifest when there is none, and a re-answer of the same fingerprint replaces the earlier ruling", () => {
    const dir = scratchProject();
    const c = cluster(["a"]);
    appendRulings(dir, [ruling(c, "keep-all")]);
    appendRulings(dir, [ruling(c, "keep-first")]);
    expect(readRulingStore(dir).rulings.map((r) => r.choice)).toEqual(["keep-first"]);
  });
  it("refuses an unreadable store with BAD_MANIFEST instead of overwriting it", () => {
    const dir = scratchProject();
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design-dir.json"), "{ not json");
    expect(() => appendRulings(dir, [ruling(cluster(["a"]))])).toThrow(RulingStoreError);
    expect(readFileSync(join(dir, "design", "design-dir.json"), "utf8")).toBe("{ not json");
    writeFileSync(join(dir, "design", "design-dir.json"), JSON.stringify({ version: 2, onboard: { rulings: [{ kind: "nope" }] } }));
    expect(() => readRulingStore(dir)).toThrow(/unknown kind/);
  });
});

describe("pending store", () => {
  it("round-trips clusters, treats a malformed file as empty, and replaces only the kinds the caller computed", () => {
    const dir = scratchProject();
    const a = cluster(["a"], "scan-budget");
    const b = cluster(["b"], "figma-collections");
    expect(writePending(dir, [a, b])).toContain(PENDING_REL);
    expect(readPending(dir).clusters).toEqual([a, b]);
    const a2 = cluster(["a", "a2"], "scan-budget");
    expect(mergePending([a, b], [a2], ["scan-budget"])).toEqual([b, a2]);
    writeFileSync(join(dir, PENDING_REL), "garbage");
    expect(readPending(dir).clusters).toEqual([]);
  });
});

describe("applyRulings", () => {
  it("(AC-3) a new collection that collides with nothing asks exactly one question about exactly that collection", () => {
    const first = cluster(["Primitives", "Semantic", "Spacing"]);
    const rulings = [ruling(first)];
    expect(applyRulings([first], rulings, { checkedKinds: [] })).toMatchObject({ pending: [] });

    const grown = cluster(["Primitives", "Semantic", "Spacing", "Brand Extras"]);
    const { pending, resolved } = applyRulings([grown], rulings, { checkedKinds: [] });
    expect(resolved).toHaveLength(0);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.members).toEqual(["Brand Extras"]);
    expect(pending[0]!.count).toBe(1);
    expect(pending[0]!.delta).toBe(true);
    expect(pending[0]!.fingerprint).toBe(fingerprintOf("figma-collections", ["Brand Extras"]));
  });
  it("applies a ruling to a subset of what it ruled on, and not to another kind", () => {
    const ruled = cluster(["a", "b", "c"]);
    expect(applyRulings([cluster(["a", "c"])], [ruling(ruled)], { checkedKinds: [] }).pending).toEqual([]);
    expect(applyRulings([cluster(["a", "c"], "app-roots")], [ruling(ruled)], { checkedKinds: [] }).pending).toHaveLength(1);
  });
  it("leaves an unrelated cluster whole", () => {
    const c = cluster(["x", "y"]);
    const { pending } = applyRulings([c], [ruling(cluster(["a"]))], { checkedKinds: [] });
    expect(pending).toEqual([c]);
  });
  it("reports a ruling stale only for a checked kind whose members are all gone, and never drops it", () => {
    const old = ruling(cluster(["gone-1", "gone-2"], "app-roots"));
    const live = ruling(cluster(["here"], "scan-budget"));
    const rulings = [old, live];
    const current = [cluster(["here", "new"], "scan-budget")];
    const r = applyRulings(current, rulings, { checkedKinds: ["app-roots", "scan-budget"] });
    expect(r.stale).toEqual([old]);
    expect(applyRulings(current, rulings, { checkedKinds: ["scan-budget"] }).stale).toEqual([]);
    expect(rulings).toHaveLength(2);
  });
});
