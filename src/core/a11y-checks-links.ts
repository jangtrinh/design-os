/**
 * Link checks for the landing ship list (knowledge/landing-conversion-craft.md §7–§9).
 * Both are advisory (`warning`): a dead link is a defect in the page's promise, but whether a
 * given `href="#"` is a placeholder or a progressive-enhancement hook is not decidable from
 * markup, so neither may decide a verdict alone.
 *
 *   dead-link-href     `<a href="#">` or `<a href="javascript:…">` that is not marked disabled
 *   skip-link-missing  a document with `<nav>` and `<main>` and no in-page link before the nav
 *
 * Regex-based and precision-first like the rest of this family. Script, `<pre>` and
 * `<code>` regions are blanked first: an anchor inside a template string or a code sample is
 * not a link on the page.
 */
import type { A11yFinding } from "./a11y-lint.js";
import { markupOnly } from "./a11y-checks-focus-and-labels.js";
import { lineOf } from "./taste-checks-shared.js";

/** Value of an attribute in one start tag; `data-href` and friends do not count. */
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`, "i").exec(tag);
  return m === null ? undefined : (m[1] ?? m[2] ?? m[3] ?? "");
}

// ── 4.1.2 Name, role, value: a link must go somewhere ──

/**
 * checkDeadLinkHref — an `<a>` whose `href` is exactly `#` or starts with `javascript:`.
 * Both promise navigation and deliver none: `#` scrolls to the top and rewrites the URL,
 * `javascript:` is blocked by any strict Content-Security-Policy. `aria-disabled="true"`
 * is the honest way to say "not available yet" and is skipped. `#main` and every other
 * fragment with a name is an in-page link and is fine.
 */
export function checkDeadLinkHref(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  const markup = markupOnly(html);
  let nth = 0;
  for (const m of markup.matchAll(/<a\b[^>]*>/gi)) {
    nth++;
    const href = attrOf(m[0], "href")?.trim();
    if (href === undefined) continue;
    if (href !== "#" && !/^javascript:/i.test(href)) continue;
    if (attrOf(m[0], "aria-disabled")?.trim().toLowerCase() === "true") continue;
    out.push({
      checkId: "dead-link-href", severity: "warning", sc: "4.1.2",
      message: `<a href="${href.length > 24 ? `${href.slice(0, 24)}…` : href}"> goes nowhere — point it at a real destination, make it a <button> if it runs a script, or mark it aria-disabled="true"`,
      line: lineOf(markup, m.index),
      nodeRef: `<a>[${nth}]`,
      expected: "an href that names a destination",
      actual: `href="${href.length > 24 ? `${href.slice(0, 24)}…` : href}"`,
      fixHint: "use the real URL, a <button type=\"button\">, or aria-disabled=\"true\" while the target does not exist",
      repairScope: "nodes",
    });
  }
  return out;
}

// ── 2.4.1 Bypass blocks ──

/**
 * checkSkipLinkMissing — a document that has both a `<nav>` and a `<main>` but no in-page
 * link (`<a href="#something">`) before the first `<nav>`. A keyboard user otherwise tabs
 * through every navigation link on every page before reaching the content. The skip link
 * has to come first in tab order, so "before the first nav" is the test, not "somewhere".
 * A bare `#` is not an in-page link (that is `dead-link-href`'s finding) and does not count.
 */
export function checkSkipLinkMissing(html: string): A11yFinding[] {
  const markup = markupOnly(html);
  const nav = /<nav(?=[\s>/])/i.exec(markup);
  if (nav === null || !/<main(?=[\s>/])/i.test(markup)) return [];
  const before = markup.slice(0, nav.index);
  for (const m of before.matchAll(/<a\b[^>]*>/gi)) {
    if (/^#[^\s#]/.test(attrOf(m[0], "href")?.trim() ?? "")) return [];
  }
  return [{
    checkId: "skip-link-missing", severity: "warning", sc: "2.4.1",
    message: "the page has a <nav> and a <main> but no in-page link before the navigation — keyboard users must tab through every nav link to reach the content; add <a href=\"#main\">Skip to content</a> as the first focusable element",
    line: lineOf(markup, nav.index),
    expected: "an <a href=\"#…\"> before the first <nav>",
    actual: "none",
    fixHint: "add a visually-hidden-until-focused skip link as the first child of <body>, targeting the <main> id",
  }];
}
