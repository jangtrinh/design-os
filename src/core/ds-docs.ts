/**
 * Component documentation, regenerated from the registry (DESIGN-OS T1).
 *
 * Docs decay because they are hand-maintained; docs *generated from source* never
 * decay. This turns the component registry (+ resolved token values) into Markdown
 * reference docs, deterministically. Pure — no fs, no network.
 */
/**
 * Structural component input — deliberately NOT `ComponentRecord`, because docs treat
 * states as free design-advice strings (component-design.md's full lifecycle: loading /
 * error / empty / skeleton), which is wider than the registry's stored `ComponentState`
 * enum. A ComponentRecord is assignable to this.
 */
export interface DocsInputComponent {
  name: string;
  category: string;
  description?: string;
  variants?: readonly string[];
  states?: readonly string[];
  tokensUsed: readonly string[];
}

/** The canonical state lifecycle (component-design.md §③) — used to flag gaps. */
export const CANONICAL_STATES = [
  "default", "hover", "focus", "pressed", "disabled", "loading", "selected", "error", "empty", "skeleton",
] as const;

export interface DocToken {
  path: string;
  value?: string;
}
export interface DocComponent {
  name: string;
  category: string;
  description?: string;
  variants: string[];
  states: string[];
  tokensUsed: DocToken[];
  /** States a data/interactive component commonly needs but does not declare. */
  missingStates: string[];
}
export interface DocsModel {
  componentCount: number;
  categories: { name: string; components: DocComponent[] }[];
}

/** States worth prompting for when absent (the high-value, high-miss ones). */
const PROMPT_STATES = ["focus", "disabled", "loading", "error", "empty"] as const;

export function buildDocsModel(
  components: readonly DocsInputComponent[],
  resolvedByPath: ReadonlyMap<string, string> = new Map(),
): DocsModel {
  const byCategory = new Map<string, DocComponent[]>();
  for (const c of components) {
    const states = [...(c.states ?? [])];
    const missingStates = PROMPT_STATES.filter((s) => !states.includes(s));
    const doc: DocComponent = {
      name: c.name,
      category: c.category,
      ...(c.description !== undefined ? { description: c.description } : {}),
      variants: [...(c.variants ?? [])].sort(),
      states: states.sort(),
      tokensUsed: [...c.tokensUsed].sort().map((p) => {
        const value = resolvedByPath.get(p);
        return value !== undefined ? { path: p, value } : { path: p };
      }),
      missingStates,
    };
    const list = byCategory.get(c.category) ?? [];
    list.push(doc);
    byCategory.set(c.category, list);
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, comps]) => ({ name, components: comps.sort((a, b) => a.name.localeCompare(b.name)) }));
  return { componentCount: components.length, categories };
}

export function renderMarkdown(model: DocsModel): string {
  const lines: string[] = ["# Component documentation", "", `_${model.componentCount} component(s), regenerated from the registry._`, ""];
  if (model.componentCount === 0) {
    lines.push("(no components registered yet — `ui registry register` to add one)", "");
    return lines.join("\n") + "\n";
  }
  for (const cat of model.categories) {
    lines.push(`## ${cat.name}`, "");
    for (const c of cat.components) {
      lines.push(`### ${c.name}`, "");
      if (c.description !== undefined) lines.push(c.description, "");
      lines.push(`- **Variants:** ${c.variants.length > 0 ? c.variants.join(", ") : "—"}`);
      lines.push(`- **States:** ${c.states.length > 0 ? c.states.join(", ") : "—"}`);
      if (c.missingStates.length > 0) {
        lines.push(`- **Consider adding:** ${c.missingStates.join(", ")} (common states this component does not declare)`);
      }
      if (c.tokensUsed.length > 0) {
        lines.push("- **Tokens used:**");
        for (const t of c.tokensUsed) lines.push(`  - \`${t.path}\`${t.value !== undefined ? ` → ${t.value}` : ""}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n") + "\n";
}
