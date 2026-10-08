import { describe, expect, it, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  unlinkSync,
} from "node:fs";
import { run } from "../src/cli.js";
import { generateClaudeAdapter } from "../src/adapters/claude.js";
import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";
import { buildRoutingRule } from "../src/adapters/wrapper-shapes-shared.js";
import { WORKFLOW_VERBS, SKILL_NAMES, JOURNEY_NAMES } from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const KNOWLEDGE_ROOT = join(REPO_ROOT, "knowledge");

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

interface DoctorJson {
  data: { healthy: boolean; checks: { id: string; status: string; detail: string }[] };
}
const check = (j: DoctorJson, id: string) => j.data.checks.find((c) => c.id === id);

const tmpDirs: string[] = [];
function makeTmpDir(): string {
  const p = join(tmpdir(), `routing-bootstrap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(p, { recursive: true });
  tmpDirs.push(p);
  return p;
}

afterEach(() => {
  for (const d of tmpDirs) {
    if (existsSync(d)) {
      try {
        // Restore permissions in case a test made a directory read-only
        chmodSync(d, 0o777);
      } catch {
        // ignore
      }
      rmSync(d, { recursive: true, force: true });
    }
  }
  tmpDirs.length = 0;
});

describe("adapters routing bootstrap rule generation", () => {
  it("Claude adapter generates exactly 45 artifacts including .claude/rules/design-os-routing.md", () => {
    const cwd = "/tmp/test-claude-routing";
    const arts = generateClaudeAdapter({ cwd, templatesRoot: TEMPLATES_ROOT });
    expect(arts).toHaveLength(45);
    expect(arts).toHaveLength(WORKFLOW_VERBS.length + SKILL_NAMES.length + JOURNEY_NAMES.length + 1);

    const rule = arts.find((a) => a.absPath === join(cwd, ".claude", "rules", "design-os-routing.md"));
    expect(rule).toBeDefined();
    expect(rule!.mode).toBe("write");
    expect(rule!.content).toContain("trigger: always_on");
    expect(rule!.content).toContain("ease-design natural-language routing and workflow bootstrap");
  });

  it("Antigravity adapter generates exactly 45 artifacts including .agent/rules/design-os-routing.md", () => {
    const cwd = "/tmp/test-ag-routing";
    const arts = generateAntigravityAdapter({ cwd, templatesRoot: TEMPLATES_ROOT });
    expect(arts).toHaveLength(45);
    expect(arts).toHaveLength(WORKFLOW_VERBS.length + SKILL_NAMES.length + JOURNEY_NAMES.length + 1);

    const rule = arts.find((a) => a.absPath === join(cwd, ".agent", "rules", "design-os-routing.md"));
    expect(rule).toBeDefined();
    expect(rule!.mode).toBe("write");
    expect(rule!.content).toContain("trigger: always_on");
    expect(rule!.content).toContain("ease-design natural-language routing and workflow bootstrap");
  });

  it("common routing rule builder incorporates absolute knowledge pointers, template directories, and ui schema --json", () => {
    const rule = buildRoutingRule(TEMPLATES_ROOT, KNOWLEDGE_ROOT);
    const fwdTemplates = TEMPLATES_ROOT.replace(/\\/g, "/");
    const fwdKnowledge = KNOWLEDGE_ROOT.replace(/\\/g, "/");

    expect(rule).toContain("trigger: always_on");
    expect(rule).toContain(`- Workflows: \`${fwdTemplates}/workflows\``);
    expect(rule).toContain(`- Craft skills: \`${fwdTemplates}/skills\``);
    expect(rule).toContain(`- Journeys: \`${fwdTemplates}/journeys\``);
    expect(rule).toContain(`\`${fwdKnowledge}/need-routing.md\``);
    expect(rule).toContain(`\`${fwdKnowledge}/build-loop.md\``);
    expect(rule).toContain("// turbo");
    expect(rule).toContain("ui schema --json");
  });

  it("routing rule explicitly covers mixed visual context guidance and nonvisual exclusion", () => {
    const rule = buildRoutingRule(TEMPLATES_ROOT, KNOWLEDGE_ROOT);
    expect(rule).toContain("Skip design workflows only for pure nonvisual tasks");
    expect(rule).toContain("pure logic, data, configuration, test, or meta");
    expect(rule).toContain("split the task and activate the design workflow and skill for the visual surface");
    expect(rule).toContain("No System One classifier authority or confidence threshold in ui overrides explicit visual intent");
    expect(rule).toContain("load the live installed `es:designer` skill");
    expect(rule).toContain("follow the bundled workflow/craft skill and the build-loop");
  });
});

