/**
 * ds-usage-font-check.ts — the closed `font-family` allowlist (`off-system-font`).
 *
 * The failure this closes: an agent invented `ui-monospace, SFMono-Regular, …`, applied it to CLI paths and
 * model names, and every gate passed — nothing compared a page's font stacks with the project's
 * declared font tokens. This module is that comparison.
 *
 * Stack rule (owner-ratified): a `font-family` value passes when its FIRST family (quotes stripped,
 * case-insensitive) is the first family of some `fontFamily` token in the design system. Everything
 * after the first family is fallback and is not compared, so `"Inter", sans-serif` passes when a
 * token's stack starts with Inter. A generic or system face (`ui-monospace`, `system-ui`, `Menlo`,
 * `Consolas`, …) is just another family: it passes only when a token's first family IS that face.
 *
 *   - CSS-wide keywords (inherit, initial, unset, revert, revert-layer) pass.
 *   - `var(--x)` is NOT judged here: ds-usage-lint already reports it as undeclared-token (error) or
 *     off-system-token (warning), the same model as colour.
 *   - A value interpolated at build time (`${…}`, read by the extractor as underscores) cannot be
 *     evaluated; it is counted, never silently passed.
 *   - Tailwind `font-mono` / `font-serif` / `font-sans` are backed only by a fontFamily token whose
 *     NAME ends in that word (`…-mono`); the utility's stack lives in a config this tool does not read.
 *
 * A design system that declares NO fontFamily token has nothing to compare against, so the rule does not
 * run for it: `fontRuleSkipReason` names that, and every caller reports it (nothing vanishes silently).
 * A design system with at least one fontFamily token, leaf or typography member, runs the rule in full.
 *
 * Not checked on purpose: `@font-face` bodies (they define a family, they do not apply one) and the
 * token-declaration blocks the colour check already skips. The `font:` shorthand is not parsed.
 */
import type { ResolvedMap } from "./token-model.js";

export type FontRole = "mono" | "serif" | "sans";

export interface FontTokenModel {
  /** Lower-cased first family of every fontFamily token (leaf, or the member of a typography token). */
  firstFamilies: ReadonlySet<string>;
  /** Role words (`mono`, `serif`, `sans`) that some fontFamily token's name ends in. */
  roles: ReadonlySet<FontRole>;
  /** CSS variable name of each fontFamily token, for the repair hint. */
  cssVars: readonly string[];
}

export interface FontViolation {
  /** 1-based line within the CSS text that was checked. */
  line: number;
  message: string;
}

const CSS_WIDE = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const FONT_FAMILY_DECL_RE = /(?<![\w-])font-family\s*:\s*([^;{}]+)/gi;
const FONT_UTILITY_RE = /^font-(mono|serif|sans)$/;

/** First family of a font stack: quotes stripped, trimmed, lower-cased. "" when there is none. */
export function firstFamily(stack: string): string {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|([^,]*))/.exec(stack);
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim().toLowerCase();
}

function roleOf(tokenPath: string): FontRole | undefined {
  const name = tokenPath.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "";
  if (/(?:^|-)sans-serif$|(?:^|-)sansserif$/.test(name)) return "sans"; // a sans stack, not a serif one
  const m = /(?:^|-)(mono|serif|sans)$/.exec(name) ?? /[a-z](mono|serif|sans)$/.exec(name);
  return m?.[1] as FontRole | undefined;
}

export function fontTokenModel(resolved: ResolvedMap): FontTokenModel {
  const firstFamilies = new Set<string>();
  const roles = new Set<FontRole>();
  const cssVars: string[] = [];
  for (const t of resolved) {
    const stack = t.type === "fontFamily" ? t.value
      : t.type === "typography" && typeof t.value === "object" && !Array.isArray(t.value) ? t.value["fontFamily"]
      : undefined;
    const head = Array.isArray(stack) ? stack[0] : stack;
    if (typeof head !== "string") continue;
    const family = firstFamily(head);
    if (family === "") continue;
    firstFamilies.add(family);
    if (t.type === "fontFamily") {
      cssVars.push("--" + t.path.replace(/\./g, "-"));
      const role = roleOf(t.path);
      if (role !== undefined) roles.add(role);
    }
  }
  return { firstFamilies, roles, cssVars };
}

/** Why the font rule does not run for this design system, or undefined when it does. */
export function fontRuleSkipReason(fonts: FontTokenModel): string | undefined {
  return fonts.firstFamilies.size === 0 ? "off-system-font: the design system declares no fontFamily token" : undefined;
}

const hint = (fonts: FontTokenModel): string =>
  fonts.cssVars.length > 0
    ? `use a font token (${fonts.cssVars.slice(0, 3).map((v) => `var(${v})`).join(", ")}) or 'font-family: inherit'`
    : "use the design system's typography font or 'font-family: inherit'"; // fonts live only in typography tokens, which have no var of their own to name

/**
 * Violations among the `font-family` declarations of one CSS text (comments already blanked).
 * `skipAt(index)` is true inside blocks that are not applications (token declarations, @font-face).
 * `dynamic` counts values that could not be evaluated.
 */
export function checkFontFamilyDeclarations(
  css: string,
  fonts: FontTokenModel,
  skipAt: (index: number) => boolean,
  lineOf: (index: number) => number,
): { violations: FontViolation[]; dynamic: number } {
  const violations: FontViolation[] = [];
  let dynamic = 0;
  for (const m of css.matchAll(FONT_FAMILY_DECL_RE)) {
    const idx = m.index ?? 0;
    if (skipAt(idx)) continue;
    const stack = (m[1] as string).replace(/!\s*important\s*$/i, "").trim();
    const family = firstFamily(stack);
    if (family === "" || CSS_WIDE.has(family) || family.startsWith("var(")) continue;
    if (/^_+$/.test(family)) { dynamic++; continue; }
    if (fonts.firstFamilies.has(family)) continue;
    violations.push({
      line: lineOf(idx),
      message: `OFF_SYSTEM_FONT — font-family '${stack.length > 80 ? stack.slice(0, 77) + "..." : stack}' starts with '${family}', which is not the first family of any fontFamily token — ${hint(fonts)}.`,
    });
  }
  return { violations, dynamic };
}

/** Tailwind font utilities (`font-mono`, `md:font-serif`, `!font-sans`) the design system does not back. */
export function checkFontUtilities(classes: readonly string[], fonts: FontTokenModel): string[] {
  const messages: string[] = [];
  for (const raw of classes) {
    const base = raw.slice(raw.lastIndexOf(":") + 1).replace(/^!|!$/g, "");
    const role = FONT_UTILITY_RE.exec(base)?.[1] as FontRole | undefined;
    if (role === undefined || fonts.roles.has(role)) continue;
    messages.push(
      `OFF_SYSTEM_FONT — Tailwind '${raw}' needs a fontFamily token whose name ends in '${role}', and the design system has none — ${hint(fonts)}.`,
    );
  }
  return messages;
}
