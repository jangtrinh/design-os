/**
 * ds-usage-lint.ts — the ENFORCEMENT linter (spec 009): does a generated page
 * actually use the project's design-system tokens, or does it hardcode colour
 * / reference ghost tokens?
 *
 * `ds context`'s ENFORCEMENT clause tells every host model to style exclusively
 * with the semantic tokens it emits — never hardcode colour when a token
 * covers it. Nothing checked that until this: a page using
 * `var(--totally-undeclared-token)` plus hardcoded hex passed all four
 * existing floors (taste-lint, validate-layout, content-lint, a11y-lint) with
 * zero errors. Colour and FONT FAMILY are covered — hardcoded spacing/radius is a
 * deliberate deferral (literals like `1px` borders / `50%` radii are legitimate
 * and lower-signal; a stricter model can revisit). The font rule
 * (`off-system-font`, ds-usage-font-check.ts) runs when the caller supplies a
 * font model; without one the call is colour-only, exactly as before.
 *
 * Input is any UI source, not only HTML: `lintDsUsageOnMarkup` reads `.html
 * .svelte .vue .jsx .tsx .js .ts` through polyglot-ui-extractor.ts (style
 * blocks, inline styles, class lists, CSS template literals).
 *
 * HONESTY (Art VIII): this proves *token usage in the page's own CSS* only.
 * It cannot prove computed/rendered colour, gradients, or inline-SVG fills it
 * never parsed. Never say "on-system" — report exactly what was counted: N
 * hardcoded colours, M off-system tokens, K undeclared references. Not a CSS
 * parser — a brace/regex scan, same class as taste-lint and css-selector-blocks.
 *
 * Checks (algorithms: ds-usage-css-checks.ts for colour/tokens, ds-usage-font-check.ts for fonts):
 *   undeclared-token (error), off-system-token (warning), hardcoded-color (error), off-system-font (error).
 * Token-DECLARATION blocks (`:root` / `@theme` / `html` / `body` / `[data-theme]` / `.dark`) are
 * excluded from every check: they hold the literal values that ARE the token definitions.
 */
import { createLineIndex } from "./line-index.js";
import { analyse, colourAndTokenFindings, pageDeclaredVarsOf } from "./ds-usage-css-checks.js";
import { extractUiRecords, uiSourceExtension } from "./polyglot-ui-extractor.js";
import type { UiRecord } from "./polyglot-ui-extractor.js";
import { checkFontFamilyDeclarations, checkFontUtilities, fontRuleSkipReason } from "./ds-usage-font-check.js";
import type { FontTokenModel } from "./ds-usage-font-check.js";

export type DsUsageSeverity = "error" | "warning";
export type DsUsageCheckId = "undeclared-token" | "off-system-token" | "hardcoded-color" | "off-system-font";

export interface DsUsageFinding {
  checkId: DsUsageCheckId;
  severity: DsUsageSeverity;
  message: string;
  /** 1-based line number; always locatable — every finding comes from a regex match. */
  line: number;
}

export interface DsUsageLintResult {
  findings: DsUsageFinding[];
  errorCount: number;
  warningCount: number;
  hardcodedColorCount: number;
  offSystemTokenCount: number;
  undeclaredTokenCount: number;
  offSystemFontCount: number;
  /** font-family values built at build time (`${…}`) that could not be evaluated — counted, never passed silently. */
  unevaluatedFontCount: number;
  /** `var(--${x})` references whose name is built at build time: counted, never judged. */
  unevaluatedVarCount: number;
  /** Checks that did not run, each with its reason ("<check>: <why>"). Empty when everything ran. */
  skippedChecks: string[];
}

export interface DsUsageLintOptions {
  /** Every CSS custom-property name (with leading "--") the DS declares. */
  declaredVars: ReadonlySet<string>;
  /** The DS's font tokens; absent = the font rule does not run. */
  fonts?: FontTokenModel;
}