describe("init seam tests: routing bootstrap file handling", () => {
  it("conflict preserves preexisting user rule without --force", () => {
    const cwd = makeTmpDir();
    const ruleDir = join(cwd, ".claude", "rules");
    mkdirSync(ruleDir, { recursive: true });
    const userRulePath = join(ruleDir, "design-os-routing.md");
    const userOriginalContent = "# Preexisting user custom routing rule\nDo not overwrite me.\n";
    writeFileSync(userRulePath, userOriginalContent, "utf8");

    const { code, out } = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("MANIFEST_EXISTS");
    expect(json.error.message).toContain("design-os-routing.md");

    // Preexisting file MUST remain untouched
    const after = readFileSync(userRulePath, "utf8");
    expect(after).toBe(userOriginalContent);
  });

  it("force and regeneration does not touch other rules in the rules directory", () => {
    const cwd = makeTmpDir();
    const claudeRuleDir = join(cwd, ".claude", "rules");
    mkdirSync(claudeRuleDir, { recursive: true });
    const otherUserRulePath = join(claudeRuleDir, "my-team-standards.md");
    const otherUserRuleContent = "# Team Coding Standards\nAlways write tests first.\n";
    writeFileSync(otherUserRulePath, otherUserRuleContent, "utf8");

    // First init
    const r1 = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    expect(r1.code).toBe(0);

    const generatedRulePath = join(claudeRuleDir, "design-os-routing.md");
    expect(existsSync(generatedRulePath)).toBe(true);
    expect(readFileSync(otherUserRulePath, "utf8")).toBe(otherUserRuleContent);

    // Second init with --force
    const r2 = captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--force", "--json"]);
    expect(r2.code).toBe(0);

    // Other user rule must remain intact
    expect(readFileSync(otherUserRulePath, "utf8")).toBe(otherUserRuleContent);
  });

  it("force and regeneration preserves other rules for Antigravity as well", () => {
    const cwd = makeTmpDir();
    const agRuleDir = join(cwd, ".agent", "rules");
    mkdirSync(agRuleDir, { recursive: true });
    const otherRulePath = join(agRuleDir, "security-rules.md");
    const otherRuleContent = "---\ntrigger: always_on\n---\n# Security Check\n";
    writeFileSync(otherRulePath, otherRuleContent, "utf8");

    const r1 = captureRun(["init", "--runtime", "antigravity", "--cwd", cwd, "--json"]);
    expect(r1.code).toBe(0);

    const generatedRulePath = join(agRuleDir, "design-os-routing.md");
    expect(existsSync(generatedRulePath)).toBe(true);
    expect(readFileSync(otherRulePath, "utf8")).toBe(otherRuleContent);

    const r2 = captureRun(["init", "--runtime", "antigravity", "--cwd", cwd, "--force", "--json"]);
    expect(r2.code).toBe(0);
    expect(readFileSync(otherRulePath, "utf8")).toBe(otherRuleContent);
  });

  it("all 3 runtimes selection: writes expected routing rules per runtime", () => {
    const cwdClaude = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwdClaude, "--json"]);
    expect(existsSync(join(cwdClaude, ".claude", "rules", "design-os-routing.md"))).toBe(true);
    expect(existsSync(join(cwdClaude, ".agent", "rules", "design-os-routing.md"))).toBe(false);

    const cwdAg = makeTmpDir();
    captureRun(["init", "--runtime", "antigravity", "--cwd", cwdAg, "--json"]);
    expect(existsSync(join(cwdAg, ".agent", "rules", "design-os-routing.md"))).toBe(true);
    expect(existsSync(join(cwdAg, ".claude", "rules", "design-os-routing.md"))).toBe(false);

    const cwdCodex = makeTmpDir();
    captureRun(["init", "--runtime", "codex", "--cwd", cwdCodex, "--json"]);
    expect(existsSync(join(cwdCodex, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(cwdCodex, ".claude", "rules", "design-os-routing.md"))).toBe(false);
    expect(existsSync(join(cwdCodex, ".agent", "rules", "design-os-routing.md"))).toBe(false);

    const cwdAll = makeTmpDir();
    captureRun(["init", "--all", "--cwd", cwdAll, "--json"]);
    expect(existsSync(join(cwdAll, ".claude", "rules", "design-os-routing.md"))).toBe(true);
    expect(existsSync(join(cwdAll, ".agent", "rules", "design-os-routing.md"))).toBe(true);
    expect(existsSync(join(cwdAll, "AGENTS.md"))).toBe(true);
  });

  it("manifest records design-os-routing.md in adapters list", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd]);
    const manifest = JSON.parse(
      readFileSync(join(cwd, ".claude", "ease-design.json"), "utf8"),
    ) as { adapters: string[] };

    expect(manifest.adapters).toContain(".claude/rules/design-os-routing.md");
    expect(manifest.adapters).toHaveLength(45);
  });
});

