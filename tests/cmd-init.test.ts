import { describe, expect, it, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, existsSync, rmSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { run } from "../src/cli.js";

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

  it("manifest has correct schema: version:1, status:ready, runtime:claude, roadmapPointer non-empty", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as { version: number; status: string; runtime: string; roadmapPointer: string; generatedAt: string; adapters: string[]; templateHashes: Record<string, string> };
    expect(manifest.version).toBe(1);
    expect(manifest.status).toBe("ready");
    expect(manifest.runtime).toBe("claude");
    expect(manifest.roadmapPointer.length).toBeGreaterThan(0);
    // generatedAt must be a valid ISO-8601 string
    expect(() => new Date(manifest.generatedAt)).not.toThrow();
    expect(new Date(manifest.generatedAt).toISOString()).toBe(manifest.generatedAt);
    // adapter tree fields
    expect(Array.isArray(manifest.adapters)).toBe(true);
    expect(manifest.adapters.length).toBeGreaterThan(0);
    expect(typeof manifest.templateHashes).toBe("object");
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

// ── Adapter tree integration tests ────────────────────────────────────────────

describe("ui init --runtime claude adapter tree", () => {
  it("JSON envelope data.adapters[0].paths has 44 entries", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      data: { adapters: { runtime: string; paths: string[] }[] };
    };
    expect(json.data.adapters).toHaveLength(1);
    expect(json.data.adapters[0]?.paths.length).toBe(44);
  });

  it("JSON envelope data.adapters[0].paths includes the generate slash-command path", () => {
    const cwd = makeTmpDir();
    const { out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const json = JSON.parse(out) as {
      data: { adapters: { runtime: string; paths: string[] }[] };
    };
    const paths = json.data.adapters[0]?.paths ?? [];
    expect(paths.some((p) => p.endsWith(".claude/commands/ui/generate.md") || p.includes("commands/ui/generate.md"))).toBe(true);
  });

  it("a fresh init makes the /ui:design verb discoverable (slash-command + on disk)", () => {
    const cwd = makeTmpDir();
    const { out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const json = JSON.parse(out) as {
      data: { adapters: { runtime: string; paths: string[] }[] };
    };
    const paths = json.data.adapters[0]?.paths ?? [];
    expect(paths.some((p) => p.includes("commands/ui/design.md"))).toBe(true);
    expect(existsSync(join(cwd, ".claude", "commands", "ui", "design.md"))).toBe(true);
  });

  it("a fresh init installs the provisional native workflow and craft skill", () => {
    const cwd = makeTmpDir();
    const { out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const json = JSON.parse(out) as { data: { adapters: { paths: string[] }[] } };
    const paths = json.data.adapters[0]?.paths ?? [];
    expect(paths.some((p) => p.includes("commands/ui/native-macos.md"))).toBe(true);
    expect(paths.some((p) => p.includes("design-os-native-macos-craft/SKILL.md"))).toBe(true);
    expect(paths.some((p) => p.includes("commands/ui/native-ios.md"))).toBe(true);
    expect(paths.some((p) => p.includes("design-os-native-ios-craft/SKILL.md"))).toBe(true);
    expect(paths.some((p) => p.includes("commands/ui/native-ipados.md"))).toBe(true);
    expect(paths.some((p) => p.includes("design-os-native-ipados-craft/SKILL.md"))).toBe(true);
  });

  it("on-disk manifest has status 'ready' with adapters and templateHashes", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as { status: string; adapters: string[]; templateHashes: Record<string, string> };
    expect(manifest.status).toBe("ready");
    expect(Array.isArray(manifest.adapters)).toBe(true);
    expect(manifest.adapters.length).toBeGreaterThan(0);
    expect(Object.keys(manifest.templateHashes).length).toBeGreaterThan(0);
  });

  it("adapter files exist on disk after init", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    expect(existsSync(join(cwd, ".claude", "commands", "ui", "generate.md"))).toBe(true);
    expect(existsSync(join(cwd, ".claude", "skills", "design-os-pick-persona", "SKILL.md"))).toBe(true);
  });

  it("--force rewrites adapter files byte-identically", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const originalBytes = readFileSync(join(cwd, ".claude", "commands", "ui", "generate.md"));
    // Corrupt the file
    writeFileSync(join(cwd, ".claude", "commands", "ui", "generate.md"), "corrupted", "utf8");
    const { code } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--force"]);
    expect(code).toBe(0);
    const restoredBytes = readFileSync(join(cwd, ".claude", "commands", "ui", "generate.md"));
    expect(restoredBytes.toString("utf8")).toBe(originalBytes.toString("utf8"));
  });
});

