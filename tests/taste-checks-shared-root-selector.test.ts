/**
 * `selectorSubjectIsRoot` — the shared answer to "does this rule style the root?"
 *
 * It exists because two checks needed that answer and each grew its own regex
 * that matched the root name ANYWHERE in the selector: `root-overflow-x-hidden`
 * (layout-checks-viewport) and the colour-mode root scan
 * (taste-checks-invisible-surface). Both therefore read `body.dark .card` — a
 * rule that styles `.card` — as a root rule.
 *
 * The behavioural regression for the first consumer lives in layout-lint.test.ts,
 * where it is proven to go red without the fix. The second consumer's finding
 * count cannot discriminate (any dark declaration anywhere trips its mixed-mode
 * bail first), so the predicate itself is what gets pinned here — which is the
 * honest place for it anyway, since it is the shared thing both depend on.
 */
import { describe, expect, it } from "vitest";
import { selectorSubjectIsRoot } from "../src/core/taste-checks-shared.js";

describe("selectorSubjectIsRoot — the subject decides, not the prefix", () => {
  it.each([
    ["html", "bare root element"],
    ["body", "bare root element"],
    [":root", "the pseudo-class form"],
    ["html.js", "root carrying a state class"],
    ["body.dark", "root carrying a theme class"],
    ["body[data-theme='dark']", "root carrying an attribute"],
    ["html, body", "a comma list where every part is a root"],
    ["main, body", "a comma list where only the LAST part is a root"],
    ["body, .card", "a comma list where only the FIRST part is a root"],
  ])("%s → root (%s)", (selector) => {
    expect(selectorSubjectIsRoot(selector)).toBe(true);
  });

  it.each([
    ["body.dark .card", "descendant — the subject is .card"],
    ["html.js .ln", "descendant — the subject is .ln"],
    ["body > .page-shell", "child combinator — the subject is .page-shell"],
    ["body .a .b .c", "deep descendant"],
    ["html + body ~ .x", "sibling combinators — the subject is .x"],
    [".body-text", "a class that merely starts with the word body"],
    [".htmlish", "a class that merely starts with the word html"],
    ["#bodyguard", "an id that merely starts with the word body"],
    [":rooted", "a pseudo-class that merely starts with :root"],
  ])("%s → NOT root (%s)", (selector) => {
    expect(selectorSubjectIsRoot(selector)).toBe(false);
  });

  it("does not recognise a root wrapped in a functional pseudo — stated, not accidental", () => {
    // Documented limit in the helper's own comment. Pinned so that if someone
    // later teaches it :is()/:where(), this test fails and they update the note
    // rather than leaving the doc claiming a limit that no longer exists.
    expect(selectorSubjectIsRoot(":is(body)")).toBe(false);
    expect(selectorSubjectIsRoot(":where(html)")).toBe(false);
  });
});
