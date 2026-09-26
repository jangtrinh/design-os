import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";
import { summarizeTrace } from "../src/core/trace-summarize.js";

const read = (path: string, bytes: number, extra: object = {}): string =>
  JSON.stringify({ t: "2026-09-26T10:00:00Z", tool: "Read", path, bytes, ...extra });
const kind = (k: string, extra: object = {}): string =>
  JSON.stringify({ t: "2026-09-26T10:00:01Z", kind: k, ...extra });
const CHECKLIST = "/Users/x/.claude/skills/es-designer/checklist.md";


function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

describe("summarizeTrace — context loaded before the first mutation", () => {
  it("sums bytes and lists distinct files read before the first mutate only", () => {
    const s = summarizeTrace([
      read("knowledge/README.md", 1000),
      read("knowledge/index.json", 200),
      read("knowledge/README.md", 1000), // re-read: bytes count again, file listed once
      kind("mutate"),
      read("design/soul.md", 5000), // after the first mutate — never counted
    ]);
    expect(s.bytesBeforeFirstMutate).toBe(2200);
    expect(s.filesBeforeFirstMutate).toEqual(["knowledge/README.md", "knowledge/index.json"]);
  });

  it("with no mutate at all, every read counts", () => {
    const s = summarizeTrace([read("README.md", 300), read("design/soul.md", 700)]);
    expect(s.bytesBeforeFirstMutate).toBe(1000);
  });

  it("reports README and the knowledge index only when they were opened", () => {
    expect(summarizeTrace([read("design/soul.md", 10)])).toMatchObject({ readmeOpened: false, indexOpened: false });
    expect(summarizeTrace([read("README.md", 10), read("knowledge/index.json", 5)]))
      .toMatchObject({ readmeOpened: true, indexOpened: true });
  });

  it("a read that happens only AFTER the first mutate still counts as opened, not as pre-mutate context", () => {
    const s = summarizeTrace([kind("mutate"), read("README.md", 99)]);
    expect(s.readmeOpened).toBe(true);
    expect(s.bytesBeforeFirstMutate).toBe(0);
  });
});

describe("summarizeTrace — es-designer loaded is not es-designer checklist run", () => {
  it("loaded without the checklist → true/false", () => {
    const s = summarizeTrace([kind("skill", { name: "es-designer" }), read("src/x.css", 40), kind("mutate")]);
    expect(s.esDesignerLoaded).toBe(true);
    expect(s.esDesignerChecklistRan).toBe(false);
  });

  it("loaded, checklist read, but no gate after → still false (reading is not running)", () => {
    const s = summarizeTrace([kind("skill", { name: "es:designer" }), read(CHECKLIST, 2000)]);
    expect(s.esDesignerLoaded).toBe(true);
    expect(s.esDesignerChecklistRan).toBe(false);
  });

  it("loaded, checklist read, then a gate ran → true/true", () => {
    const s = summarizeTrace([kind("skill", { name: "es-designer" }), read(CHECKLIST, 2000), kind("gate")]);
    expect(s.esDesignerLoaded).toBe(true);
    expect(s.esDesignerChecklistRan).toBe(true);
  });

  it("a gate that ran BEFORE the checklist was read does not satisfy it", () => {
    const s = summarizeTrace([kind("skill", { name: "es-designer" }), kind("gate"), read(CHECKLIST, 2000)]);
    expect(s.esDesignerChecklistRan).toBe(false);
    expect(s.gateRuns).toBe(1);
  });

  it("a checklist read with no skill load is not a run; other skills are ignored", () => {
    const s = summarizeTrace([read(CHECKLIST, 2000), kind("gate"), kind("skill", { name: "es-lazy" })]);
    expect(s).toMatchObject({ esDesignerLoaded: false, esDesignerChecklistRan: false });
  });
});

describe("summarizeTrace — gates, coverage, hygiene", () => {
  it("counts every gate run", () => {
    expect(summarizeTrace([kind("gate"), kind("gate"), kind("gate")]).gateRuns).toBe(3);
  });

  it("empty trace: coverage none, zeros — not a fabricated measurement", () => {
    expect(summarizeTrace([])).toEqual({
      bytesBeforeFirstMutate: 0, filesBeforeFirstMutate: [], readmeOpened: false, indexOpened: false,
      esDesignerLoaded: false, esDesignerChecklistRan: false, gateRuns: 0, traceCoverage: "none", malformedLines: 0,
    });
  });

  it("non-empty trace: coverage claude-only", () => {
    expect(summarizeTrace([read("README.md", 1)]).traceCoverage).toBe("claude-only");
  });

  it("counts malformed lines instead of dropping them silently", () => {
    const s = summarizeTrace(["{not json", "[1,2]", "", read("README.md", 4)]);
    expect(s.malformedLines).toBe(2);
    expect(s.bytesBeforeFirstMutate).toBe(4);
  });

  it("--session keeps only that session's records", () => {
    const lines = [
      read("README.md", 100, { session: "a" }), kind("mutate", { session: "a" }),
      read("design/soul.md", 7, { session: "b" }),
    ];
    expect(summarizeTrace(lines, { session: "b" }).bytesBeforeFirstMutate).toBe(7);
    expect(summarizeTrace(lines, { session: "a" }).bytesBeforeFirstMutate).toBe(100);
  });

  it("is deterministic — same lines, same output", () => {
    const lines = [read("README.md", 9), kind("gate")];
    expect(summarizeTrace(lines)).toEqual(summarizeTrace(lines));
  });
});