describe("ui doctor: routing rule validation and compatibility", () => {
  it("freshly inited project passes adapter-wrappers check", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("pass");
  });

  it("correctness linter: absent trigger rejects with failure", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    // Remove trigger: always_on
    content = content.replace("trigger: always_on", "trigger: manual");
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("trigger: always_on");
  });

  it("correctness linter: invalid referenced path rejects with failure", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    // Replace knowledge root prefix with nonexistent directory so the referenced file path does not exist
    content = content.replace(
      /\/knowledge\/need-routing\.md`/,
      "/nonexistent-dir/knowledge/need-routing.md`",
    );
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("does not exist");
  });

  it("correctness linter: missing routing rule file rejects with failure", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    unlinkSync(rulePath);

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("design-os-routing.md is missing");
  });

  it("old manifest without bootstrap rule retains compatibility", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const manifestPath = join(cwd, ".claude", "ease-design.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { adapters: string[] };

    // Simulate an older manifest that only recorded the original 44 files
    manifest.adapters = manifest.adapters.filter((a) => !a.includes("design-os-routing.md"));
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    // Even if the routing rule file was deleted, doctor should not fail on the old manifest
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    if (existsSync(rulePath)) unlinkSync(rulePath);

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("pass");
  });

  it("arbitrary unknown wrapper is NOT exempt from validation", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const manifestPath = join(cwd, ".claude", "ease-design.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { adapters: string[] };

    // Inject an arbitrary unknown wrapper into adapters list
    manifest.adapters.push(".claude/commands/ui/bogus.md");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    // Write bogus file with valid frontmatter but no template reference
    writeFileSync(
      join(cwd, ".claude", "commands", "ui", "bogus.md"),
      "---\ndescription: arbitrary\n---\n# bogus\n",
      "utf8",
    );

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("does not reference its runtime-neutral template");
  });

  it("correctness linter (born-red): triggerduplicate rejects duplicate trigger in frontmatter", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    // Append duplicate trigger key
    content = content.replace(
      "trigger: always_on",
      "trigger: always_on\ntrigger: manual",
    );
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("duplicate key 'trigger'");
  });

  it("correctness linter (born-red): YAMLbroken rejects malformed frontmatter lines", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    content = content.replace(
      "trigger: always_on",
      "trigger: always_on\nmalformed_line_with_no_colon_delimiter",
    );
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("malformed YAML frontmatter");
  });

  it("correctness linter (born-red): scopepaths rejects paths scoping in frontmatter", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    content = content.replace(
      "trigger: always_on",
      "trigger: always_on\npaths: ['src/**']",
    );
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("paths scope in frontmatter would make rule conditional");
  });

  it("correctness linter (born-red): deletedneedrouting rejects when need-routing.md reference is missing", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    let content = readFileSync(rulePath, "utf8");
    // Strip need-routing.md reference
    content = content.replace(/`[^`]*need-routing\.md`/g, "");
    writeFileSync(rulePath, content, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("is missing required reference to need-routing.md");
  });

  it("correctness linter (born-red): onlyunrelatedpath rejects when required references are replaced with single unrelated path", () => {
    const cwd = makeTmpDir();
    captureRun(["init", "--runtime", "claude", "--cwd", cwd, "--json"]);
    const rulePath = join(cwd, ".claude", "rules", "design-os-routing.md");
    const validExistingTemplate = join(TEMPLATES_ROOT, "workflows", "generate.md").replace(/\\/g, "/");

    // Replace entire body with only a single unrelated template path
    const fakeContent = [
      "---",
      'description: "ease-design routing"',
      "trigger: always_on",
      "---",
      "",
      "# Only unrelated path",
      `Referencing: \`${validExistingTemplate}\``,
      "",
    ].join("\n");
    writeFileSync(rulePath, fakeContent, "utf8");

    const r = captureRun(["doctor", "--cwd", cwd, "--json"]);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as DoctorJson;
    expect(check(j, "adapter-wrappers")?.status).toBe("fail");
    expect(check(j, "adapter-wrappers")?.detail).toContain("is missing required reference to need-routing.md");
  });
});
