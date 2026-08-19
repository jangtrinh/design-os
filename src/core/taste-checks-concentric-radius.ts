/**
 * equal-nested-radii (Spacing axis, warning) — the concentric-corner floor.
 * The rule already lives in prose twice (mode-constraints.md mobile:
 * "Inner radius = outer radius − padding"; figma-craft/visual-craft.md §2.4
 * canvas-proven formula) with no linter — this closes the emitter/linter pair.
 * interfaces.dev calls equal nested radii "the most common thing that makes
 * interfaces feel off": with padding between the surfaces, an inner corner at
 * the outer radius looks pinched.
 *
 * Precision decisions (Tailwind-classes-only prong, misses accepted):
 *   - only the ALL-corners utilities compare (`rounded`, `rounded-md`,
 *     `rounded-[Npx]`); side/corner variants (rounded-t-lg) never match;
 *   - the parent must declare uniform padding (`p-N` > 0 / `p-[Npx]`) — flush
 *     nesting (no padding) legitimately shares a radius;
 *   - `rounded-full`/`rounded-none` are exempt (a pill in a pill is one
 *     decision, not a mismatch);
 *   - raw-CSS radii resolve through the cascade, which a static scan cannot
 *     pair to a DOM path — they stay with the model critique.
 * Inner HTML is captured to the first matching close tag (under-captures on
 * same-tag nesting → misses, never over-flags). Pure string/regex.
 */
import type { TasteFinding } from "./taste-lint.js";
import { lineOf } from "./taste-checks-shared.js";

/** The all-corners radius token in a class list; (?!-) rejects side/corner forms
 *  and (?!\w) ends the token cleanly (a trailing \b fails after `]`). */
const RADIUS_TOKEN = /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full|none|\[[^\]]+\]))?(?!-)(?!\w)/;
/** Uniform padding above zero: p-1 … p-96, p-0.5, or p-[Npx]. */
const PADDED = /\bp-(?:0\.5|[1-9]\d*(?:\.\d+)?)\b|\bp-\[(?:[1-9][^\]]*)\]/;

function radiusOf(cls: string): string | null {
  const m = RADIUS_TOKEN.exec(cls);
  if (m === null) return null;
  const token = m[0];
  if (token === "rounded-none" || token === "rounded-full") return null;
  return token;
}

function classOf(attrs: string): string {
  return /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
}

export function checkEqualNestedRadii(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const lower = html.toLowerCase();
  const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const cls = classOf(m[2] ?? "");
    const outer = radiusOf(cls);
    if (outer === null || !PADDED.test(cls)) continue;
    const tag = (m[1] ?? "").toLowerCase();
    const closeIdx = lower.indexOf(`</${tag}>`, re.lastIndex);
    // A void or unclosed tag has no inner HTML — scanning the rest of the
    // document would report unrelated siblings as nested children.
    if (closeIdx === -1) continue;
    const inner = html.slice(re.lastIndex, closeIdx);
    for (const c of inner.matchAll(/<[a-zA-Z][\w-]*\b([^>]*)>/g)) {
      const childRadius = radiusOf(classOf(c[1] ?? ""));
      if (childRadius === null) continue;
      if (childRadius === outer) {
        findings.push({
          checkId: "equal-nested-radii", axis: "Spacing", severity: "warning",
          message: `a padded "${outer}" container nests a child at the same "${childRadius}" — equal nested radii make the inner corner look pinched (rubric Spacing: nested rounded corners stay concentric, outer radius = inner radius + padding); step the child down or bump the parent up`,
          line: lineOf(html, m.index),
        });
      }
      break; // judge only the first rounded child per container — one finding per parent
    }
  }
  return findings;
}
