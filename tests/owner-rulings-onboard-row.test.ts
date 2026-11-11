/** The `owner rulings` row of `ui onboard`, read-only, and `ui design lint` on manifest version 2. */
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { rulingsRow } from "../src/commands/onboard-rulings-row.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import type { ClusterKind } from "../src/core/owner-rulings/cluster-kinds.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import type { KindEmitter } from "../src/core/owner-rulings/kind-emitter.js";
import { writePending } from "../src/core/owner-rulings/pending-store.js";
import { appendRulings } from "../src/core/owner-rulings/ruling-store.js";
import type { Ruling } from "../src/core/owner-rulings/ruling-store.js";
import { capture, clusterOf, detectionOf, hashTree, scratchProject } from "./owner-rulings-helpers.js";
import { ui } from "./ksync-helpers.js";

const AT = "2026-11-10T14:00:00.000Z";
const ruled = (c: Cluster): Ruling => ({ kind: c.kind, fingerprint: c.fingerprint, choice: "a", covers: c.members, actor: "owner", at: AT });
/** A ruling of a multi-select kind over `covers`, keeping all of them. */
const setRuling = (kind: ClusterKind, covers: string[]): Ruling => ({
  kind, fingerprint: fingerprintOf(kind, covers), choice: covers.map((m) => `keep-${m}`), covers,
  members: Object.fromEntries(covers.map((m) => [m, "keep"])), actor: "owner", at: AT,
});
/** A project-level emitter whose sensed data is the member list itself, and whose domain is given. */
const emitter = (kind: "scan-budget" | "app-roots", members: string[], domain: string[] = members): KindEmitter =>
  ({ kind, sense: () => null, detect: () => detectionOf(kind, members, domain) });

interface Row { ready: boolean; steps: { id: string; state: string }[]; rulings: { pending: number; recorded: number; stale: number } }
const status = (dir: string): Row => JSON.parse(capture(["onboard", "--cwd", dir, "--json"]).out).data as Row;
const text = (dir: string): string => capture(["onboard", "--cwd", dir, "--no-banner"]).out;

/** A project that is otherwise fully set up, so `ready` isolates the rulings row. */
function readyProject(): string {
  const dir = scratchProject();
  const put = (rel: string, body: string): void => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), body); };
  put(".claude/ease-design.json", "{}");
  put(".git/HEAD", "ref: refs/heads/main\n");
  put("design/ds.manifest.json", "{}");
  put("design/soul.md", "---\nstatus: ratified\n---\n");
  put("design/heartbeat.json", "{}");
  return dir;
}

describe("ui onboard — owner rulings row", () => {
  it("none needed: a project with nothing pending and nothing recorded", () => {
    const dir = readyProject();
    const before = hashTree(dir);
    const r = status(dir);
    expect(r.rulings).toEqual({ pending: 0, recorded: 0, stale: 0 });
    expect(r.steps.find((s) => s.id === "rulings")?.state).toBe("done");
    expect(r.ready).toBe(true);
    expect(text(dir)).toContain("owner rulings: none needed");
    expect(text(dir)).not.toContain("questions to ready");
    expect(hashTree(dir)).toBe(before);
  });

  it("N pending: ready turns false, the row names the next command, the tree is unchanged and the exit is 0", () => {
    const dir = readyProject();
    writePending(dir, [clusterOf("token-path-collision", ["walk"]), clusterOf("figma-collections", ["A", "B"])]);
    const before = hashTree(dir);
    const r = status(dir);
    expect(r.rulings.pending).toBe(2);
    expect(r.ready).toBe(false);
    expect(r.steps.find((s) => s.id === "rulings")?.state).toBe("pending");
    const t = text(dir);
    expect(t).toContain("owner rulings: 2 pending (run: ui onboard questions)");
    expect(t).toContain("questions to ready: 0 answered, 2 pending");
    expect(capture(["onboard", "--cwd", dir, "--json"]).code).toBe(0);
    expect(hashTree(dir)).toBe(before);
  });

  it("M recorded, K stale: a ruling whose members left the domain is stale and never deleted; one that lost a member is not", () => {
    const dir = readyProject();
    appendRulings(dir, [ruled(clusterOf("scan-budget", ["old-walk"])), setRuling("app-roots", ["web", "api"])]);
    const before = hashTree(dir);
    // scan-budget still exists but its domain no longer holds the covered member; app-roots lost 'api' only.
    const row = rulingsRow(dir, [emitter("scan-budget", [], ["new-walk"]), emitter("app-roots", [], ["web"])]);
    expect(row).toMatchObject({ pending: 0, recorded: 2, stale: 1, state: "warn" });
    expect(row.label).toBe("owner rulings: 2 recorded, 1 stale");
    expect(hashTree(dir)).toBe(before);
    expect(status(dir).rulings).toEqual({ pending: 0, recorded: 2, stale: 2 }); // production binary: the project-level detectors judge both rulings, and neither member exists in this project
  });

  it("a scan ruling that removes the truncation is not stale: the domain still holds its member", () => {
    const dir = readyProject();
    appendRulings(dir, [ruled(clusterOf("scan-budget", ["generated"]))]);
    expect(rulingsRow(dir, [emitter("scan-budget", [], ["generated"])])).toMatchObject({ pending: 0, recorded: 1, stale: 0, state: "done" });
  });

  it("a member no ruling governs is one pending question; the governed ones are not asked", () => {
    const dir = readyProject();
    appendRulings(dir, [setRuling("app-roots", ["web", "api"])]);
    expect(rulingsRow(dir, [emitter("app-roots", ["web", "api"])])).toMatchObject({ pending: 0, recorded: 1 });
    expect(rulingsRow(dir, [emitter("app-roots", ["web", "api", "docs"])])).toMatchObject({ pending: 1, recorded: 1 });
  });

  it("an unreadable ruling store is a warning row, never a crash (the command always exits 0)", () => {
    const dir = readyProject();
    writeFileSync(join(dir, "design", "design-dir.json"), "{ broken");
    const r = capture(["onboard", "--cwd", dir, "--json"]);
    expect(r.code).toBe(0);
    expect(status(dir).steps.find((s) => s.id === "rulings")?.state).toBe("warn");
    expect(text(dir)).toContain("owner rulings: unreadable");
  });

  it("rejects an unknown flag, keeps `status` as an alias of the bare command", () => {
    const dir = readyProject();
    expect(capture(["onboard", "--cwd", dir, "--bogus", "--json"]).code).toBe(1);
    expect(JSON.parse(capture(["onboard", "status", "--cwd", dir, "--json"]).out).data.ready).toBe(true);
  });

  it("is a few small modules: onboard.ts stays within 200 lines", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["onboard.ts", "onboard-status.ts", "onboard-help.ts", "onboard-questions.ts", "onboard-answer.ts"]) {
      expect(readFileSync(join(process.cwd(), "src", "commands", f), "utf8").split("\n").length, f).toBeLessThanOrEqual(200);
    }
  });
});

