/**
 * Workflow doctrine checks — the Art II pairing for spec 009 D3.
 *
 * `states` on a ComponentRecord is a dead field: 0/537 populated in
 * platform-design-system, 0/27 in the `ds init` kit. The only place it was ever
 * mandated was workflow prose (`extract.md`, `learn.md`) telling the host model to
 * populate `--states` as a first-class record field. This test is the check that
 * fails if that doctrine regresses — a standard needs an emitter AND a linter
 * (constitution Art II); `registry.ts`/`registry-store.ts` are the emitter side
 * (`statesToVariants`), this is the linter side for the prose that could
 * re-introduce the mandate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOWS_DIR = join(REPO_ROOT, "templates", "workflows");

/**
 * A workflow "mandates" the dead field when it tells the host model to write a
 * bare `states:` key onto a component record (the pre-D3 doctrine), as opposed
 * to documenting that `--states` folds into `variants` as `State=X` (the
 * corrected doctrine, which mentions "states" freely — this check only rejects
 * the specific dead-field framing, not the word).
 */
const DEAD_FIELD_MANDATE = /\bstates\s*:\s*<|record'?s?\s+`?states`?\s+field\s+(?:is|must be)\s+populated|write\s+(?:a\s+)?`?states`?\s+field/i;

describe("workflow doctrine — no workflow mandates the dead `states` field (spec 009 D3)", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".md"));

  it("scans every templates/workflows/*.md file (sanity: extract.md and learn.md are present)", () => {
    expect(files).toContain("extract.md");
    expect(files).toContain("learn.md");
  });

  for (const file of files) {
    it(`${file} does not mandate a bare 'states:' record field`, () => {
      const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      expect(DEAD_FIELD_MANDATE.test(content)).toBe(false);
    });
  }

  it("extract.md documents that --states folds into variants as State=X, not the states field", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "extract.md"), "utf8");
    expect(content).toMatch(/State=<PascalCase>/);
    expect(content).toMatch(/states.*field.*(?:unset|never)|(?:unset|never).*states.*field/is);
  });

  // Step 6 of extract and step 4 of learn seal the design system, so every register command the
  // workflows print runs against a sealed store: it must carry a source or an explicit approval.
  describe("a register command in a code block states where the component comes from", () => {
    const REGISTER = /^\s*(?:\$\s*)?ui registry register\b/;
    const fencedCommands = (content: string): string[] => {
      const commands: string[] = [];
      for (const block of content.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
        const lines = block[1]!.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (!REGISTER.test(lines[i]!)) continue;
          let command = lines[i]!;
          while (command.trimEnd().endsWith("\\") && i + 1 < lines.length) command += "\n" + lines[++i]!;
          commands.push(command);
        }
      }
      return commands;
    };

    it("sees the register command of extract.md (sanity: the scan finds something)", () => {
      expect(fencedCommands(readFileSync(join(WORKFLOWS_DIR, "extract.md"), "utf8")).length).toBeGreaterThan(0);
    });

    it("the scan itself fails a register line with neither flag", () => {
      const bad = fencedCommands("```bash\nui registry register A/B \\\n    --category x \\\n    --markup m.html\n```\n");
      expect(bad).toHaveLength(1);
      expect(/--source-ref|--synthetic-approved/.test(bad[0]!)).toBe(false);
    });

    for (const file of files) {
      it(`${file}: every fenced register command has --source-ref or --synthetic-approved`, () => {
        for (const command of fencedCommands(readFileSync(join(WORKFLOWS_DIR, file), "utf8"))) {
          expect(command, command).toMatch(/--source-ref|--synthetic-approved/);
        }
      });
    }

    it("extract.md says what to do with HTML that lives outside the project root", () => {
      const content = readFileSync(join(WORKFLOWS_DIR, "extract.md"), "utf8");
      expect(content).toMatch(/outside the project\s+root/);
      expect(content).toMatch(/copy the\s+file into the project and reference the copy/);
      expect(content).toMatch(/naming the original location/);
    });

    it("extract.md and learn.md say what REGISTRY_MARKUP_DRIFT means and not to bypass it", () => {
      for (const file of ["extract.md", "learn.md"]) {
        const content = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
        expect(content, file).toContain("REGISTRY_MARKUP_DRIFT");
        expect(content, file).toMatch(/--source-ref/);
        expect(content, file).toMatch(/--synthetic-approved/);
      }
    });
  });

  it("learn.md §3b documents the same correction", () => {
    const content = readFileSync(join(WORKFLOWS_DIR, "learn.md"), "utf8");
    expect(content).toMatch(/`states`\s+field on a registry record is dead/);
  });
});
