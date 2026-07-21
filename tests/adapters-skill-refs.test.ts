import { describe, expect, it } from "vitest";
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
});
