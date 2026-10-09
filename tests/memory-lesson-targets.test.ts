import { expect, it } from "vitest";
import { ownerMemoryFixture } from "./helpers/memory-lesson-fixture.js";
import { lessonTargets } from "../src/core/memory-lesson-context.js";

it("retrieves exact comma-containing names separately in component and pattern scopes", () => {
  const name = "Controls/Primary, Compact", spaced = " Pattern, dense ";
  const owner = ownerMemoryFixture([name, spaced, "Controls/Primary", "Compact"]);
  try {
    const component = owner.propose("Short labels", "component", name); owner.review(component);
    const pattern = owner.propose("Dense grouping", "pattern", name); owner.review(pattern);
    const whitespace = owner.propose("Keep the pattern", "pattern", spaced); owner.review(whitespace);
    const context = (flags: string[]) => owner.cmd(["context", "--json", "--max-bytes", "8192", ...flags]);
    for (const [flag, id] of [["--components", component], ["--patterns", pattern]]) {
      const result = context([flag as string, JSON.stringify([name])]);
      expect(result.code, result.out).toBe(0);
      expect(JSON.parse(result.out).data.lessons.map((x: { id: string }) => x.id)).toEqual([id]);
    }
    const many = context(["--components", JSON.stringify([name, "Controls/Primary", name]), "--patterns", JSON.stringify([name, spaced])]);
    expect(many.code, many.out).toBe(0);
    expect(JSON.parse(many.out).data.lessons.map((x: { id: string }) => x.id)).toEqual([component, pattern, whitespace]);
    expect(JSON.parse(context(["--components", "Controls/Primary,Compact"]).out).data.lessons).toEqual([]);
  } finally { owner.cleanup(); }
});

it("preserves JSON characters and keeps CSV backward-compatible", () => {
  expect(lessonTargets('["Controls/Primary, Compact"," Pattern, dense "]')).toEqual(["Controls/Primary, Compact", " Pattern, dense "]);
  expect(lessonTargets(" Component/1,Component/2,Component/1 ")).toEqual(["Component/1", "Component/2"]);
});

for (const raw of ["[", "[]", "[null]", "[1]", '[""]', '[" "]', '[{"name":"Component/1"}]']) {
  it(`rejects malformed JSON selector ${raw}`, () => expect(() => lessonTargets(raw)).toThrow(/JSON/));
}
