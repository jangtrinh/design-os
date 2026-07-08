import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
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

// ─── record + compile ────────────────────────────────────────────────────────────

describe("ui memory record + compile", () => {
  it("appends a ledger line and compiles the graph", () => {
    const r = record(["variant_generated", "--data", '{"persona":"liquid-glass","mode":"desktop"}', "--design", "d1", "--at", "2026-07-08T09:00:00Z", "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(JSON.parse(r.out).data.id).toBe("e1");
    expect(existsSync(join(proj, "design", "memory.events.jsonl"))).toBe(true);
    expect(existsSync(join(proj, "design", "memory.graph.json"))).toBe(true);
  });

  it("assigns monotonic ids across records", () => {
    expect(JSON.parse(record(["user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--json"]).out).data.id).toBe("e1");
    expect(JSON.parse(record(["vibe_edit", "--data", '{"word":"warmer","axis":"Motion"}', "--json"]).out).data.id).toBe("e2");
  });

  it("compile --now twice → byte-identical graph", () => {
    record(["variant_generated", "--data", '{"persona":"p","mode":"d"}', "--design", "d1", "--at", "2026-07-08T09:00:00Z"]);
    capture(["memory", "compile", "--now", "2026-07-08T12:00:00Z", "--dir", proj]);
    const a = readFileSync(join(proj, "design", "memory.graph.json"), "utf8");
    capture(["memory", "compile", "--now", "2026-07-08T12:00:00Z", "--dir", proj]);
    const b = readFileSync(join(proj, "design", "memory.graph.json"), "utf8");
    expect(a).toBe(b);
  });

  it("rejects an unknown flag with UNKNOWN_FLAG", () => {
    const r = record(["user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--bogus", "x", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("UNKNOWN_FLAG");
  });

  it("rejects an insight without refs (BAD_EVENT) and an unknown type (BAD_EVENT_TYPE)", () => {
    expect(JSON.parse(record(["insight", "--data", '{"text":"x"}', "--json"]).out).error.code).toBe("BAD_EVENT");
    expect(JSON.parse(record(["frobnicate", "--data", "{}", "--json"]).out).error.code).toBe("BAD_EVENT_TYPE");
  });

  it("compile on an empty project → NO_MEMORY", () => {
    const r = capture(["memory", "compile", "--dir", proj, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("NO_MEMORY");
  });
});

// ─── context ─────────────────────────────────────────────────────────────────────

describe("ui memory context", () => {
  beforeEach(() => {
    record(["variant_generated", "--data", '{"persona":"liquid-glass","mode":"desktop"}', "--design", "d1", "--at", "2026-07-08T09:00:00Z"]);
    record(["user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--at", "2026-07-08T10:00:00Z"]);
    record(["vibe_edit", "--data", '{"word":"warmer","axis":"Depth/Surface"}', "--at", "2026-07-08T11:00:00Z"]);
  });

  it("--for generate emits the preference prior", () => {
    const r = capture(["memory", "context", "--for", "generate", "--now", "2026-07-08T12:00:00Z", "--dir", proj]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("[PROJECT PREFERENCE PRIOR]");
    expect(r.out).toContain("liquid-glass");
    expect(r.out).toContain("warmer");
  });

  it("--for critique excludes persona-preference lines (gate stays craft-only)", () => {
    const r = capture(["memory", "context", "--for", "critique", "--now", "2026-07-08T12:00:00Z", "--dir", proj]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("Personas picked");
    expect(r.out).not.toContain("liquid-glass");
  });

  it("cold start (fresh dir) exits 0 with 'memory: empty'", () => {
    const fresh = mkdtempSync(join(tmpdir(), "ease-cold-"));
    const r = capture(["memory", "context", "--dir", fresh]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("memory: empty");
  });
});

// ─── query / status / fingerprint / registry ─────────────────────────────────────

describe("ui memory query / status / fingerprint", () => {
  it("query --type filters and returns newest first", () => {
    record(["variant_generated", "--data", '{"persona":"p","mode":"d"}', "--design", "d1", "--at", "2026-07-08T09:00:00Z"]);
    record(["user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--at", "2026-07-08T10:00:00Z"]);
    const r = capture(["memory", "query", "--type", "user_pick", "--dir", proj, "--json"]);
    const events = JSON.parse(r.out).data.events as { type: string }[];
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("user_pick");
  });

  it("status exits 0 with ledger/registry/profile summary", () => {
    record(["manual_edit", "--data", '{"summary":"x"}']);
    const r = capture(["memory", "status", "--dir", proj]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("event(s)");
    expect(r.out).toContain("registry:");
    expect(r.out).toContain("profile:");
  });

  it("fingerprint matches node crypto sha256", () => {
    const f = join(proj, "sample.txt");
    writeFileSync(f, "hello world", "utf8");
    const r = capture(["memory", "fingerprint", f]);
    expect(r.out.trim()).toBe("sha256:" + createHash("sha256").update(readFileSync(f)).digest("hex"));
  });

  it("fingerprint on a missing file → FILE_NOT_FOUND", () => {
    expect(JSON.parse(capture(["memory", "fingerprint", "/no/such/file", "--json"]).out).error.code).toBe("FILE_NOT_FOUND");
  });

  it("--no-registry skips the user-registry upsert; default records it", () => {
    record(["manual_edit", "--data", '{"summary":"a"}', "--no-registry"]);
    expect(existsSync(join(home, "projects.json"))).toBe(false);
    record(["manual_edit", "--data", '{"summary":"b"}']);
    expect(existsSync(join(home, "projects.json"))).toBe(true);
  });
});

// ─── consolidate (cross-project taste profile) ───────────────────────────────────

describe("ui memory consolidate", () => {
  function pickInProject(dir: string, vibeWord: string): void {
    capture(["memory", "record", "variant_generated", "--data", '{"persona":"liquid-glass","mode":"desktop"}', "--design", "d1", "--at", "2026-07-08T09:00:00Z", "--dir", dir]);
    capture(["memory", "record", "user_pick", "--data", '{"chosen":"d1","rejected":[]}', "--at", "2026-07-08T10:00:00Z", "--dir", dir]);
    capture(["memory", "record", "vibe_edit", "--data", `{"word":"${vibeWord}","axis":"Depth/Surface"}`, "--at", "2026-07-08T11:00:00Z", "--dir", dir]);
  }

  it("keeps only ≥2-project signals; a 1-project vibe is dropped", () => {
    const p1 = mkdtempSync(join(tmpdir(), "ease-p1-"));
    const p2 = mkdtempSync(join(tmpdir(), "ease-p2-"));
    pickInProject(p1, "warmer");
    pickInProject(p2, "warmer");
    capture(["memory", "record", "vibe_edit", "--data", '{"word":"denser","axis":"Spacing"}', "--at", "2026-07-08T11:30:00Z", "--dir", p1]);

    const c = capture(["memory", "consolidate", "--now", "2026-07-08T12:00:00Z", "--json"]);
    expect(c.code, c.out).toBe(0);
    const prof = JSON.parse(c.out).data;
    const fams = Object.values(prof.computed.personaFamilies) as { projects: number }[];
    expect(fams.some((f) => f.projects === 2)).toBe(true);
    const words = (prof.computed.recurringVibes as { word: string }[]).map((v) => v.word);
    expect(words).toContain("warmer");
    expect(words).not.toContain("denser");
  });

  it("appends an insight and dedupes it by exact text across runs", () => {
    const p1 = mkdtempSync(join(tmpdir(), "ease-i1-"));
    capture(["memory", "record", "manual_edit", "--data", '{"summary":"x"}', "--dir", p1]);
    const refs = '[{"project":"p1","events":["e1"]}]';
    capture(["memory", "consolidate", "--insight", "calm brands win", "--refs", refs, "--now", "2026-07-08T12:00:00Z"]);
    const c2 = capture(["memory", "consolidate", "--insight", "calm brands win", "--refs", refs, "--now", "2026-07-08T13:00:00Z", "--json"]);
    const prof = JSON.parse(c2.out).data;
    expect((prof.insights as { text: string }[]).filter((i) => i.text === "calm brands win").length).toBe(1);
  });

  it("--insight without --refs → BAD_ARG", () => {
    const p1 = mkdtempSync(join(tmpdir(), "ease-i2-"));
    capture(["memory", "record", "manual_edit", "--data", '{"summary":"x"}', "--dir", p1]);
    const r = capture(["memory", "consolidate", "--insight", "no refs here", "--now", "2026-07-08T12:00:00Z", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("an empty registry consolidates to 'no projects yet' at exit 0", () => {
    const r = capture(["memory", "consolidate", "--now", "2026-07-08T12:00:00Z"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no projects yet");
  });
});