/** The font rule over the extractor's records: font-family declarations in style text, Tailwind utilities in class lists. */
function fontFindings(records: readonly UiRecord[], fonts: FontTokenModel): { findings: DsUsageFinding[]; unevaluated: number } {
  const findings: DsUsageFinding[] = [];
  let unevaluated = 0;
  for (const r of records) {
    if (r.styles !== "") {
      const a = analyse(r.styles, false);
      const fontFaces = a.blocks.filter((b) => /^@font-face\b/i.test(b.selector));
      const idx = createLineIndex(a.scan);
      const skipAt = (i: number): boolean => a.inDeclRange(i) || fontFaces.some((b) => b.start <= i && i < b.end);
      const { violations, dynamic } = checkFontFamilyDeclarations(a.scan, fonts, skipAt, (i) => idx.lineOf(i));
      unevaluated += dynamic;
      for (const v of violations) findings.push({ checkId: "off-system-font", severity: "error", message: v.message, line: r.line + v.line - 1 });
    }
    for (const message of checkFontUtilities(r.classes, fonts)) {
      findings.push({ checkId: "off-system-font", severity: "error", message, line: r.line });
    }
  }
  return { findings, unevaluated };
}

function summarise(findings: DsUsageFinding[], unevaluatedFontCount: number, unevaluatedVarCount: number, skippedChecks: string[]): DsUsageLintResult {
  findings.sort((a, b) => a.line - b.line);
  const errorCount = findings.filter((f) => f.severity === "error").length;
  const count = (id: DsUsageCheckId): number => findings.filter((f) => f.checkId === id).length;
  return {
    findings,
    errorCount,
    warningCount: findings.length - errorCount,
    hardcodedColorCount: count("hardcoded-color"),
    offSystemTokenCount: count("off-system-token"),
    undeclaredTokenCount: count("undeclared-token"),
    offSystemFontCount: count("off-system-font"),
    unevaluatedFontCount,
    unevaluatedVarCount,
    skippedChecks,
  };
}

/**
 * Lint any UI source file (`opts.file` names its type; default HTML). HTML is judged as one
 * CSS-bearing text, exactly as v1 did; every other type is judged record by record, with each
 * record's lines mapped back to the file. The page-declared var set is file-wide, so a `:root`
 * block in one style record legitimises its vars in another.
 */
export function lintDsUsageOnMarkup(source: string, opts: DsUsageLintOptions & { file?: string }): DsUsageLintResult {
  const file = opts.file ?? "markup.html";
  const records = extractUiRecords(file, source);
  const findings: DsUsageFinding[] = [];
  let dynamicVars = 0;
  if (uiSourceExtension(file) === ".html") {
    const a = analyse(source, true);
    const found = colourAndTokenFindings(a, opts.declaredVars, pageDeclaredVarsOf(a));
    findings.push(...found.findings);
    dynamicVars += found.dynamicVarCount;
  } else {
    const parts = records.filter((r) => r.styles !== "").map((r) => ({ r, a: analyse(r.styles, false) }));
    const pageVars = new Set(parts.flatMap(({ a }) => [...pageDeclaredVarsOf(a)]));
    for (const { r, a } of parts) {
      const found = colourAndTokenFindings(a, opts.declaredVars, pageVars);
      for (const f of found.findings) findings.push({ ...f, line: r.line + f.line - 1 });
      dynamicVars += found.dynamicVarCount;
    }
  }
  // A design system without a fontFamily token has nothing to compare fonts against: the rule is skipped, loudly.
  const skipReason = opts.fonts === undefined ? undefined : fontRuleSkipReason(opts.fonts);
  const fonts = opts.fonts === undefined || skipReason !== undefined ? { findings: [], unevaluated: 0 } : fontFindings(records, opts.fonts);
  return summarise([...findings, ...fonts.findings], fonts.unevaluated, dynamicVars, skipReason === undefined ? [] : [skipReason]);
}

/** HTML in, findings out — the original entry point. */
export function lintDsUsage(html: string, opts: DsUsageLintOptions): DsUsageLintResult {
  return lintDsUsageOnMarkup(html, opts);
}
