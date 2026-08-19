/**
 * The floor standard's own linter: every workflow that emits HTML either runs
 * the composed judge (`ui gate`) or carries a DECLARED exemption marker with a
 * reason. Without this test, workflow #20 next quarter quietly recreates the
 * 3-of-4 hole this gate was built to end; with it, the hole is a red test.
 * A new workflow file must be added to exactly one list below — the failure
 * message says so.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL("..", import.meta.url)), "templates", "workflows");

/** Workflows that emit HTML artifacts of OURS — each must run `ui gate`. */
const GATED = ["chart", "critique", "diagram", "figma", "from-ref", "generate", "iterate", "redesign", "refine", "slides"];
/** Workflows exempt for a declared reason — each must carry a gate-exempt marker. */
const EXEMPT = ["design", "extract", "from-url", "to-figma"];
/** Workflows that emit no HTML at all. */
const NON_EMITTING = ["audit", "evidence", "figma-comments", "learn", "why"];

describe("workflow gate coverage", () => {
  it("every workflow file is classified (new files must join exactly one list)", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
    const all = [...GATED, ...EXEMPT, ...NON_EMITTING].sort();
    expect(files.sort(), "add the new workflow to GATED, EXEMPT (with a gate-exempt marker), or NON_EMITTING in this test").toEqual(all);
  });

  it("every gated workflow runs the composed judge", () => {
    for (const name of GATED) {
      const body = readFileSync(join(DIR, `${name}.md`), "utf8");
      expect(body, `${name}.md must call \`ui gate\` (or become a declared exemption)`).toMatch(/\bui gate\b/);
    }
  });

  it("family-specific gates survive the composed-judge swap (superset stays superset)", () => {
    // ui gate covers the four generic families; these project-scoped or
    // grammar-specific gates must ALSO stay — deleting one is the silent
    // weakening the composed judge cannot see.
    const REQUIRED: Record<string, string[]> = {
      generate: ["ui ds-usage-lint", "ui ds a11y"],
      chart: ["ui chart lint", "ui ds-usage-lint"],
      diagram: ["ui diagram lint", "ui ds-usage-lint", "ui flow lint"],
    };
    for (const [name, cmds] of Object.entries(REQUIRED)) {
      const body = readFileSync(join(DIR, `${name}.md`), "utf8");
      for (const cmd of cmds) {
        expect(body, `${name}.md must keep \`${cmd}\``).toContain(cmd);
      }
    }
  });

  it("every exempt workflow declares its reason in a gate-exempt marker", () => {
    for (const name of EXEMPT) {
      const body = readFileSync(join(DIR, `${name}.md`), "utf8");
      expect(body, `${name}.md needs <!-- gate-exempt: <reason> -->`).toMatch(/<!--\s*gate-exempt:\s*\S[\s\S]*?-->/);
    }
  });
});
