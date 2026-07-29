/**
 * The figma-agent P2 panel UI is DOGFOOD: its tokens come from ease-design's own
 * `ds init`, and its template must clear the SAME four core linters every generated
 * artifact does. This is the paired gate — the panel is a hand-authored HTML surface,
 * so it runs validate-layout / a11y-lint / taste-lint / content-lint with 0 errors,
 * exactly like tests/cmd-ds-preview.test.ts asserts for the machine-generated specimen.
 *
 * It lints the SOURCE template (plugin/src/ui/panel.html, pre-bundle-injection) — the
 * build only inlines the compiled JS at the marker, so the linted markup is what ships.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintLayout } from "../src/core/layout-lint.js";
import { lintA11y } from "../src/core/a11y-lint.js";
import { lintTaste } from "../src/core/taste-lint.js";
import { allContentChecks } from "../src/core/content-checks.js";

const PANEL = fileURLToPath(new URL("../figma-agent/plugin/src/ui/panel.html", import.meta.url));
const MODEL = fileURLToPath(new URL("../figma-agent/plugin/src/ui/panel-model.ts", import.meta.url));
// The activity feed's model split out of panel-model.ts once it grew a per-operation
// vocabulary of its own; panel-model keeps the connection chrome. The rows' outcome
// lines split again into activity-summary.ts — the relay's half. IA v2 (panel redesign
// phase 02) added activity-sentence.ts on top: one English sentence per row, and the
// DOM glue (panel-ui.ts) that used to write a `✗`/`✓` text glyph directly, so both are
// read here too — the glyph ban and the sentence-module check need their source.
const FEED = fileURLToPath(new URL("../figma-agent/plugin/src/ui/activity-feed.ts", import.meta.url));
const SUMMARY = fileURLToPath(new URL("../figma-agent/plugin/src/ui/activity-summary.ts", import.meta.url));
const SENTENCE = fileURLToPath(new URL("../figma-agent/plugin/src/ui/activity-sentence.ts", import.meta.url));
const PANEL_UI = fileURLToPath(new URL("../figma-agent/plugin/src/ui/panel-ui.ts", import.meta.url));

const html = readFileSync(PANEL, "utf8");
const model = readFileSync(MODEL, "utf8");
const feed = readFileSync(FEED, "utf8");
const summary = readFileSync(SUMMARY, "utf8");
const sentenceSrc = readFileSync(SENTENCE, "utf8");
const panelUi = readFileSync(PANEL_UI, "utf8");

/** Count content-lint ERROR-severity findings (consumes the shared allContentChecks set). */
function contentErrors(source: string): number {
  let errs = 0;
  for (const c of allContentChecks) for (const f of c(source)) if (f.severity === "error") errs++;
  return errs;
}

describe("figma-agent P2 panel — the 4-linter gate", () => {
  it("passes validate-layout / a11y-lint / taste-lint / content-lint with 0 errors", () => {
    expect(lintLayout(html).errorCount, "layout errors").toBe(0);
    expect(lintA11y(html).errorCount, "a11y errors").toBe(0);
    expect(lintTaste(html).errorCount, "taste errors").toBe(0);
    expect(contentErrors(html), "content errors").toBe(0);
  });

  it("is a well-formed, language-tagged, titled document (screen-reader basics)", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toMatch(/<html\b[^>]*\blang="en"/i);
    expect(html).toMatch(/<title>[^<]+<\/title>/i);
  });
});