describe("ui trace summarize (command)", () => {
  function project(lines: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), "trace-"));
    mkdirSync(join(dir, ".design-os", "trace"), { recursive: true });
    writeFileSync(join(dir, ".design-os", "trace", "reads.jsonl"), lines.join("\n") + "\n");
    return dir;
  }

  it("--json returns the summary in the envelope", () => {
    const dir = project([kind("skill", { name: "es-designer" }), read("README.md", 12)]);
    const r = capture(["trace", "summarize", dir, "--json"]);
    expect(r.code).toBe(0);
    const env = JSON.parse(r.out) as { ok: boolean; data: Record<string, unknown> };
    expect(env.ok).toBe(true);
    expect(env.data).toMatchObject({ bytesBeforeFirstMutate: 12, readmeOpened: true, esDesignerLoaded: true, esDesignerChecklistRan: false });
  });

  it("a directory with no trace file reports coverage none", () => {
    const r = capture(["trace", "summarize", mkdtempSync(join(tmpdir(), "trace-empty-")), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.traceCoverage).toBe("none");
  });

  it("errors name the next action", () => {
    expect(capture(["trace", "summarize", "--json"]).out).toContain("requires <dir>");
    expect(capture(["trace", "summarize", "/no/such/dir-xyz", "--json"]).out).toContain("NOT_A_DIR");
    expect(capture(["trace", "summarise", "/tmp", "--json"]).out).toContain("unknown subcommand");
    expect(capture(["trace", "summarize", "/tmp", "--bogus", "--json"]).out).toContain("UNKNOWN_FLAG");
  });
});

describe("design-os-read-trace hook → ui trace summarize (emitter/reader round trip)", () => {
  const HOOK = join(process.cwd(), "templates", "hooks", "design-os-read-trace.cjs");
  const TRACE = (dir: string): string => join(dir, ".design-os", "trace", "reads.jsonl");

  function call(dir: string, event: string, tool: string, toolInput: object): number {
    const payload = JSON.stringify({ session_id: "s1", hook_event_name: event, tool_name: tool, tool_input: toolInput });
    const r = spawnSync(process.execPath, [HOOK], { input: payload, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    expect(r.stdout.length).toBe(0); // a tracing hook is silent
    return r.status ?? -1;
  }

  function projectWithFiles(): string {
    const dir = mkdtempSync(join(tmpdir(), "trace-hook-"));
    mkdirSync(join(dir, "knowledge"), { recursive: true });
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "readme!"); // 7 bytes
    writeFileSync(join(dir, "knowledge", "index.json"), "{}"); // 2 bytes
    writeFileSync(join(dir, "design", ".env"), "TOKEN=hunter2");
    return dir;
  }

  it("records reads/skills/gates/mutations that summarize reads back — loaded without checklist", () => {
    const dir = projectWithFiles();
    for (const [event, tool, input] of [
      ["PreToolUse", "Read", { file_path: join(dir, "README.md") }],
      ["PreToolUse", "Read", { file_path: join(dir, "knowledge", "index.json") }],
      ["PreToolUse", "Skill", { skill: "es-designer" }],
      ["PostToolUse", "Edit", { file_path: join(dir, "a.css") }],
    ] as const) expect(call(dir, event, tool, input)).toBe(0);

    const r = JSON.parse(capture(["trace", "summarize", dir, "--json"]).out).data;
    expect(r).toMatchObject({
      bytesBeforeFirstMutate: 9, filesBeforeFirstMutate: ["README.md", "knowledge/index.json"],
      readmeOpened: true, indexOpened: true, esDesignerLoaded: true, esDesignerChecklistRan: false, gateRuns: 0,
      traceCoverage: "claude-only",
    });
  });

  it("checklist read then `ui gate` after a skill load → esDesignerChecklistRan", () => {
    const dir = projectWithFiles();
    const checklist = join(dir, "skills", "es-designer", "checklist.md");
    mkdirSync(join(dir, "skills", "es-designer"), { recursive: true });
    writeFileSync(checklist, "- [ ] run ui gate");
    call(dir, "PreToolUse", "Skill", { skill: "es:designer" });
    call(dir, "PreToolUse", "Read", { file_path: checklist });
    call(dir, "PreToolUse", "Bash", { command: "npx ui gate --json page.html" });

    const r = JSON.parse(capture(["trace", "summarize", dir, "--json"]).out).data;
    expect(r).toMatchObject({ esDesignerLoaded: true, esDesignerChecklistRan: true, gateRuns: 1 });
  });

  it("never records .env files, untracked paths, or command text; never fails on bad input", () => {
    const dir = projectWithFiles();
    call(dir, "PreToolUse", "Read", { file_path: join(dir, "design", ".env") });
    call(dir, "PreToolUse", "Read", { file_path: "/etc/hosts" });
    call(dir, "PreToolUse", "Bash", { command: "echo super-secret-prompt" });
    call(dir, "PostToolUse", "Bash", { command: "ls -la 2>&1 | head" }); // not a mutation
    expect(existsSync(TRACE(dir))).toBe(false);

    const r = spawnSync(process.execPath, [HOOK], { input: "not json", env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
    expect(r.status).toBe(0);

    call(dir, "PostToolUse", "Bash", { command: "echo x > out.txt" });
    const text = readFileSync(TRACE(dir), "utf8");
    expect(text).toContain('"kind":"mutate"');
    expect(text).not.toContain("echo x");
  });
});
