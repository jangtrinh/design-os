import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SKILL_NAMES } from "../src/adapters/templates.js";
import { VERB_SKILL_REFS } from "../src/adapters/skill-refs.js";

describe("workflow skill references", () => {
  it("only references registered skills", () => {
    const registered = new Set<string>(SKILL_NAMES);
    for (const [verb, refs] of Object.entries(VERB_SKILL_REFS)) {
      for (const ref of refs) {
        expect(registered.has(ref), `${verb} references unknown skill ${ref}`).toBe(true);
      }
    }
  });

  it("routes T5-capable workflows to gsap-motion", () => {
    expect(VERB_SKILL_REFS.generate).toContain("gsap-motion");
    expect(VERB_SKILL_REFS.refine).toContain("gsap-motion");
    expect(VERB_SKILL_REFS.redesign).toContain("gsap-motion");
  });

  it("does not route non-motion infrastructure workflows to gsap-motion", () => {
    for (const verb of ["init", "extract", "learn", "why", "evidence"] as const) {
      expect(VERB_SKILL_REFS[verb] ?? []).not.toContain("gsap-motion");
    }
  });

  it("keeps every catalog handoff reachable only through its declared workflow", () => {
    const catalog = JSON.parse(readFileSync(new URL("../knowledge/web-techniques/catalog.json", import.meta.url), "utf8")) as {
      techniques: { id: string; handoffSkill: string | null; applicableWorkflows: string[] }[];
    };
    for (const technique of catalog.techniques.filter((row) => row.handoffSkill !== null)) {
      for (const verb of technique.applicableWorkflows) {
        expect(VERB_SKILL_REFS[verb], `${technique.id} declares unknown workflow '${verb}'`).toContain(technique.handoffSkill);
      }
    }
  });
});
