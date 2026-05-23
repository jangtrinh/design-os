import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { run } from "../src/cli.js";

const HERE = dirname(fileURLToPath(import.meta.url));
void HERE; // used only via fix() if needed

function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const p = join(tmpdir(), `init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(p, { recursive: true });
  tmpDirs.push(p);
  return p;
}

afterEach(() => {
  for (const d of tmpDirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("ui init --runtime claude", () => {
  it("writes .claude/ease-design.json and reports written:true", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { manifests: { runtime: string; path: string; written: boolean; replaced: boolean }[] } };
    expect(json.ok).toBe(true);
    expect(json.data.manifests).toHaveLength(1);
    expect(json.data.manifests[0]?.written).toBe(true);
    expect(json.data.manifests[0]?.replaced).toBe(false);
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(true);
  });

  it("manifest has correct schema: version:1, status:stub, runtime:claude, roadmapPointer non-empty", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as { version: number; status: string; runtime: string; roadmapPointer: string; generatedAt: string };
    expect(manifest.version).toBe(1);
    expect(manifest.status).toBe("stub");
    expect(manifest.runtime).toBe("claude");
    expect(manifest.roadmapPointer.length).toBeGreaterThan(0);
    // generatedAt must be a valid ISO-8601 string
    expect(() => new Date(manifest.generatedAt)).not.toThrow();
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt);
  });
});

describe("ui init --runtime antigravity", () => {
  it("writes .agent/ease-design.json", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "antigravity", "--cwd", cwd, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { manifests: { path: string }[] } };
    expect(json.data.manifests[0]?.path).toMatch(/\.agent[/\\]ease-design\.json$/);
    expect(existsSync(join(cwd, ".agent", "ease-design.json"))).toBe(true);
  });
});

describe("ui init --runtime codex", () => {
  it("writes AGENTS.ease-design.json at cwd root", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "codex", "--cwd", cwd, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { manifests: { path: string }[] } };
    expect(json.data.manifests[0]?.path).toMatch(/AGENTS\.ease-design\.json$/);
    expect(existsSync(join(cwd, "AGENTS.ease-design.json"))).toBe(true);
  });
});

describe("ui init --all", () => {
  it("writes all three manifests", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--all", "--cwd", cwd, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { manifests: { runtime: string }[] } };
    expect(json.ok).toBe(true);
    expect(json.data.manifests).toHaveLength(3);
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(true);
    expect(existsSync(join(cwd, ".agent", "ease-design.json"))).toBe(true);
    expect(existsSync(join(cwd, "AGENTS.ease-design.json"))).toBe(true);
  });
});

describe("ui init --force and MANIFEST_EXISTS", () => {
  it("second run without --force → exit 1, MANIFEST_EXISTS", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
  });

  it("second run with --force → exit 0, replaced:true", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--force", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { data: { manifests: { replaced: boolean }[] } };
    expect(json.data.manifests[0]?.replaced).toBe(true);
  });

  it("--all pre-flight: one runtime exists without --force → error names the conflict, writes nothing", () => {
    const cwd = makeTmpDir();
    // Pre-write the claude manifest only
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    // --all without --force must error before writing the others
    const { code, out } = captureRun(["init", "--all", "--cwd", cwd, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
    // Error message must name the conflicting path
    expect(json.error.message).toContain("ease-design.json");
    // The other two manifests must NOT have been written (all-or-nothing)
    expect(existsSync(join(cwd, ".agent", "ease-design.json"))).toBe(false);
    expect(existsSync(join(cwd, "AGENTS.ease-design.json"))).toBe(false);
  });
});

describe("ui init argument validation", () => {
  it("missing --runtime (and no --all) → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["init", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("--runtime and --all together → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["init", "--runtime", "claude", "--all", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("unknown runtime value → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["init", "--runtime", "emacs", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("--help exits 0 and mentions init", () => {
    const { code, out } = captureRun(["init", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("init");
  });
});
