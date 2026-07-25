/**
 * Tenant-contract check functions — the two rule groups tenant-lint.ts orchestrates.
 * Split out of tenant-lint.ts to stay under the repo's 200-line file guideline
 * (mirrors taste-lint.ts importing its checks from taste-checks*.ts).
 *
 * scanJS/scanCSS cover the section-body rules; scanHostAncestors covers the
 * host-ancestor sticky-killer rule. See tenant-lint.ts's module header for the full
 * coverage list, external-file-resolution contract, and honest limitations.
 */
import type { TenantFinding } from "./tenant-lint.js";

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

/** Blank out comments (preserving newlines) so this file's own doc comments — or a
 *  variant's — never self-trigger a rule; only live code is scanned. */
function stripJSComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, (_m, pre: string) => pre);
}

// ─── Section-body (JS) rules ────────────────────────────────────────────────────

interface JsRule {
  rule: string;
  re: RegExp;
  detail: string;
}

const JS_RULES: readonly JsRule[] = [
  // Only the PAGE-level scrollTo is forbidden — a section may call .scrollTo() on
  // an element inside its own subtree (e.g. a nested carousel); that is a legal
  // write to the section's own scope, not a Tenant Law violation. Matching any bare
  // `.scrollTo(` would false-positive on that.
  {
    rule: "window-scrollto",
    re: /\bwindow\.scrollTo\s*\(|\bdocument\.scrollingElement\.scrollTo\s*\(|\bdocumentElement\.scrollTo\s*\(/,
    detail: "calls scrollTo on the page/document root — the page must own scroll position, not the section",
  },
  {
    rule: "window-scrolly",
    re: /\bwindow\.scrollY\b|\bpageYOffset\b/,
    detail: "reads window.scrollY/pageYOffset — progress must come from getBoundingClientRect() only",
  },
  {
    rule: "body-height-write",
    re: /document\.body\.style\.height\s*=/,
    detail: "assigns document.body.style.height to force scroll",
  },
  {
    rule: "scrollingelement-write",
    re: /\.scrollingElement\s*=[^=]/,
    detail: "assigns document.scrollingElement",
  },
  {
    rule: "documentelement-write",
    re: /documentElement\.style\.setProperty\s*\(/,
    detail: "writes a documentElement custom property — state must live on the section root",
  },
  {
    rule: "position-fixed-js",
    re: /position\s*[:=]\s*['"]?fixed['"]?/,
    detail: "sets position:fixed — forbidden inside a section (host-only)",
  },
];

export function scanJS(text: string): TenantFinding[] {
  const out: TenantFinding[] = [];
  const clean = stripJSComments(text);
  for (const { rule, re, detail } of JS_RULES) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = global.exec(clean))) {
      out.push({ rule, line: lineAt(clean, m.index), detail, severity: "error" });
    }
  }
  return out;
}

// ─── Section-body (CSS) rules ───────────────────────────────────────────────────

export function scanCSS(text: string): TenantFinding[] {
  const out: TenantFinding[] = [];

  // :root { --scrub-* } — a scrub custom property leaking onto :root instead of
  // staying namespaced to the section root. A host page's OWN :root block (theme
  // colors, color-scheme, etc.) is none of this guard's business — only
  // --scrub-* declarations inside :root are a Tenant Law violation.
  const rootRe = /:root\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rootRe.exec(text))) {
    const body = m[1] ?? "";
    if (/--scrub-/.test(body)) {
      out.push({
        rule: "root-css-write",
        line: lineAt(text, m.index),
        detail: ":root {} declares a --scrub-* variable — namespace state on .scrub, never :root",
        severity: "error",
      });
    }
  }

  // position:fixed inside any rule whose selector touches .scrub scope.
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  while ((m = ruleRe.exec(text))) {
    const selector = m[1] ?? "";
    const decls = m[2] ?? "";
    if (/\.scrub\b/.test(selector) && /position\s*:\s*fixed\b/.test(decls)) {
      out.push({
        rule: "position-fixed-css",
        line: lineAt(text, m.index),
        detail: `selector "${selector.trim()}" sets position:fixed`,
        severity: "error",
      });
    }
  }

  return out;
}

// ─── Host-ancestor rule (sticky-killer) ─────────────────────────────────────────

interface StickyKiller {
  prop: string;
  re: RegExp;
}

const STICKY_KILLERS: readonly StickyKiller[] = [
  { prop: "overflow", re: /overflow(?:-[xy])?\s*:\s*(hidden|clip|auto)\b/ },
  { prop: "transform", re: /transform\s*:\s*(?!none\b)\S/ },
  { prop: "filter", re: /filter\s*:\s*(?!none\b)\S/ },
  { prop: "perspective", re: /perspective\s*:\s*(?!none\b)\S/ },
  { prop: "contain", re: /contain\s*:\s*(layout|paint|strict)\b/ },
];

const VOID_TAGS = new Set([
  "img", "br", "hr", "input", "link", "meta", "source", "area", "base", "col", "embed", "track", "wbr",
]);

interface StackNode {
  tag: string;
  style: string;
  line: number;
}

/** Walk the HTML tag stack — string/attribute-level ancestor check (documented
 *  limitation, see tenant-lint.ts's module header): checks each ancestor's inline
 *  `style` attribute for sticky-killing properties whenever a `.scrub` descendant
 *  is seen. HTML-only; does not read linked files. */
export function scanHostAncestors(html: string): TenantFinding[] {
  const out: TenantFinding[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  const stack: StackNode[] = [];
  let m: RegExpExecArray | null;

  while ((m = tagRe.exec(html))) {
    const closing = m[1];
    const tag = m[2] ?? "";
    const rawAttrs = m[3] ?? "";
    const selfClose = m[4];
    const lower = tag.toLowerCase();

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.tag === lower) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const classMatch = /\bclass\s*=\s*["']([^"']*)["']/.exec(rawAttrs);
    const styleMatch = /\bstyle\s*=\s*["']([^"']*)["']/.exec(rawAttrs);
    const className = classMatch?.[1] ?? "";
    const style = styleMatch?.[1] ?? "";
    const line = lineAt(html, m.index);

    if (className.split(/\s+/).includes("scrub")) {
      for (const ancestor of stack) {
        for (const killer of STICKY_KILLERS) {
          if (killer.re.test(ancestor.style)) {
            out.push({
              rule: "sticky-killer-ancestor",
              line: ancestor.line,
              detail: `<${ancestor.tag}> (line ${ancestor.line}) sets ${killer.prop} in its inline style — kills position:sticky on descendant .scrub at line ${line}`,
              severity: "error",
            });
          }
        }
      }
    }

    if (!selfClose && !VOID_TAGS.has(lower)) {
      stack.push({ tag: lower, style, line });
    }
  }

  return out;
}