describe("ui design lint — manifest schema version 2", () => {
  const CLEAN = join(process.cwd(), "tests", "fixtures", "design-dir", "clean");
  function lintProject(manifest: unknown): { exitCode: number; findings: { checkId: string; message: string; fix: string }[] } {
    const root = scratchProject();
    cpSync(CLEAN, root, { recursive: true });
    mkdirSync(join(root, "design"), { recursive: true });
    writeFileSync(join(root, "design", "design-dir.json"), JSON.stringify(manifest));
    const r = ui(["design", "lint", root, "--json"]);
    return { exitCode: r.exitCode, findings: JSON.parse(r.stdout).data.findings };
  }
  const c = clusterOf("scan-budget", ["walk"]);
  const v2 = { version: 2, onboard: { rulings: [{ ...ruled(c) }] } };

  it("accepts version 1 and version 2 with rulings", () => {
    expect(lintProject({ version: 1 }).findings.map((f) => f.checkId)).not.toContain("bad-manifest");
    const r = lintProject(v2);
    expect(r.findings.map((f) => f.checkId)).not.toContain("bad-manifest");
    expect(r.exitCode).toBe(0);
  });
  it("accepts a version 2 manifest that still declares derived token files", () => {
    expect(lintProject({ version: 2, derived: [{ path: "design/x.tokens.json", derived_from: "design/tokens.json" }] }).findings.map((f) => f.checkId)).not.toContain("bad-manifest");
  });
  it("rejects onboard at version 1 (negative control: the acceptance is not a blanket pass)", () => {
    const r = lintProject({ version: 1, onboard: { rulings: [] } });
    expect(r.findings.map((f) => f.checkId)).toContain("bad-manifest");
    expect(r.exitCode).toBe(1);
  });
  it("rejects a ruling with an unknown kind, a non-owner actor, a short or uppercase fingerprint or a missing covers", () => {
    const bad = (patch: Record<string, unknown>): string[] => lintProject({ version: 2, onboard: { rulings: [{ ...ruled(c), ...patch }] } }).findings.map((f) => f.checkId);
    expect(bad({ kind: "invented-kind" })).toContain("bad-manifest");
    expect(bad({ actor: "agent" })).toContain("bad-manifest");
    expect(bad({ fingerprint: "abc" })).toContain("bad-manifest");
    expect(bad({ fingerprint: c.fingerprint.toUpperCase() })).toContain("bad-manifest");
    expect(bad({ covers: undefined })).toContain("bad-manifest");
    expect(bad({ choice: 5 })).toContain("bad-manifest");
  });
  it("rejects version 3, and the repair hint shows the version 2 shape", () => {
    const r = lintProject({ version: 3 });
    const f = r.findings.find((x) => x.checkId === "bad-manifest");
    expect(f).toBeDefined();
    expect(f!.fix).toContain("onboard");
    expect(f!.fix).toContain('"version": 1 | 2');
  });
});
