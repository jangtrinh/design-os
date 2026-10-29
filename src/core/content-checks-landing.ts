/**
 * Landing-page ship-list checks (knowledge/landing-conversion-craft.md §7–§9): the three
 * content-family items that are decidable from the document alone. All advisory
 * (`warning`): a page missing a favicon is unfinished, not broken, and none of these may
 * decide a gate verdict by itself.
 *
 *   window-alert        `alert(` / `window.alert(` called from an inline script
 *   seo-meta-missing    a full document, not marked noindex, without description / og:title / og:image
 *   favicon-missing     a full document with no `<link rel="icon">`
 *
 * They read the raw document, not DesignFacts. The fact model carries `<title>` as text and
 * nothing else from `<head>`, so `content-checks-metadata.ts` (facts in, prompt-leak out)
 * cannot see a `<meta>` or a `<link>`; adding fact kinds for three string tests would
 * widen a shared contract for no second consumer.
 *
 * "Full document" means the markup carries `<html>` or `<head>`. A fragment (a component
 * snippet, an email block, a section pasted into a CMS) has no head to put these in, and
 * judging it would turn every fragment into a finding.
 *
 * Commented-out markup and script bodies are blanked before the head checks run, so a
 * `<link rel="icon">` quoted in a code sample or a comment is not a favicon.
 */
import type { FloorFindingBase } from "./finding-schema.js";
import { inlineScripts } from "./js-source-mask.js";
import { blankDeadMarkup, lineOf, stripCommentsPreservingOffsets } from "./taste-checks-shared.js";

export type LandingContentFinding = FloorFindingBase;

/** Value of an attribute in one start tag, or undefined when the tag does not carry it. */
function attrOf(tag: string, name: string): string | undefined {
  const m = new RegExp(String.raw`(?:^|\s)${name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`, "i").exec(tag);
  return m === null ? undefined : (m[1] ?? m[2] ?? m[3] ?? "");
}

/** Offset of the first `<html>` or `<head>` start tag, or -1 for a fragment. */
function documentStart(markup: string): number {
  const m = /<(?:html|head)(?=[\s>/])/i.exec(markup);
  return m === null ? -1 : m.index;
}

// ── window-alert ──

/** `alert(` or `window.alert(` as a call; `.alert(` on any other object is not the dialog. */
const ALERT_CALL = /(?<![.\w$])(?:window\s*\.\s*)?alert\s*\(/g;

export function checkWindowAlert(html: string): LandingContentFinding[] {
  const out: LandingContentFinding[] = [];
  const source = stripCommentsPreservingOffsets(html);
  // Strings are masked too: `console.log("call alert(x)")` is a message, not a dialog.
  for (const script of inlineScripts(source, true)) {
    for (const m of script.code.matchAll(ALERT_CALL)) {
      // `function alert(msg) {` declares a local helper of that name; it is not the call.
      if (/\bfunction\s*$/.test(script.code.slice(0, m.index))) continue;
      out.push({
        checkId: "window-alert", severity: "warning",
        message: "alert() blocks the page and takes the reader away from the field the problem belongs to — show an inline, specific message beside it",
        line: lineOf(source, script.start + m.index),
        expected: "an inline message next to the field or control",
        actual: m[0].replace(/\s+/g, ""),
        fixHint: "render the message in the page (role=\"alert\" region) and keep focus where it was",
      });
    }
  }
  return out;
}

// ── seo-meta-missing ──

/** True when the content attribute carries a real value; an empty one is as absent as no tag. */
const filled = (v: string | undefined): boolean => v !== undefined && v.trim() !== "";

export function checkSeoMetaMissing(html: string): LandingContentFinding[] {
  const markup = blankDeadMarkup(html);
  const at = documentStart(markup);
  if (at === -1) return [];
  const metas = [...markup.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  // A page that asks not to be indexed has no search snippet or share card to write.
  const noindex = metas.some((t) => attrOf(t, "name")?.trim().toLowerCase() === "robots" && /\bnoindex\b/i.test(attrOf(t, "content") ?? ""));
  if (noindex) return [];
  const has = (key: string, attr: "name" | "property"): boolean =>
    metas.some((t) => attrOf(t, attr)?.trim().toLowerCase() === key && filled(attrOf(t, "content")));
  const missing: string[] = [];
  if (!has("description", "name")) missing.push('<meta name="description">');
  // Open Graph is specified on `property`; `name="og:…"` is common enough to honor.
  if (!has("og:title", "property") && !has("og:title", "name")) missing.push('<meta property="og:title">');
  if (!has("og:image", "property") && !has("og:image", "name")) missing.push('<meta property="og:image">');
  if (missing.length === 0) return [];
  return [{
    checkId: "seo-meta-missing", severity: "warning",
    message: `an indexable page without ${missing.join(", ")} — the search snippet and the share card are written by a crawler instead of by you (add them, or mark the page noindex)`,
    line: lineOf(markup, at),
    expected: "meta description, og:title and og:image, or a robots noindex",
    actual: `missing ${missing.length} of 3`,
    fixHint: "add the missing <meta> tags to <head>; campaign-only pages take <meta name=\"robots\" content=\"noindex\"> instead",
  }];
}

// ── favicon-missing ──

export function checkFaviconMissing(html: string): LandingContentFinding[] {
  const markup = blankDeadMarkup(html);
  const at = documentStart(markup);
  if (at === -1) return [];
  // `rel` is a token list: "shortcut icon" is an icon, "apple-touch-icon" alone is not.
  const hasIcon = [...markup.matchAll(/<link\b[^>]*>/gi)].some((m) =>
    (attrOf(m[0], "rel") ?? "").toLowerCase().split(/\s+/).includes("icon"));
  if (hasIcon) return [];
  return [{
    checkId: "favicon-missing", severity: "warning",
    message: "no <link rel=\"icon\"> — the tab, the bookmark and the search result show a blank globe instead of the brand",
    line: lineOf(markup, at),
    expected: "a <link rel=\"icon\"> in <head>",
    actual: "none",
    fixHint: "add <link rel=\"icon\" href=\"…\">; an inline data: SVG needs no extra file",
  }];
}

/** The three, in the order they are documented. Composed into `allContentChecks`. */
export const landingContentChecks = [checkWindowAlert, checkSeoMetaMissing, checkFaviconMissing] as const;