describe("ui init adapter pre-flight collision", () => {
  it("pre-existing adapter file without --force → exit 1, MANIFEST_EXISTS naming the adapter path", () => {
    const cwd = makeTmpDir();
    // Pre-create the generate adapter file
    mkdirSync(join(cwd, ".claude", "commands", "ui"), { recursive: true });
    writeFileSync(join(cwd, ".claude", "commands", "ui", "generate.md"), "pre-existing", "utf8");
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
    expect(json.error.message).toContain("generate.md");
  });
});

describe("ui init --runtime codex AGENTS.md integration", () => {
  it("writes AGENTS.md with sentinel block when file does not exist", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "codex", "--cwd", cwd]);
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
    const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    expect(content).toContain("<!-- BEGIN ease-design -->");
    expect(content).toContain("<!-- END ease-design -->");
  });

  it("pre-existing AGENTS.md with sentinel block and no --force → MANIFEST_EXISTS", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "codex", "--cwd", cwd]);
    const { code, out } = captureRun(["init", "--runtime", "codex", "--cwd", cwd, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
  });

  it("pre-existing AGENTS.md without sentinel block → appends; second run without --force errors", () => {
    const cwd = makeTmpDir();
    // Write AGENTS.md without the sentinel block
    writeFileSync(join(cwd, "AGENTS.md"), "# My Project\n\nUser content.\n", "utf8");
    const { code: code1 } = captureRun(["init", "--runtime", "codex", "--cwd", cwd]);
    expect(code1).toBe(0);
    const content = readFileSync(join(cwd, "AGENTS.md"), "utf8");
    expect(content).toContain("User content.");
    expect(content).toContain("<!-- BEGIN ease-design -->");
    // Second run: block now exists → MANIFEST_EXISTS without --force
    const { code: code2, out } = captureRun(["init", "--runtime", "codex", "--cwd", cwd, "--json"]);
    expect(code2).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
  });
});

describe("ui init --all cross-runtime rollback", () => {
  it("failure on runtime N rolls back adapter files written for runtimes 0..N-1", () => {
    const cwd = makeTmpDir();

    // Block antigravity workflows dir by placing a plain file where mkdirSync
    // would need to create a directory — this causes adapter write to fail for
    // the antigravity runtime (the second in the RUNTIMES order after claude).
    // We create the parent dir first, then drop a regular file named "workflows"
    // so mkdirSync(.agent/workflows/) throws ENOTDIR.
    mkdirSync(join(cwd, ".agent"), { recursive: true });
    writeFileSync(join(cwd, ".agent", "workflows"), "blocker", "utf8");

    const { code, out } = captureRun(["init", "--all", "--cwd", cwd, "--json"]);

    // Must fail
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("WRITE_ERROR");

    // Claude adapter files that were written for the first runtime must be
    // rolled back — none of the .claude/commands/ui/ files should remain.
    expect(existsSync(join(cwd, ".claude", "commands", "ui", "generate.md"))).toBe(false);
    // Claude manifest must also be rolled back.
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(false);
  });
});

// ── Next-step hint (brownfield onboarding) ────────────────────────────────────

describe("ui init next-step hint", () => {
  it("text mode hints /ui:learn when the target project already has UI", () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, "index.html"), "<!doctype html><html><body>x</body></html>", "utf8");
    const { code, err } = captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    expect(code).toBe(0);
    expect(err).toContain("/ui:learn");
  });

  it("text mode hints /ui:generate for an empty (greenfield) project", () => {
    const cwd = makeTmpDir();
    const { code, err } = captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    expect(code).toBe(0);
    expect(err).toContain("/ui:generate");
    expect(err).not.toContain("/ui:learn");
  });

  it("JSON mode carries nextStep 'learn' for a brownfield project", () => {
    const cwd = makeTmpDir();
    writeFileSync(join(cwd, "index.html"), "<!doctype html><html><body>x</body></html>", "utf8");
    const { out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const json = JSON.parse(out) as { data: { nextStep?: string } };
    expect(json.data.nextStep).toBe("learn");
  });

  it("JSON mode carries nextStep 'generate' for a greenfield project", () => {
    const cwd = makeTmpDir();
    const { out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const json = JSON.parse(out) as { data: { nextStep?: string } };
    expect(json.data.nextStep).toBe("generate");
  });
});

