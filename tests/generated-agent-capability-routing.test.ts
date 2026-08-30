/**
 * Capability-routing contract for generated agents. This stays separate from
 * the generic emitter and CLI command tests so the native routing concern has
 * one focused, independently readable home.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { ROSTER, renderAgent } from "../src/core/agents-gen.js";
import { run } from "../src/cli.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KNOWLEDGE_ROOT = join(REPO_ROOT, "knowledge").replaceAll("\\", "/");
const PERSONA_DATA = fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url));
const savedHome = process.env["EASE_DESIGN_HOME"];
const tempDirs: string[] = [];
let home: string;

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function capture(args: string[]): { exitCode: number; stdout: string } {
  let stdout = "";
  const originalWrite = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { stdout += String(chunk); return true; };
  try {
    return { exitCode: run(args), stdout };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function initDesignSystem(dir: string): void {
  const result = capture([
    "ds", "init", "fixture-project",
    "--persona", "liquid-glass",
    "--intent", "generated agent capability routing",
    "--dir", dir,
    "--persona-data", PERSONA_DATA,
    "--bare",
  ]);
  expect(result.exitCode).toBe(0);
}

function renderRealTemplate(role: (typeof ROSTER)[number]): string {
  const template = readFileSync(join(REPO_ROOT, "templates", "agents", `${role}.md`), "utf8");
  return renderAgent(template, {
    name: `${role}-fixture-project`,
    project: "fixture-project",
    studio: null,
    knowledgeRoot: KNOWLEDGE_ROOT,
  });
}

function expectReceiptBoundKnowledge(text: string): void {
  expect(text).toContain(`\`${KNOWLEDGE_ROOT}\``);
  expect(text).toContain("knowledge/need-routing.md");
  expect(text).toMatch(/(?:activation|receipt)[^.\n]*\broute\b/i);
  expect(text).toMatch(/(?:only[^.\n]*\bselectedKnowledge\b|\bselectedKnowledge\b[^.\n]*only)/i);
}

beforeEach(() => {
  home = makeTempDir("ease-generated-agent-home-");
  process.env["EASE_DESIGN_HOME"] = home;
});

afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
  for (const dir of tempDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("generated agent capability routing", () => {
  it("renders designer and curator from the real templates with receipt-bound knowledge", () => {
    const designer = renderRealTemplate("designer");
    const curator = renderRealTemplate("curator");

    expectReceiptBoundKnowledge(designer);
    expectReceiptBoundKnowledge(curator);
    expect(designer).toMatch(/ui knowledge activate/i);
    expect(designer).toMatch(/route:\s*"generate"/i);
    expect(curator).toMatch(/(?:require|reuse)[^.\n]*receipt/i);
    expect(curator).toMatch(/report-only/i);
    expect(curator).toMatch(/never execute it, generate,\s*or edit the artifact/i);
    expect(curator).toMatch(/owner-direct acceptance[^.\n]*rendered states[^.\n]*independent/i);
    expect(curator).toMatch(/accessibility[^.\n]*device[^.\n]*qualification/i);
  });

  it("keeps the real figma-hand template free of native craft preload", () => {
    const figmaHand = renderRealTemplate("figma-hand");
    expect(figmaHand).not.toMatch(/(?:apple-swiftui|native-ios|native-ipados|native-macos)-craft/i);
  });

  it("preserves the receipt contract after a fresh ui agents init", () => {
    const project = makeTempDir("ease-generated-agent-project-");
    initDesignSystem(project);

    const result = capture(["agents", "init", "--dir", project, "--json"]);
    expect(result.exitCode).toBe(0);

    const agentsDir = join(project, ".claude", "agents");
    const designer = readFileSync(join(agentsDir, "designer-fixture-project.md"), "utf8");
    const curator = readFileSync(join(agentsDir, "curator-fixture-project.md"), "utf8");
    const figmaHand = readFileSync(join(agentsDir, "figma-fixture-project.md"), "utf8");

    expectReceiptBoundKnowledge(designer);
    expectReceiptBoundKnowledge(curator);
    expect(designer).toMatch(/ui knowledge activate/i);
    expect(designer).toMatch(/route:\s*"generate"/i);
    expect(curator).toMatch(/(?:require|reuse)[^.\n]*receipt/i);
    expect(curator).toMatch(/report-only/i);
    expect(figmaHand).not.toMatch(/(?:apple-swiftui|native-ios|native-ipados|native-macos)-craft/i);
  });
});
