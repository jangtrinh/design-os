import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import {
  buildClaudeCommand,
  buildAntigravityWorkflow,
  buildCodexBlock,
} from "../src/adapters/wrapper-shapes.js";
import { buildDesignEntryGlue } from "../src/adapters/wrapper-shapes-shared.js";
import { generateClaudeAdapter } from "../src/adapters/claude.js";
import { generateAntigravityAdapter } from "../src/adapters/antigravity.js";
import { generateCodexAdapter } from "../src/adapters/codex.js";
import { VERB_SKILL_REFS } from "../src/adapters/skill-refs.js";
import { WORKFLOW_VERBS } from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const FAKE_TPL = join(TEMPLATES_ROOT, "workflows", "generate.md");
const FAKE_CWD = "/tmp/ease-design-test-entry";

describe("adapters design entry and skill routing", () => {
  const KNOWLEDGE_ROOT = join(REPO_ROOT, "knowledge");
  const KNOWLEDGE_SPACES = "/tmp/path with spaces/ease design/knowledge";

  describe("shared design entry glue", () => {
    it("references need-routing.md and authoritative selection", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toContain("need-routing.md");
      expect(glue).toMatch(/authoritative/i);
    });

    it("specifies backend exclusion for pure logic/data/config/test/meta", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toMatch(/skip/i);
      expect(glue).toContain("pure logic");
      expect(glue).toContain("no rendered");
    });

    it("splits mixed backend+visual tasks and preserves design routing for the visual part", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toMatch(/mixed tasks/i);
      expect(glue).toContain("split the task");
      expect(glue).toContain("activate the design workflow");
      expect(glue).toContain("No System One classifier authority or confidence threshold");
    });

    it("skips only pure nonvisual tasks, not mixed intent", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toContain("Skip design workflows only for pure nonvisual tasks");
    });

    it("instructs loading live installed es:designer skill for rendered UI work", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toContain("es:designer");
      expect(glue).toContain("es-designer");
      expect(glue).toContain("delegated");
    });

    it("respects project context and specialist platform rules over generic UI defaults", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toContain("precedence");
      expect(glue).toContain("native");
      expect(glue).toContain("Figma");
    });

    it("falls back to bundled workflow and build-loop when es:designer is absent", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_ROOT);
      expect(glue).toContain("build-loop.md");
      expect(glue).not.toMatch(/npm install|apt-get|brew install/);
    });

    it("properly formats knowledge paths with spaces in backticks", () => {
      const glue = buildDesignEntryGlue(KNOWLEDGE_SPACES);
      expect(glue).toContain("`/tmp/path with spaces/ease design/knowledge/need-routing.md`");
      expect(glue).toContain("`/tmp/path with spaces/ease design/knowledge/build-loop.md`");
    });
  });

  describe("Claude command wrappers", () => {
    it("composes shared design entry glue into non-init command wrappers", () => {
      const out = buildClaudeCommand("generate", FAKE_TPL, ["pick-persona"], KNOWLEDGE_ROOT);
      expect(out).toContain("need-routing.md");
      expect(out).toContain("es:designer");
      expect(out).toContain("build-loop.md");
    });

    it("does not include design entry glue in synthetic init command", () => {
      const out = buildClaudeCommand("init", null, [], KNOWLEDGE_ROOT);
      expect(out).toContain("ui init --runtime claude");
      expect(out).not.toContain("need-routing.md");
    });
  });

  describe("Antigravity workflow wrappers", () => {
    it("composes shared design entry glue into non-init workflow wrappers", () => {
      const out = buildAntigravityWorkflow("generate", FAKE_TPL, KNOWLEDGE_ROOT);
      expect(out).toContain("need-routing.md");
      expect(out).toContain("es:designer");
      expect(out).toContain("build-loop.md");
    });

    it("includes conditional skill references from VERB_SKILL_REFS", () => {
      const out = buildAntigravityWorkflow("generate", FAKE_TPL, KNOWLEDGE_ROOT);
      const expectedSkills = VERB_SKILL_REFS.generate ?? [];
      expect(expectedSkills.length).toBeGreaterThan(0);
      for (const skill of expectedSkills) {
        expect(out).toContain(`design-os-${skill}`);
      }
    });

    it("does not include skill references when verb has none", () => {
      const whyTpl = join(TEMPLATES_ROOT, "workflows", "why.md");
      const out = buildAntigravityWorkflow("why", whyTpl, KNOWLEDGE_ROOT);
      expect(out).not.toContain("design-os-");
    });

    it("uses only real schema entry command ui schema --json and no invented ui <workflow> commands", () => {
      const nonNativeVerbs = WORKFLOW_VERBS.filter(
        (v) => !["init", "native-macos", "native-ios", "native-ipados"].includes(v),
      );

      for (const verb of nonNativeVerbs) {
        const tpl = join(TEMPLATES_ROOT, "workflows", `${verb}.md`);
        const out = buildAntigravityWorkflow(verb, tpl, KNOWLEDGE_ROOT);
        expect(out).toContain("// turbo");
        expect(out).toContain("ui schema --json");
        expect(out).not.toContain(`ui ${verb} "$ARGS"`);
        expect(out).not.toContain(`ui ${verb === "from-ref" ? "from-ref" : verb} "$ARGS"`);
      }
    });

    it("retains typed knowledge activation for native workflows", () => {
      for (const nativeVerb of ["native-macos", "native-ios", "native-ipados"] as const) {
        const tpl = join(TEMPLATES_ROOT, "workflows", `${nativeVerb}.md`);
        const out = buildAntigravityWorkflow(nativeVerb, tpl, KNOWLEDGE_ROOT);
        expect(out).toContain("// turbo");
        expect(out).toContain("ui knowledge activate capability-activation-request.json --json");
        expect(out).not.toContain(`ui ${nativeVerb}`);
      }
    });
  });

  describe("Codex block", () => {
    it("composes shared design entry glue into Codex block", () => {
      const out = buildCodexBlock(TEMPLATES_ROOT, {}, KNOWLEDGE_ROOT);
      expect(out).toContain("need-routing.md");
      expect(out).toContain("es:designer");
      expect(out).toContain("build-loop.md");
    });

    it("instructs reading bundled craft Markdown under templatesRoot because Skill tool may be absent", () => {
      const out = buildCodexBlock(TEMPLATES_ROOT, {}, KNOWLEDGE_ROOT);
      const fwdTemplates = TEMPLATES_ROOT.replace(/\\/g, "/");
      expect(out).toContain(`${fwdTemplates}/skills/`);
      expect(out).toMatch(/Skill tool/i);
    });
  });

  describe("adapter generation smoke checks", () => {
    it("produces deterministic and expected artifact counts with no extra files", () => {
      const claude = generateClaudeAdapter({ cwd: FAKE_CWD, templatesRoot: TEMPLATES_ROOT });
      const ag = generateAntigravityAdapter({ cwd: FAKE_CWD, templatesRoot: TEMPLATES_ROOT });
      const codex = generateCodexAdapter({ cwd: FAKE_CWD, templatesRoot: TEMPLATES_ROOT });

      expect(claude).toHaveLength(45);
      expect(ag).toHaveLength(45);
      expect(codex).toHaveLength(1);
    });
  });
});