// ── Model-adapter wrapper (spec 013 P1) ───────────────────────────────────────

interface ManifestWithModelAdapter {
  modelAdapter?: { runtime: string; wrapper: string; mode: string; verifiedAt: string };
  adapters?: string[];
}

describe("ui init writes the model-adapter wrapper (spec 013 P1)", () => {
  it("claude: .claude/design-os-model.sh exists, executable, shebang; manifest.modelAdapter mode 'stdin'", () => {
    const cwd = makeTmpDir();
    const { code } = captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    expect(code).toBe(0);

    const wrapperPath = join(cwd, ".claude", "design-os-model.sh");
    expect(existsSync(wrapperPath)).toBe(true);
    const stat = statSync(wrapperPath);
    expect(stat.mode & 0o111).not.toBe(0);
    const content = readFileSync(wrapperPath, "utf8");
    expect(content.startsWith("#!/usr/bin/env sh")).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;
    expect(manifest.modelAdapter?.wrapper).toBe(".claude/design-os-model.sh");
    expect(manifest.modelAdapter?.mode).toBe("stdin");
    expect(manifest.modelAdapter?.runtime).toBe("claude");
    // Not part of the adapters[] contract (adapter-wrapper-lint expects only
    // workflow/skill/AGENTS.md shapes — see adapters/index.ts's doc comment).
    expect(manifest.adapters?.some((p) => p.includes("design-os-model.sh"))).toBe(false);
  });

  it("codex: design-os-model.sh exists at cwd root, executable, shebang; manifest.modelAdapter mode 'stdin'", () => {
    const cwd = makeTmpDir();
    const { code } = captureRun(["init", "--runtime", "codex", "--cwd", cwd]);
    expect(code).toBe(0);

    const wrapperPath = join(cwd, "design-os-model.sh");
    expect(existsSync(wrapperPath)).toBe(true);
    const stat = statSync(wrapperPath);
    expect(stat.mode & 0o111).not.toBe(0);
    const content = readFileSync(wrapperPath, "utf8");
    expect(content.startsWith("#!/usr/bin/env sh")).toBe(true);
    expect(content).toContain("exec codex exec");

    const manifest = JSON.parse(
      readFileSync(join(cwd, "AGENTS.ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;
    expect(manifest.modelAdapter?.wrapper).toBe("design-os-model.sh");
    expect(manifest.modelAdapter?.mode).toBe("stdin");
  });

  it("antigravity: .agent/design-os-model.sh exists, executable, shebang, stdin→arg normalization; manifest.modelAdapter mode 'arg'", () => {
    const cwd = makeTmpDir();
    const { code } = captureRun(["init", "--runtime", "antigravity", "--cwd", cwd]);
    expect(code).toBe(0);

    const wrapperPath = join(cwd, ".agent", "design-os-model.sh");
    expect(existsSync(wrapperPath)).toBe(true);
    const stat = statSync(wrapperPath);
    expect(stat.mode & 0o111).not.toBe(0);
    const content = readFileSync(wrapperPath, "utf8");
    expect(content.startsWith("#!/usr/bin/env sh")).toBe(true);
    expect(content).toContain('prompt="$(cat)"');
    expect(content).toContain('agy --dangerously-skip-permissions -p "$prompt"');

    const manifest = JSON.parse(
      readFileSync(join(cwd, ".agent", "ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;
    expect(manifest.modelAdapter?.wrapper).toBe(".agent/design-os-model.sh");
    expect(manifest.modelAdapter?.mode).toBe("arg");
  });

  it("--all writes all three wrappers + records each manifest's modelAdapter", () => {
    const cwd = makeTmpDir();
    const { code } = captureRun(["init", "--all", "--cwd", cwd]);
    expect(code).toBe(0);

    expect(existsSync(join(cwd, ".claude", "design-os-model.sh"))).toBe(true);
    expect(existsSync(join(cwd, ".agent", "design-os-model.sh"))).toBe(true);
    expect(existsSync(join(cwd, "design-os-model.sh"))).toBe(true);

    const claudeManifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;
    const agManifest = JSON.parse(
      readFileSync(join(cwd, ".agent", "ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;
    const codexManifest = JSON.parse(
      readFileSync(join(cwd, "AGENTS.ease-design.json"), "utf8"),
    ) as ManifestWithModelAdapter;

    expect(claudeManifest.modelAdapter?.mode).toBe("stdin");
    expect(agManifest.modelAdapter?.mode).toBe("arg");
    expect(codexManifest.modelAdapter?.mode).toBe("stdin");
  });
});

describe("ui init --with-agents (opt-in roster at init time)", () => {
  it("without a project DS → DS_NOT_FOUND before any file is written", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents", "--json"]);
    expect(code).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("DS_NOT_FOUND");
    // Pre-flight: the failed combination must not leave a half-installed adapter tree.
    expect(existsSync(join(cwd, ".claude"))).toBe(false);
  });

  it("with a non-claude runtime → BAD_ARG (agents are Claude Code subagents)", () => {
    const cwd = makeTmpDir();
    const { code, out } = captureRun(["init", "--runtime", "codex", "--cwd", cwd, "--with-agents", "--json"]);
    expect(code).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("with a project DS → adapters AND stamped agent files in one run", () => {
    const cwd = makeTmpDir();
    const personaData = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;
    expect(captureRun(["ds", "init", "proj-x", "--persona", "liquid-glass", "--intent", "with-agents test", "--dir", cwd, "--persona-data", personaData]).code).toBe(0);
    const { code } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents"]);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(true);
    const agentsDir = join(cwd, ".claude", "agents");
    expect(existsSync(agentsDir)).toBe(true);
    const files = readFileSync(join(agentsDir, readdirSync(agentsDir).find((f) => f.startsWith("designer-")) ?? ""), "utf8");
    expect(files).toContain("design-os agents · roster-role: designer");
  });
});

describe("ui init --with-agents pre-flight completeness (stage-4 B1/H2)", () => {
  const personaData = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;
  const scaffoldDs = (cwd: string): void => {
    expect(captureRun(["ds", "init", "proj-y", "--persona", "liquid-glass", "--intent", "preflight test", "--dir", cwd, "--persona-data", personaData]).code).toBe(0);
  };

  it("malformed design/ds.manifest.json → BAD_MANIFEST before any write", () => {
    const cwd = makeTmpDir();
    mkdirSync(join(cwd, "design"), { recursive: true });
    writeFileSync(join(cwd, "design", "ds.manifest.json"), "{ this is not json");
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents", "--json"]);
    expect(code).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("BAD_MANIFEST");
    expect(existsSync(join(cwd, ".claude"))).toBe(false);
  });

  it("existing agent files without --force → EXISTS before the adapter tree is written", () => {
    const cwd = makeTmpDir();
    scaffoldDs(cwd);
    expect(captureRun(["agents", "init", "--dir", cwd]).code).toBe(0);
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents", "--json"]);
    expect(code).toBe(1);
    expect((JSON.parse(out) as { error: { code: string } }).error.code).toBe("EXISTS");
    // Pre-flight, not post-write: the manifest must NOT have landed.
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(false);
  });

  it("--all --with-agents with a DS → three manifests AND stamped agents, exit 0", () => {
    const cwd = makeTmpDir();
    scaffoldDs(cwd);
    const { code } = captureRun(["init", "--all", "--cwd", cwd, "--with-agents"]);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, ".claude", "ease-design.json"))).toBe(true);
    expect(existsSync(join(cwd, ".agent", "ease-design.json"))).toBe(true);
    expect(existsSync(join(cwd, "AGENTS.ease-design.json"))).toBe(true);
    expect(readdirSync(join(cwd, ".claude", "agents")).length).toBe(3);
  });

  it("--with-agents --force on a populated project → exit 0 (force reaches the agents subcall)", () => {
    const cwd = makeTmpDir();
    scaffoldDs(cwd);
    expect(captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents"]).code).toBe(0);
    expect(captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents", "--force"]).code).toBe(0);
  });

  it("JSON mode carries data.agents with role/name/path/written", () => {
    const cwd = makeTmpDir();
    scaffoldDs(cwd);
    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--with-agents", "--json"]);
    expect(code).toBe(0);
    const agents = (JSON.parse(out) as { data: { agents: { role: string; name: string; path: string; written: boolean }[] } }).data.agents;
    expect(agents).toHaveLength(3);
    for (const a of agents) {
      expect(a.role.length).toBeGreaterThan(0);
      expect(a.path.endsWith(`${a.name}.md`)).toBe(true);
      expect(a.written).toBe(true);
    }
  });
});
