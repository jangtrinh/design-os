import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const savedHome = process.env["EASE_DESIGN_HOME"];
let home: string;
let proj: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ease-home-"));
  proj = mkdtempSync(join(tmpdir(), "ease-proj-"));
  process.env["EASE_DESIGN_HOME"] = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

function record(args: string[], dir = proj): { code: number; out: string; err: string } {
  return capture(["memory", "record", ...args, "--dir", dir]);
}

/** Seed a fixed 5-event ledger: e1 insight, e2 harvested, e3 vibe_edit, e4 user_pick
 * (skipped by exportCorpus — no free text), e5 token_change (reasoned). Corpus items
 * are therefore e1, e2, e3, e5 in that order. */
function seedLedger(): void {
  record(["insight", "--data", '{"text":"calm brands win"}', "--refs", "e0", "--at", "2026-07-08T09:00:00Z"]);
  record(["harvested", "--data", '{"source":"linear.app","what":"spacing scale"}', "--at", "2026-07-08T10:00:00Z"]);
  record(["vibe_edit", "--data", '{"word":"warmer","axis":"Motion"}', "--at", "2026-07-08T11:00:00Z"]);
  record(["user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--at", "2026-07-08T12:00:00Z"]);
  record(["token_change", "--data", '{"path":"color.brand.500","from":"#111","to":"#222","reason":"too dark"}', "--at", "2026-07-08T13:00:00Z"]);
}

// ─── export-corpus ─────────────────────────────────────────────────────────────

