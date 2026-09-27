import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { summarizeTrace } from "../src/core/trace-summarize.js";

const HOOK = join(process.cwd(), "templates", "hooks", "design-os-read-trace.cjs");
const FIXTURE = join(process.cwd(), "tests", "fixtures", "trace", "acceptance-baseline-reads.jsonl");
const CHECKLIST = ".claude/skills/es-designer/checklist.md";

type Rec = Record<string, unknown>;
const lines = (recs: Rec[]): string[] => recs.map((r) => JSON.stringify({ t: "2026-09-27T02:30:00Z", ...r }));

describe("replay of the real acceptance-baseline trace (a run, not a fixture)", () => {
  const real = readFileSync(FIXTURE, "utf8").split("\n");

  it("yields a positive byte count: setup Bash without a target no longer ends the window", () => {
    const s = summarizeTrace(real);
    expect(s.bytesBeforeFirstMutate).toBe(14387 + 5731); // craft-floor.md + probe-render.mjs
    expect(s.unclassifiedMutations).toBeGreaterThan(0);
    expect(s.firstMutation).toBeNull();
    expect(s.esDesignerLoaded).toBe(true);
    expect(s.gateRuns).toBe(5);
  });

  it("the recorded run holds no read of es-designer/checklist.md, so the flag is false for a stated reason", () => {
    expect(real.some((l) => l.includes("checklist"))).toBe(false);
    expect(summarizeTrace(real).esDesignerChecklistRan).toBe(false);
  });

  it("the same run WITH that read recorded before its gate reads true (constructed: the read is absent from the file)", () => {
    const withRead = [...real.slice(0, 16), ...lines([{ kind: "read", tool: "Read", path: CHECKLIST, bytes: 4000 }]), ...real.slice(16)];
    expect(summarizeTrace(withRead).esDesignerChecklistRan).toBe(true);
  });
});

describe("summarizeTrace — which mutate records end the window", () => {
  const read = { kind: "read", tool: "Read", path: "brand/soul.md", bytes: 50 };

  it("a targeted mutate ends it and is reported as firstMutation", () => {
    const s = summarizeTrace(lines([read, { kind: "mutate", tool: "Write", path: "src/a.css" }, { ...read, bytes: 999 }]));
    expect(s.bytesBeforeFirstMutate).toBe(50);
    expect(s.firstMutation).toEqual({ t: "2026-09-27T02:30:00Z", kind: "Write", path: "src/a.css" });
  });

  it("an untargeted Bash mutate is counted apart and does NOT end it (red if the old rule returns)", () => {
    const s = summarizeTrace(lines([{ kind: "mutate", tool: "Bash" }, read]));
    expect(s.bytesBeforeFirstMutate).toBe(50);
    expect(s).toMatchObject({ firstMutation: null, unclassifiedMutations: 1 });
  });
});

describe("summarizeTrace — checklist ran = checklist read then ANY gate event", () => {
  const load = { kind: "skill", name: "es-designer" };
  const checklist = { kind: "read", tool: "Read", path: CHECKLIST, bytes: 10 };

  it("a wrapper-script gate (record carries the matched command) satisfies it", () => {
    const s = summarizeTrace(lines([load, checklist, { kind: "gate", command: "node build.mjs" }]));
    expect(s.esDesignerChecklistRan).toBe(true);
  });

  it("a gate before the read does not (red control)", () => {
    expect(summarizeTrace(lines([load, { kind: "gate" }, checklist])).esDesignerChecklistRan).toBe(false);
  });
});

