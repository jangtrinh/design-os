/**
 * Characterisation of `readTemplateDescription`: the values recorded here were
 * captured from the frontmatter-parsing implementation BEFORE the descriptions
 * moved to schemas/template-descriptions.json. Every registered template must
 * keep returning exactly the recorded value.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WORKFLOW_VERBS, SKILL_NAMES, JOURNEY_NAMES, resolveTemplatePath, readTemplateDescription,
} from "../src/adapters/templates.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const golden = JSON.parse(
  readFileSync(join(REPO_ROOT, "tests/fixtures/template-descriptions/golden.json"), "utf8"),
) as Record<string, string | null>;

const registered: Array<[string, readonly string[]]> = [
  ["workflow", WORKFLOW_VERBS], ["skill", SKILL_NAMES], ["journey", JOURNEY_NAMES],
];

describe("readTemplateDescription — every template in the repo", () => {
  it("covers exactly the recorded set (43 registered templates)", () => {
    const seen: string[] = [];
    for (const [kind, names] of registered) {
      for (const name of names) if (resolveTemplatePath(TEMPLATES_ROOT, kind as "workflow", name) !== null) seen.push(`${kind}/${name}`);
    }
    expect(seen.sort()).toEqual(Object.keys(golden).sort());
  });

  it.each(Object.entries(golden))("%s returns its recorded description", (key, expected) => {
    const [kind, name] = key.split("/") as ["workflow" | "skill" | "journey", string];
    const p = resolveTemplatePath(TEMPLATES_ROOT, kind, name);
    expect(readTemplateDescription(p as string)).toBe(expected);
  });

  it("returns null for a missing file (no throw)", () => {
    expect(readTemplateDescription("/nonexistent/nope.md")).toBeNull();
  });
});
