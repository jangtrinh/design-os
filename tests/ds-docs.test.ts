import { describe, expect, it } from "vitest";
import { buildDocsModel, renderMarkdown } from "../src/core/ds-docs.js";
import type { DocsInputComponent } from "../src/core/ds-docs.js";

const comp = (over: Partial<DocsInputComponent> & { name: string; category: string }): DocsInputComponent => ({
  tokensUsed: [], ...over,
});

describe("ds-docs — buildDocsModel", () => {
  it("groups components by category, sorted; sorts components + variants + states + tokens", () => {
    const model = buildDocsModel([
      comp({ name: "Card/Media", category: "card", variants: ["b", "a"], tokensUsed: ["z.1", "a.1"] }),
      comp({ name: "Button/Ghost", category: "button", states: ["hover", "default"] }),
    ]);
    expect(model.componentCount).toBe(2);
    expect(model.categories.map((c) => c.name)).toEqual(["button", "card"]);
    const card = model.categories.find((c) => c.name === "card")!.components[0]!;
    expect(card.variants).toEqual(["a", "b"]);
    expect(card.tokensUsed.map((t) => t.path)).toEqual(["a.1", "z.1"]);
    const btn = model.categories.find((c) => c.name === "button")!.components[0]!;
    expect(btn.states).toEqual(["default", "hover"]);
  });

  it("attaches resolved token values when provided", () => {
    const model = buildDocsModel(
      [comp({ name: "B/P", category: "button", tokensUsed: ["color.primary", "space.4"] })],
      new Map([["color.primary", "#2563EB"]]), // space.4 intentionally unresolved
    );
    const t = model.categories[0]!.components[0]!.tokensUsed;
    expect(t.find((x) => x.path === "color.primary")?.value).toBe("#2563EB");
    expect(t.find((x) => x.path === "space.4")?.value).toBeUndefined();
  });

  it("flags common missing states (focus/disabled/loading/error/empty)", () => {
    const model = buildDocsModel([comp({ name: "B/P", category: "button", states: ["default", "hover"] })]);
    expect(model.categories[0]!.components[0]!.missingStates).toEqual(["focus", "disabled", "loading", "error", "empty"]);
  });

  it("a component declaring all prompt states has no missingStates", () => {
    const model = buildDocsModel([comp({ name: "X", category: "c", states: ["focus", "disabled", "loading", "error", "empty"] })]);
    expect(model.categories[0]!.components[0]!.missingStates).toEqual([]);
  });

  it("is deterministic", () => {
    const input = [comp({ name: "B", category: "b" }), comp({ name: "A", category: "a" })];
    expect(buildDocsModel(input)).toEqual(buildDocsModel(input));
  });
});

describe("ds-docs — renderMarkdown", () => {
  it("renders headings, variants/states, the missing-states hint and resolved tokens", () => {
    const md = renderMarkdown(buildDocsModel(
      [comp({ name: "Button/Primary", category: "button", description: "Primary CTA.", variants: ["solid"], states: ["default"], tokensUsed: ["color.primary"] })],
      new Map([["color.primary", "#2563EB"]]),
    ));
    expect(md).toContain("# Component documentation");
    expect(md).toContain("### Button/Primary");
    expect(md).toContain("Primary CTA.");
    expect(md).toContain("**Variants:** solid");
    expect(md).toContain("Consider adding:");
    expect(md).toContain("`color.primary` → #2563EB");
  });

  it("empty registry renders a helpful placeholder, not a broken doc", () => {
    const md = renderMarkdown(buildDocsModel([]));
    expect(md).toContain("no components registered yet");
  });
});
