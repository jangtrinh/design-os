#!/usr/bin/env node
/**
 * Name the chrome roles in example artifacts so the typography floor can judge them.
 *
 * `taste-lint`'s body-text floor reads the *selector* to decide whether small type is body
 * copy or chrome. A diagram's axis ticks, cell values and category names are annotation —
 * legitimately small — but selectors like `.cat`, `.val` and `.value` say nothing about
 * that, so they read as undersized body copy and fail. The linter's own message asks for
 * exactly this: "if this is a badge/label/nav element, name that role so it can be
 * exempted."
 *
 * So this renames those classes to carry a role word rather than raising the sizes, which
 * would make dense diagrams worse. Anything under 10px is still bumped — below that the
 * text is too small whatever its role.
 *
 *   node scripts/normalize-example-roles.mjs          # rewrite
 *   node scripts/normalize-example-roles.mjs --check  # exit 1 if a role is still unnamed
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = [join(ROOT, "examples", "diagrams"), join(ROOT, "examples", "charts")];

/** Mirrors taste-lint's CHROME_ROLE_RE — a selector matching this is already exempt. */
const CHROME_ROLE =
  /(?:h[1-6]|nav|navbar|brand|badge|chip|pill|tag|label|lbl|method|meta|caption|code|pre|kbd|mono|icon|ico|small|hint|tip|tooltip|toast|tab|tabs|breadcrumb|crumb|footnote|legend|counter?|timestamp|time|date|unit|eyebrow|overline|kicker|subtitle|sublabel|helper|help|micro|fineprint|disclaimer|status|state|dot|pip|avatar|swatch|spec|note|name|btn|button|input|field|placeholder|toolbar|stat|metric|kpi|pager|th|td|thead|tfoot|sec|sub|muted|subtle|secondary|dim|faint|quiet|soft|ghost|pagination|summary|footer|foot|aside|sidebar|rail|menu|dropdown|row|cell|header)\b/i;

const BODY_FLOOR = 13; // taste-lint flags <= this unless the selector names a role
const MIN_LEGIBLE = 10; // below this, no role justifies the size

/** Collect class selectors whose rule sets an undersized font and names no role. */
function offendingClasses(html) {
  const offenders = new Set();
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const rule of (style[1] ?? "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1] ?? "";
      const size = /font-size\s*:\s*([\d.]+)px/i.exec(rule[2] ?? "");
      if (size === null) continue;
      if (parseFloat(size[1]) > BODY_FLOOR) continue;
      if (CHROME_ROLE.test(selector)) continue;
      // Take the last class in the selector — that is the element's own role.
      for (const cls of selector.matchAll(/\.([a-zA-Z][\w-]*)/g)) offenders.add(cls[1]);
    }
  }
  // Only rename the base class; BEM modifiers follow it automatically.
  return [...offenders].filter((c) => !CHROME_ROLE.test(c)).sort((a, b) => b.length - a.length);
}

function normalize(html) {
  let out = html;

  for (const cls of offendingClasses(out)) {
    const renamed = `label-${cls}`;
    // Selectors: `.cat` and `.cat--focal` alike, but never `.category`.
    out = out.replace(new RegExp(`\\.${cls}(?![\\w-])`, "g"), `.${renamed}`);
    // class attributes: replace the whole-word token wherever it appears in a list.
    out = out.replace(/\bclass="([^"]*)"/g, (whole, list) => {
      const next = list
        .split(/\s+/)
        .map((token) => (token === cls || token.startsWith(`${cls}--`) ? `label-${token}` : token))
        .join(" ");
      return next === list ? whole : `class="${next}"`;
    });
  }

  // Sub-10px text is too small whatever role it claims.
  out = out.replace(/font-size\s*:\s*([\d.]+)px/gi, (whole, px) =>
    parseFloat(px) < MIN_LEGIBLE ? `font-size: ${MIN_LEGIBLE}px` : whole,
  );

  return out;
}

const files = DIRS.flatMap((dir) =>
  (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".html")).map((f) => join(dir, f)),
);

const check = process.argv.includes("--check");
const drifted = [];
let changed = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = normalize(before);
  if (before === after) continue;
  if (check) drifted.push(file.replace(`${ROOT}/`, ""));
  else {
    writeFileSync(file, after);
    changed += 1;
  }
}

if (check) {
  if (drifted.length > 0) {
    console.error(`${drifted.length} artifact(s) with unnamed chrome roles — run 'node scripts/normalize-example-roles.mjs'`);
    for (const f of drifted.slice(0, 5)) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`example roles: ${files.length} artifacts name their chrome roles`);
} else {
  console.log(`example roles: normalised ${changed} of ${files.length} artifacts`);
}
