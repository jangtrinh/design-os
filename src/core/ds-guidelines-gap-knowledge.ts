/**
 * DS Guidelines Pack — gap-bound knowledge (D8) (pure, no fs).
 *
 * General design knowledge enters the pack ONLY as the answer to a gap measured in THIS design
 * system: a control that models interaction states but no `disabled` (the specimen check), a
 * canonical role no token plays, a declared colour pair that fails AA. Every gap is a generated
 * rule that names the knowledge file (or the check) AND carries its gap id. No gap, no citation.
 */
import { checkTokenContrast } from "./ds-a11y.js";
import { summarizeRoles } from "./ds-context-roles.js";
import { checkSpecimen } from "./specimen-check.js";
import { slug, uniqueId } from "./ds-guidelines-model.js";
import type { RuleSource, StoreSourcePaths } from "./ds-guidelines-model.js";
import { componentSpan, tokenSpan } from "./ds-guidelines-render.js";
import type { DesignSystem } from "./design-system.js";

export const COMPONENT_DESIGN_DOC = "knowledge/figma-craft/component-design.md";
export const TOKEN_TAXONOMY_DOC = "knowledge/token-taxonomy.md";
const A11Y_CHECK = "ui ds a11y";
const AA_NORMAL_TEXT = 4.5;

export interface Gap {
  /** `gap.component.<name>.<state>`, `gap.role.<role>` or `gap.a11y.<text>.on.<surface>`. */
  id: string;
  kind: "component" | "role" | "a11y";
  /** The generated rule line. */
  line: string;
  sources: RuleSource[];
  /** The knowledge file cited, when the gap is answered by one. */
  knowledge?: string;
  /** A scenario the host answers; roles have none (the fix is a token, not guidance). */
  scenario?: { title: string; prompt: string };
}

const MISSING_STATE = /^missing-(.+)$/;

/** Every gap measured in the design system, sorted by id. */
export function findGaps(ds: DesignSystem, src: StoreSourcePaths): Gap[] {
  const gaps: Gap[] = [];
  const used = new Set<string>();

  for (const f of checkSpecimen(ds.registry.components).findings) {
    const state = MISSING_STATE.exec(f.checkId)?.[1] ?? f.checkId;
    gaps.push({
      id: uniqueId(`gap.component.${slug(f.component)}.${state}`, used),
      kind: "component",
      line: `${componentSpan(f.component)}: ${f.message}. Knowledge: ${COMPONENT_DESIGN_DOC}`,
      sources: [{ path: src.registry, component: f.component }],
      knowledge: COMPONENT_DESIGN_DOC,
      scenario: {
        title: `Gap: ${f.component} has no '${state}' state`,
        prompt: state === "disabled"
          ? `How does ${componentSpan(f.component)} look and behave when disabled?`
          : `What does ${componentSpan(f.component)} show when it has no data?`,
      },
    });
  }

  const roles = summarizeRoles(ds.tokens);
  for (const role of roles?.gaps ?? []) {
    gaps.push({
      id: uniqueId(`gap.role.${role}`, used),
      kind: "role",
      line: `No token plays the '${role}' role (add one with 'ui ds change-token' in your own name). Knowledge: ${TOKEN_TAXONOMY_DOC}`,
      sources: [{ path: src.tokens, role }],
      knowledge: TOKEN_TAXONOMY_DOC,
    });
  }

  // Name-guessed pairs are not measurements; only declared {role}/{role}-foreground pairs count.
  const contrast = checkTokenContrast(ds.resolved);
  if (contrast.measured && contrast.mode !== "inferred") {
    for (const p of contrast.failures) {
      gaps.push({
        id: uniqueId(`gap.a11y.${slug(p.text)}.on.${slug(p.surface)}`, used),
        kind: "a11y",
        line: `${tokenSpan(p.text)} on ${tokenSpan(p.surface)} measures ${p.ratio}:1, below AA ${AA_NORMAL_TEXT}:1. Check: ${A11Y_CHECK}`,
        sources: [{ path: src.tokens, token: p.text }, { path: src.tokens, token: p.surface }],
        scenario: {
          title: `Gap: ${p.text} on ${p.surface} fails AA`,
          prompt: `Which token pair replaces ${tokenSpan(p.text)} on ${tokenSpan(p.surface)}?`,
        },
      });
    }
  }
  return gaps.sort((a, b) => a.id.localeCompare(b.id));
}