describe("figma-agent P2 panel — dogfood tokens + provenance", () => {
  it("embeds the compiled :root token block from ease-design's own DS", () => {
    expect(html).toContain(":root {");
    expect(html).toContain("--color-primary");
    expect(html).toContain("--color-success");
    expect(html).toContain("--font-family-body");
  });

  it("records how to regenerate the tokens (provenance) and the persona", () => {
    expect(html).toContain("brand/design");
    expect(html).toContain("ui tokens compile");
    expect(html).toContain("kinetic-swiss-punk");
  });

  it("overrides the body/display font to a system stack (iframe can't load a webfont)", () => {
    expect(html).toContain("-apple-system");
    // the override must come AFTER the compiled :root so it wins the cascade
    expect(html.lastIndexOf("--font-family-body")).toBeGreaterThan(html.indexOf("Inter, sans-serif"));
  });

  it("uses no raw hex outside the pasted :root blocks (every chrome color via var())", () => {
    // Strip the two :root{…} blocks, then assert no #RRGGBB / #RGB survives in the chrome/markup.
    const withoutRoot = html.replace(/:root\s*\{[\s\S]*?\}/g, "");
    expect(withoutRoot).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("figma-agent P2 panel — states, a11y live regions, motion", () => {
  it("consumes the P1 connection state machine via statusSentence — every branch has copy", () => {
    // IA v2 (phase 02): stateView/troubleshootHint/compactMeta are gone, replaced by ONE
    // pure function, statusSentence(state, ageMs, hadConnection), covering 6 branches
    // (connected / probing<10s / probing>=10s / handshake / disconnected-never /
    // disconnected-was). Assert the export exists and every branch's copy is verbatim —
    // these are the owner-approved problem-and-next-action sentences (§2).
    expect(model).toContain("export function statusSentence");
    for (const sentence of [
      "Connected — the CLI can drive this file.",
      "Looking for the broker",
      "Broker not running — run figma-agent status in a terminal.",
      "Connecting",
      "Not connected yet — your first CLI command starts the broker.",
      "Connection lost — reconnecting automatically.",
    ]) {
      expect(model, `missing sentence: ${sentence}`).toContain(sentence);
    }
  });

  it("wires an activity record shape of {id, tool, ok, ms, at}", () => {
    for (const field of ["id:", "tool:", "ok:", "ms:", "at:"]) {
      expect(feed, `missing ${field}`).toContain(field);
    }
  });

  it("keeps a row's intent label and its outcome — the feed says what ran, not just which cmd", () => {
    // `cmd` alone is opaque (EXEC_JS is injected code), so the record carries the
    // CLI's intent label and the plugin-derived result line. Without either, the feed
    // regresses to "exec js · 1.2s", which is what this whole module exists to fix.
    expect(feed).toContain("label?:");
    expect(feed).toContain("result?:");
    expect(feed).toContain("pending:");
    expect(summary).toContain("summarizeResult");
    expect(summary).toContain("summarizeError");
    // IA v2: the label/result split alone is not the whole story any more — each row
    // renders ONE sentence via activity-sentence.ts. Without this assertion, the OLD
    // label+meta split would still satisfy every check above.
    expect(sentenceSrc).toContain("export function activitySentence");
  });

  it("marks status + activity as aria-live polite regions", () => {
    const live = html.match(/aria-live="polite"/g) ?? [];
    expect(live.length, "aria-live regions").toBeGreaterThanOrEqual(2);
  });

  it("guards every animation behind prefers-reduced-motion", () => {
    expect(html).toContain("@keyframes");
    expect(html).toContain("prefers-reduced-motion");
  });

  it("shows the onboarding verify command", () => {
    // The Docs link is cut entirely in IA v2 (§2 CUT list) — figma-agent status is the
    // one command the onboarding card still points at.
    expect(html).toContain("figma-agent status");
  });
});

// Both blocks share one helper — comments must be stripped before any selector/declaration
// scan, or a sentence like `/* …the ~300px panel… */` or a comment above `.status-dot`
// poisons the match.
/** The chrome, with :root blocks and CSS comments removed — the only safe scan surface. */
const chrome = html
  .replace(/:root\s*\{[\s\S]*?\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");
/** [selectorList, declarations] for every rule in the chrome. */
const rules: [string, string][] = [...chrome.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map((m) => [m[1].trim(), m[2]]);
/** The declarations of the first rule whose selector list contains `sel`. */
const declsFor = (sel: string): string =>
  rules.filter(([s]) => s.split(",").some((one) => one.trim() === sel)).map(([, d]) => d).join(";");

describe("figma-agent panel — the dark skin layer", () => {
  // The skin is only real if it is (a) declared in a :root block, (b) the LAST such block, and
  // (c) actually what the chrome paints with. String-presence alone passes for a dead token.
  const rootBlocks = [...html.matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);

  it("declares the skin tokens inside the LAST :root block", () => {
    const last = rootBlocks.at(-1) ?? "";
    for (const t of ["--fga-body", "--fga-surface", "--fga-divider", "--fga-text", "--fga-radius"]) {
      expect(last, `${t} must be declared in the final :root block`).toContain(t);
    }
    // …and that block must come after the compiled DS block, so it wins the cascade.
    expect(html.lastIndexOf("--fga-body")).toBeGreaterThan(html.indexOf("--color-primary"));
  });

  it("has no dead skin tokens, and no reference to a token that was never declared", () => {
    const declared = [...(rootBlocks.at(-1) ?? "").matchAll(/(--fga-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    expect(declared.length, "skin tokens declared").toBeGreaterThan(8);
    const unused = declared.filter((t) => !chrome.includes(`var(${t})`));
    expect(unused, `unused skin tokens: ${unused.join(", ")}`).toEqual([]);
    // The mirror check: a var(--fga-…) the block never declares is an invalid declaration the
    // browser drops silently (this is how --fga-surface-raised nearly shipped).
    const referenced = [...chrome.matchAll(/var\((--fga-[a-z0-9-]+)/g)].map((m) => m[1]);
    const undeclared = [...new Set(referenced)].filter((t) => !declared.includes(t));
    expect(undeclared, `undeclared tokens referenced: ${undeclared.join(", ")}`).toEqual([]);
  });

  it("uses the reference's dotted section rule and drops the 2px ink rules", () => {
    expect(chrome).toMatch(/border-(top|bottom):\s*1px\s+dotted\s+var\(--fga-divider\)/);
    expect(html).not.toContain("2px solid var(--color-foreground)");
  });

  it("paints the chrome only through vars (no hex, no bare custom-property values)", () => {
    expect(chrome).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);            // mirrors the existing rule
    expect(chrome).toContain("var(--fga-surface)");
    // A declaration like `border: 1px solid --fga-border` is silently dropped by the browser;
    // every --fga-* reference outside :root must be wrapped in var().
    expect(chrome.match(/(?<!var\()--fga-[a-z0-9-]+(?!\s*:)/g) ?? []).toEqual([]);
  });
});
// (Note the hex assertion now runs on the comment-stripped `chrome`, so the sampling
// coordinates in the `:root` provenance comment cannot trip it.)

describe("figma-agent panel — typography contract (owner-locked)", () => {
  it("uses exactly one font family, through the single body var", () => {
    const families = [...chrome.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect([...new Set(families)]).toEqual(["var(--font-family-body)"]);
  });

  it("declares exactly three panel font sizes and uses no other size source", () => {
    const skin = [...html.matchAll(/:root\s*\{([\s\S]*?)\}/g)].at(-1)?.[1] ?? "";
    const declared = [...skin.matchAll(/(--fga-font-[a-z]+)\s*:/g)].map((m) => m[1]).sort();
    expect(declared).toEqual(["--fga-font-body", "--fga-font-caption", "--fga-font-title"]);
    const sizes = [...chrome.matchAll(/font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    const bad = sizes.filter((v) => !/^var\(--fga-font-(title|body|caption)\)$/.test(v));
    expect(bad, `font-size values outside the three tokens: ${bad.join(" | ")}`).toEqual([]);
  });

  it("draws every mark as an SVG — no text glyphs in markup or CSS content", () => {
    const GLYPHS = /[✗✓⟳•✕×↻●○◆▪…]/u;
    expect(GLYPHS.test(chrome), "glyph in CSS/markup").toBe(false);
    const contents = [...chrome.matchAll(/content:\s*(["'])(.*?)\1/g)].map((m) => m[2]);
    expect(contents.filter((c) => c.trim() !== ""), "content: must stay decorative-empty").toEqual([]);
  });

  it("draws every mark as an SVG — no text glyphs in markup, CSS, or the panel scripts", () => {
    // A panel.html-only regex catches neither offender that actually shipped the old glyphs:
    // `panel-ui.ts` wrote `dot.textContent = state === 'failed' ? '✗' : ''` and
    // `panel-model.ts`'s `syncResultLabel` wrote `Synced ✓ — …` — both are JS, not markup.
    // The ellipsis (…) joined the ban post-judge-review: literal `…` had crept into the
    // status/activity sentences (`statusSentence`, `activitySentence`, the sync/running
    // captions) — a text glyph exactly like the others, just easier to miss.
    const GLYPHS = /[✗✓⟳•✕×↻●○◆▪…]/u;
    for (const [name, src] of [["panel.html", chrome], ["panel-ui.ts", panelUi], ["panel-model.ts", model]] as const) {
      expect(GLYPHS.test(src), `glyph in ${name}`).toBe(false);
    }
  });
});

describe("figma-agent panel — IA v2 structure", () => {
  it("ships exactly three blocks, in order, plus the sync prompt", () => {
    const order = ["fga-status", "fga-context", "fga-activity-block", "fga-sync"]
      .map((id) => html.indexOf(`id="${id}"`));
    expect(order.every((i) => i >= 0), `a block container is missing: ${order.join()}`).toBe(true);
    expect(order, "blocks must appear in IA order").toEqual([...order].sort((a, b) => a - b));
    // exactly three block sections — a fourth means the IA drifted
    expect((html.match(/class="[^"]*\bfga-block\b/g) ?? []).length).toBe(3);
  });

  it("keeps every id the panel script resolves, and the live regions", () => {
    for (const id of ["fga-panel", "fga-status", "fga-dot", "fga-sentence", "fga-onboarding",
                      "fga-ctx-file", "fga-ctx-file-note", "fga-ctx-page", "fga-ctx-selection",
                      "fga-activity", "fga-sync", "fga-sync-msg", "fga-sync-now", "fga-sync-later",
                      "fga-version"]) {
      expect(html, `missing #${id}`).toContain(`id="${id}"`);
    }
    expect((html.match(/aria-live="polite"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("has dropped the debug controls entirely — markup AND their dead CSS", () => {
    for (const gone of ["fga-docs", "fga-copy", "fga-toggle", "fga-toggle-label", "fga-expanded",
                        "fga-pill", "fga-meta", "fga-hint",
                        "fga-d-port", "fga-d-proto", "fga-d-heartbeat", "fga-d-attempts",
                        "fga-d-file", "fga-d-page"]) {
      expect(html, `${gone} must be gone`).not.toContain(gone);
    }
  });

  it("has no inset left-bar box-shadow — the owner vetoed the treatment entirely (2026-07-29)", () => {
    // The reference's "active nav item" left-accent-bar signature was tried here (an inset
    // box-shadow on the sync prompt, the onboarding card, and the newest activity row) and
    // rejected outright by the owner on sight — not a color note, the TREATMENT itself. This
    // encodes that taste call as a gate so it cannot silently return in a later pass.
    expect(chrome).not.toMatch(/box-shadow:\s*inset\b/);
  });
});

describe("figma-agent panel — responsive contract (240px → 640px+)", () => {
  // Decorative squares are the ONLY fixed sizes allowed. Matched per INDIVIDUAL selector, after
  // comment stripping — a comment above a rule used to end up inside the "selector".
  // IA v2: the feed's status mark moved from `.log-dot` (a CSS-drawn shape) to
  // `.log-icon-wrap` (a fixed-size SVG wrapper); the toggle's caret icon
  // (`.footer-icon`) is gone with the toggle itself.
  // Phase 03 §1: sizing moved onto the shared `.fga-icon` rule (14px icon grid).
  // Phase 03 §6: the thin scrollbar thumb is a fixed 8px width, decorative chrome.
  const SIZE_WHITELIST = ["\\.status-dot", "\\.log-icon-wrap", "\\.identity-dot",
                          "\\.fga-icon", "::-webkit-scrollbar"];
  const whitelisted = (selList: string): boolean =>
    selList.split(",").every((s) => SIZE_WHITELIST.some((w) => new RegExp(w).test(s)));
  // width | min-width | inline-size | min-inline-size | flex-basis, in px — however it is spelled.
  const FIXED = /(?:^|;|\s)(?:min-)?(?:width|inline-size)\s*:\s*(?:calc\()?\s*\d+px|flex-basis\s*:\s*\d+px/;

  it("declares no fixed width on any layout element", () => {
    const offenders = rules
      .filter(([sel, decls]) => FIXED.test(decls) && !whitelisted(sel))
      .map(([sel]) => sel);
    expect(offenders, `fixed widths outside the whitelist: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("scrolls vertically on the panel and never horizontally", () => {
    // Selector-scoped: "somewhere in the file" would pass with the rule on an unrelated element.
    expect(declsFor(".panel")).toMatch(/overflow-y:\s*auto/);
    expect(declsFor(".panel")).toMatch(/overflow-x:\s*hidden/);
    expect(declsFor(".panel")).not.toMatch(FIXED);
  });

  it("keeps the STATUS HEADER sticky", () => {
    expect(declsFor(".status-hero")).toMatch(/position:\s*sticky/);
    expect(declsFor(".status-hero")).toMatch(/top:\s*0/);
  });

  it("sizes the DETAIL GRID fluidly — no fixed column track", () => {
    const g = declsFor(".detail-grid");
    expect(g).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(\s*\d+px\s*,\s*1fr\s*\)/);
  });

  it("wraps every button/link row", () => {
    // IA v2 (§5): `.footer-actions` (Details/Docs/Copy) is cut with the row it held —
    // `.sync-actions` and `.identity-row` are the surviving wrap-flexed rows.
    for (const sel of [".sync-actions", ".identity-row"]) {
      expect(declsFor(sel), `${sel} must wrap`).toMatch(/flex-wrap:\s*wrap/);
    }
  });

  it("pairs every ellipsis with its overflow + white-space guards", () => {
    const bad = rules
      .filter(([, d]) => /text-overflow:\s*ellipsis/.test(d)
        && !(/overflow:\s*hidden/.test(d) && /white-space:\s*nowrap/.test(d)))
      .map(([sel]) => sel);
    expect(bad, `ellipsis without overflow:hidden + white-space:nowrap: ${bad.join(" | ")}`).toEqual([]);
  });

  it("uses no width breakpoint — the layout is fluid across the whole range", () => {
    expect(chrome).not.toMatch(/@media[^{]*\(\s*(?:min|max)-width/);
  });
});

describe("figma-agent panel — craft floor (phase 03)", () => {
  // A. 4px rhythm — the shared taste linter only sees Tailwind utilities, so this is OUR check.
  // NOTE the calc branch: `calc\([^)]*\)` cannot match the NESTED parens in
  // `calc((1.5em - 14px) / 2)` — the optical-centring rule this very phase introduces would be
  // reported as off-grid. Match calc() permissively instead.
  it("lands every spacing value on the 4px grid", () => {
    const ALLOWED = /^(0|var\(--space-(hair|1|2|3)\)|var\(--fga-divider-gap\)|auto|calc\(.*\))$/;
    const offenders: string[] = [];
    for (const [sel, decls] of rules) {
      for (const m of decls.matchAll(/(?:^|;)\s*(padding|margin|gap|row-gap|column-gap|padding-block|padding-inline)\s*:\s*([^;]+)/g)) {
        for (const part of m[2].trim().split(/\s+(?![^(]*\))/)) {
          if (ALLOWED.test(part)) continue;
          const px = /^(\d+)px$/.exec(part);
          if (px && Number(px[1]) % 4 === 0) continue;      // a literal multiple of 4 is fine
          offenders.push(`${sel} { ${m[1]}: ${part} }`);
        }
      }
    }
    expect(offenders, `off-grid spacing: ${offenders.join(" | ")}`).toEqual([]);
  });

  // B. Two size families and no third: icons 14px, dots 8px — asserted on the RULES, and on
  // actual usage of the class (a rule alone would be dead CSS). `fga-row` is applied both in
  // the static markup (`.status-row`) and dynamically (`panel-ui.ts`'s activity rows); `fga-icon`
  // is applied ONLY dynamically (every icon in this panel is a JS-injected SVG, never a static
  // one) — so "actually applied" is checked across panel.html AND panel-ui.ts, not html alone,
  // or this assertion would fail despite the class being live on every real activity row.
  it("sizes every icon on the 14px grid and every dot at 8px", () => {
    const sizesOf = (sel: string) => [...declsFor(sel).matchAll(/(?:width|height):\s*([^;]+)/g)]
      .map((d) => d[1].trim());
    expect([...new Set(sizesOf(".fga-icon"))]).toEqual(["14px"]);
    expect([...new Set([...sizesOf(".status-dot"), ...sizesOf(".identity-dot")])]).toEqual(["8px"]);
    const iconApplied = /class="[^"]*\bfga-icon\b/.test(html)
      || /className\s*=\s*['"][^'"]*\bfga-icon\b/.test(panelUi);
    expect(iconApplied, "the icon class must actually be applied (markup or panel-ui.ts)").toBe(true);
    const rowApplied = /class="[^"]*\bfga-row\b/.test(html)
      || /className\s*=\s*['"][^'"]*\bfga-row\b/.test(panelUi);
    expect(rowApplied, "the row class must actually be applied (markup or panel-ui.ts)").toBe(true);
  });

  // C. The vetoed left bar can never come back, in any spelling. (The blanket
  // `box-shadow: inset` ban already lives above — kept; this adds the other two spellings
  // and retires the dead token.)
  it("has no left accent bar", () => {
    expect(chrome).not.toMatch(/border-left:\s*(?!0)/);
    expect(chrome).not.toContain("--fga-accent");
  });

  // D. Depth is alpha BORDERS, never an alpha background. taste-lint's mode-invisible-surface does
  // NOT resolve custom properties, so `background: var(--fga-hairline)` would slip past it — this
  // assertion is the only enforcement, and it therefore checks the token names too.
  it("uses low-alpha white only on borders, never on a surface", () => {
    // The phase's own given regex here (`/background(?:-color)?:\s*(rgba\(|var\((--fga-(hairline
    // |topedge))/`) has an unbalanced group — a missing closing paren — and throws
    // "Invalid regular expression" as written. Fixed to the clearly-intended, balanced check:
    // a literal `rgba(` background is caught by the first branch; ANY of the three alpha
    // tokens used as a background (not just hairline/topedge) is caught by the second, which
    // already covers hairline-soft too, so nothing from the original intent is lost.
    const ALPHA_TOKENS = ["--fga-hairline", "--fga-hairline-soft", "--fga-topedge"];
    const bgAlpha = rules
      .filter(([sel]) => !sel.includes("::selection"))            // a text highlight, not a surface
      .filter(([, d]) => /background(?:-color)?:\s*rgba\(/.test(d)
        || ALPHA_TOKENS.some((t) => new RegExp(`background(?:-color)?:\\s*var\\(${t}\\)`).test(d)))
      .map(([s]) => s);
    expect(bgAlpha, `alpha background on: ${bgAlpha.join(" | ")}`).toEqual([]);
    expect(chrome).toMatch(/border:\s*1px\s+solid\s+var\(--fga-hairline\)/);
    expect(chrome).toMatch(/border-top-color:\s*var\(--fga-topedge\)/);
  });

  // E. Focus is visible on every interactive control.
  it("gives both interactive controls a focus-visible ring", () => {
    for (const sel of [".sync-btn:focus-visible", ".inline-link:focus-visible"]) {
      expect(declsFor(sel), `${sel} needs an outline`).toMatch(/outline:\s*2px/);
      expect(declsFor(sel)).toMatch(/outline-offset:/);
    }
  });

  // F. Motion: named properties only, and everything guarded.
  it("names its transitions and guards every one under reduced-motion", () => {
    expect(chrome).not.toMatch(/transition[^;]*:\s*(?:[^;]*\s)?all\b/);
    expect(chrome).not.toMatch(/transition[^;]*:[^;]*\blinear\b/);
    const guard = /@media\s*\(prefers-reduced-motion[^{]*\{([\s\S]*?)\}\s*\}/.exec(html)?.[1] ?? "";
    for (const sel of [".activity-row", ".sync-prompt", ".status-dot"]) {
      expect(guard, `${sel} must be inside the reduced-motion guard`).toContain(sel);
    }
  });

  // G. Type micro-craft is tokenized, not sprinkled — BOTH axes. Raw line-heights currently
  // survive at panel.html:309, :343, :398, :600; they must move to the tokens too, or "deliberate
  // line-heights" is a claim with nothing enforcing it.
  it("declares tracking + line-height per size and uses neither raw", () => {
    for (const t of ["--fga-track-title", "--fga-track-body", "--fga-track-caption",
                     "--fga-lh-title", "--fga-lh-body", "--fga-lh-caption"]) {
      expect(html, `missing ${t}`).toContain(t);
    }
    const rawTrack = [...chrome.matchAll(/letter-spacing:\s*([^;]+)/g)]
      .map((m) => m[1].trim()).filter((v) => !v.startsWith("var(--fga-track-"));
    expect(rawTrack, `raw letter-spacing: ${rawTrack.join(" | ")}`).toEqual([]);
    const rawLh = [...chrome.matchAll(/(?:^|;)\s*line-height:\s*([^;]+)/g)]
      .map((m) => m[1].trim()).filter((v) => !v.startsWith("var(--fga-lh-"));
    expect(rawLh, `raw line-height: ${rawLh.join(" | ")}`).toEqual([]);
  });
});