describe("design-os-read-trace hook — what counts as a mutation", () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-validity-"));
  const trace = join(dir, ".design-os", "trace", "reads.jsonl");
  for (const d of ["knowledge", "brand", "src", "acceptance", "node_modules/pkg"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "brand", "soul.md"), "soul!");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build: "node acceptance/build.mjs", lint: "eslint ." } }));
  writeFileSync(join(dir, "acceptance", "build.mjs"), "execFileSync('ui', ['gate', 'page.html'])");
  writeFileSync(join(dir, "acceptance", "plain.mjs"), "console.log(1)");

  function fire(event: string, tool: string, input: object, env: Record<string, string> = {}): Rec[] {
    rmSync(join(dir, ".design-os"), { recursive: true, force: true });
    const payload = JSON.stringify({ session_id: "s", hook_event_name: event, tool_name: tool, tool_input: input, cwd: dir });
    const r = spawnSync(process.execPath, [HOOK], { input: payload, env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env } });
    expect(r.status).toBe(0);
    return existsSync(trace) ? readFileSync(trace, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Rec) : [];
  }
  const bash = (command: string, env?: Record<string, string>): Rec[] => fire("PostToolUse", "Bash", { command }, env);

  it.each([
    ["mkdir -p of the trace dir", "mkdir -p .design-os/trace"],
    ["mkdir -p under node_modules", "mkdir -p node_modules/pkg/dist"],
    ["redirect into /dev/null", "npm test > /dev/null 2>&1"],
    ["redirect into $TMPDIR", "echo x > $TMPDIR/scratch.txt"],
    ["redirect into an absolute temp path", `echo x > ${tmpdir()}/elsewhere/out.txt`],
    ["redirect into another project", "echo x > /Users/someone/else/out.txt"],
    ["redirect into the trace file", "echo x >> .design-os/trace/reads.jsonl"],
    ["npm install", "npm install --no-audit"],
    ["git status", "git status --short"],
    ["a heredoc body that merely mentions a path", "cat <<'EOF'\necho x > src/inside-heredoc-text.css\nEOF"],
    ["tee into /dev/null", "ls | tee /dev/null"],
  ])("NOT a mutation: %s", (_label, cmd) => {
    expect(bash(cmd, { TMPDIR: join(tmpdir(), "scratch-root") })).toEqual([]);
  });

  it.each([
    ["redirect into the project", "echo x > src/a.css", "src/a.css"],
    ["append redirect", "echo x >> src/a.css", "src/a.css"],
    ["heredoc write (cat > file <<)", "cat > src/page.html <<'EOF'\n<h1>x</h1>\nEOF", "src/page.html"],
    ["tee file", "printf x | tee -a src/log.txt", "src/log.txt"],
    ["mv into the project", "mv /tmp/out.css src/out.css", "src/out.css"],
    ["cp destination", "cp brand/soul.md src/copy.md", "src/copy.md"],
    ["sed -i", "sed -i 's/a/b/' src/a.css", "src/a.css"],
    ["after a cd into the project subdir", "cd src && echo x > b.css", "src/b.css"],
    ["rm of a project file", "rm acceptance/plain.mjs", "acceptance/plain.mjs"],
  ])("IS a mutation, with its target: %s", (_label, cmd, target) => {
    expect(bash(cmd)).toMatchObject([{ kind: "mutate", tool: "Bash", path: target }]);
  });

  it("the recorded mutation never carries command text", () => {
    expect(JSON.stringify(bash("echo super-secret-prompt > src/a.css"))).not.toContain("super-secret");
  });

  it("Write/Edit outside the project or under .design-os/ are not mutations; inside they are, with a path", () => {
    expect(fire("PostToolUse", "Write", { file_path: join(tmpdir(), "elsewhere.txt") })).toEqual([]);
    expect(fire("PostToolUse", "Write", { file_path: join(dir, ".design-os", "note.json") })).toEqual([]);
    expect(fire("PostToolUse", "Edit", { file_path: join(dir, "src", "a.css") })).toMatchObject([{ kind: "mutate", tool: "Edit", path: "src/a.css" }]);
  });

  it("brand/ is traced by default; DESIGN_OS_TRACE_PREFIXES adds more; an untraced prefix stays silent", () => {
    const soul = { file_path: join(dir, "brand", "soul.md") };
    expect(fire("PreToolUse", "Read", soul)).toMatchObject([{ kind: "read", path: "brand/soul.md", bytes: 5 }]);
    const src = { file_path: join(dir, "acceptance", "plain.mjs") };
    expect(fire("PreToolUse", "Read", src)).toEqual([]);
    expect(fire("PreToolUse", "Read", src, { DESIGN_OS_TRACE_PREFIXES: "acceptance, other/" })).toMatchObject([{ path: "acceptance/plain.mjs" }]);
  });

  it("a `cat ~/…/es-designer/checklist.md` read is recorded (tilde is expanded)", () => {
    const home = mkdtempSync(join(tmpdir(), "trace-home-"));
    mkdirSync(join(home, ".claude", "skills", "es-designer"), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", "es-designer", "checklist.md"), "12345678");
    const got = fire("PreToolUse", "Bash", { command: "cat ~/.claude/skills/es-designer/checklist.md" }, { HOME: home });
    expect(got).toMatchObject([{ kind: "read", bytes: 8 }]);
  });

  it.each([
    ["direct ui gate", "npx ui gate page.html --json", "ui gate"],
    ["slop-detect", "node tools/slop-detect page.html", "slop-detect"],
    ["npm script that runs a gate through a script file", "npm run build", "npm run build"],
    ["script file that runs a gate", "node acceptance/build.mjs", "node acceptance/build.mjs"],
  ])("gate event with the matched command: %s", (_label, cmd, matched) => {
    const got = fire("PreToolUse", "Bash", { command: cmd });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ kind: "gate" });
    expect(String(got[0]?.["command"])).toContain(matched);
  });

  it("no gate event for a script or npm script that runs none (red control)", () => {
    expect(fire("PreToolUse", "Bash", { command: "node acceptance/plain.mjs" })).toEqual([]);
    expect(fire("PreToolUse", "Bash", { command: "npm run lint" })).toEqual([]);
  });

  it("stays fast: median per-call wall time is printed for the report", () => {
    const payload = JSON.stringify({
      hook_event_name: "PostToolUse", tool_name: "Bash", cwd: dir,
      tool_input: { command: "cat > src/page.html <<'EOF'\n" + "<p>x</p>\n".repeat(300) + "EOF\nmkdir -p .design-os/trace" },
    });
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = process.hrtime.bigint();
      spawnSync(process.execPath, [HOOK], { input: payload, env: { ...process.env, CLAUDE_PROJECT_DIR: dir } });
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    const bare: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = process.hrtime.bigint();
      spawnSync(process.execPath, ["-e", "0"]);
      bare.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    bare.sort((a, b) => a - b);
    console.log(`hook median ${times[7]?.toFixed(1)} ms; bare node median ${bare[7]?.toFixed(1)} ms`);
    expect((times[7] ?? 0) - (bare[7] ?? 0)).toBeLessThan(20); // the hook's own cost, node start-up excluded
  });
});