describe("ui memory export-corpus", () => {
  it("text mode emits NDJSON, one JSON object per line, in ledger order", () => {
    seedLedger();
    const r = capture(["memory", "export-corpus", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    const lines = r.out.trim().split("\n");
    expect(lines).toHaveLength(4);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed.map((p) => p.id)).toEqual(["e1", "e2", "e3", "e5"]);
    expect(parsed.map((p) => p.tier)).toEqual(["episodic", "semantic", "procedural", "semantic"]);
    expect(parsed[0].text).toBe("calm brands win");
    expect(parsed[3].text).toBe("Token color.brand.500 changed from #111 to #222. Reason: too dark");
  });

  it("text mode on an empty ledger emits nothing (no trailing blank line)", () => {
    const r = capture(["memory", "export-corpus", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toBe("");
  });

  it("--json wraps items in the standard envelope with a count", () => {
    seedLedger();
    const r = capture(["memory", "export-corpus", "--dir", proj, "--json"]);
    expect(r.code, r.out).toBe(0);
    const env = JSON.parse(r.out);
    expect(env.ok).toBe(true);
    expect(env.data.count).toBe(4);
    expect(env.data.items).toHaveLength(4);
    expect(env.data.items.map((i: { id: string }) => i.id)).toEqual(["e1", "e2", "e3", "e5"]);
  });

  it("--since slices exclusively by numeric id", () => {
    seedLedger();
    const r = capture(["memory", "export-corpus", "--since", "e2", "--dir", proj, "--json"]);
    expect(r.code, r.out).toBe(0);
    const env = JSON.parse(r.out);
    expect(env.data.items.map((i: { id: string }) => i.id)).toEqual(["e3", "e5"]);
  });

  it("bad --since (invalid event id) -> BAD_ARG", () => {
    seedLedger();
    const r = capture(["memory", "export-corpus", "--since", "not-an-id", "--dir", proj, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("unknown flag -> UNKNOWN_FLAG", () => {
    seedLedger();
    const r = capture(["memory", "export-corpus", "--bogus", "x", "--dir", proj, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("UNKNOWN_FLAG");
  });
});

// ─── context --rank-file ────────────────────────────────────────────────────────

describe("ui memory context --rank-file", () => {
  function rankFile(ids: string[]): string {
    const f = join(proj, "rank.json");
    writeFileSync(f, JSON.stringify(ids), "utf8");
    return f;
  }

  it("--for generate splices [RECALLED CONTEXT] preserving rank order", () => {
    seedLedger();
    const f = rankFile(["e5", "e1", "e3"]);
    const r = capture(["memory", "context", "--for", "generate", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("[RECALLED CONTEXT]");
    const idxE5 = r.out.indexOf("[e5]");
    const idxE1 = r.out.indexOf("[e1]");
    const idxE3 = r.out.indexOf("[e3]");
    expect(idxE5).toBeGreaterThan(-1);
    expect(idxE1).toBeGreaterThan(idxE5);
    expect(idxE3).toBeGreaterThan(idxE1);
  });

  it("--for why also splices [RECALLED CONTEXT]", () => {
    seedLedger();
    const f = rankFile(["e2"]);
    const r = capture(["memory", "context", "--for", "why", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("[RECALLED CONTEXT]");
    expect(r.out).toContain("[e2]");
  });

  it("--for critique with --rank-file does NOT emit [RECALLED CONTEXT]", () => {
    seedLedger();
    const f = rankFile(["e5", "e1"]);
    const r = capture(["memory", "context", "--for", "critique", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("[RECALLED CONTEXT]");
  });

  it("rank ids absent from the corpus (e.g. a skipped event) are dropped, not erroring", () => {
    seedLedger();
    const f = rankFile(["e4", "e1"]); // e4 is user_pick — skipped by exportCorpus
    const r = capture(["memory", "context", "--for", "generate", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("[e1]");
    expect(r.out).not.toContain("[e4]");
  });

  it("missing rank file -> FILE_NOT_FOUND, in every --for mode", () => {
    seedLedger();
    const missing = join(proj, "no-such-rank.json");
    const rGenerate = capture(["memory", "context", "--for", "generate", "--rank-file", missing, "--dir", proj, "--json"]);
    expect(rGenerate.code).toBe(1);
    expect(JSON.parse(rGenerate.out).error.code).toBe("FILE_NOT_FOUND");

    const rCritique = capture(["memory", "context", "--for", "critique", "--rank-file", missing, "--dir", proj, "--json"]);
    expect(rCritique.code).toBe(1);
    expect(JSON.parse(rCritique.out).error.code).toBe("FILE_NOT_FOUND");
  });

  it("malformed JSON rank file -> BAD_ARG", () => {
    seedLedger();
    const f = join(proj, "bad.json");
    writeFileSync(f, "{ not valid json", "utf8");
    const r = capture(["memory", "context", "--for", "generate", "--rank-file", f, "--dir", proj, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("rank file with a valid JSON but wrong shape (not an array) -> BAD_ARG", () => {
    seedLedger();
    const f = join(proj, "shape.json");
    writeFileSync(f, JSON.stringify({ id: "e1" }), "utf8");
    const r = capture(["memory", "context", "--for", "generate", "--rank-file", f, "--dir", proj, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("--json context payload gains a 'recalled' array in rank order", () => {
    seedLedger();
    const f = rankFile(["e3", "e5"]);
    const r = capture(["memory", "context", "--for", "generate", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj, "--json"]);
    expect(r.code, r.out).toBe(0);
    const env = JSON.parse(r.out);
    expect(env.data.recalled.map((i: { id: string }) => i.id)).toEqual(["e3", "e5"]);
  });

  it("--json context payload for --for critique has an empty 'recalled' array even with a rank file", () => {
    seedLedger();
    const f = rankFile(["e3", "e5"]);
    const r = capture(["memory", "context", "--for", "critique", "--rank-file", f, "--now", "2026-07-08T14:00:00Z", "--dir", proj, "--json"]);
    expect(r.code, r.out).toBe(0);
    const env = JSON.parse(r.out);
    expect(env.data.recalled).toEqual([]);
  });

  it("no --rank-file at all -> no 'recalled' splice, recalled is empty in --json", () => {
    seedLedger();
    const r = capture(["memory", "context", "--for", "generate", "--now", "2026-07-08T14:00:00Z", "--dir", proj, "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("[RECALLED CONTEXT]");
    expect(JSON.parse(r.out).data.recalled).toEqual([]);
  });
});
