/**
 * Origin attribution for `ui gate` findings — authored, kit or framework.
 *
 * Why: on a real React + Tailwind v4 + component-kit site every view failed the
 * gate with ~900 errors, nearly all emitted by the framework's runtime variables
 * or by an unmodified kit. A gate that is red on every view cannot go red on
 * real authored debt, and a builder then "explained away" 169 authored arbitrary
 * font sizes as "framework origin" by hand. Attribution has to be mechanical, and
 * it has to fail SAFE.
 *
 * The rule, in order:
 *  1. A finding's SUBJECTS are what it is about: the rule's own `subjects`, else
 *     the `--custom-properties` its message names, else the classes / keyframes
 *     of the CSS rule its line sits in.
 *  2. A subject is AUTHORED when it appears in the authored sources (`--src`
 *     minus `--kit`). Authored wins over everything: a framework-looking name an
 *     author also writes is the author's.
 *  3. Else FRAMEWORK when it is a custom property only a framework emits by
 *     itself (Tailwind's runtime/theme namespaces, Radix/Base UI runtime vars).
 *  4. Else FRAMEWORK when a package the project imports declares it: CSS reached
 *     from a bare `@import` / side-effect import into node_modules
 *     (gate-origin-packages.ts) — found by following imports, never hand-listed.
 *     For a class, the kit check (5) runs first: a kit that uses a package class
 *     owns that usage.
 *  5. Else KIT when it appears in the unmodified kit sources (`--kit`).
 *  6. Anything else — no subject, or a subject found nowhere — is AUTHORED, with
 *     the reason printed. Unknown never becomes "not my problem".
 * A finding is non-authored only when EVERY subject is; then KIT if any subject
 * is kit, else FRAMEWORK, else TOOL.
 *
 * TOOL is the gate's own raw-HTML convention, not a defect in any source: the
 * `img-onerror` repair (inline `onerror` + picsum fallback script) applies to every
 * `<img>` of a page rendered by a component framework, which handles image errors
 * in its own code. Its subject is `@tool <repair id>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { FloorFindingBase } from "./finding-schema.js";
import { indexStyleRegions, subjectsOf } from "./gate-origin-subjects.js";
import type { PackageCss } from "./gate-origin-packages.js";
import { classesOf, containsName, containsToken, declaresClass, escapeRe } from "./gate-origin-text-match.js";

export { classesOf } from "./gate-origin-text-match.js";

export type FindingOrigin = "authored" | "kit" | "framework" | "tool";
export const FINDING_ORIGINS: readonly FindingOrigin[] = ["authored", "kit", "framework", "tool"];

/**
 * Custom properties a framework writes on its own. Deliberately NOT `--color-*`
 * or `--font-*` in general — those namespaces are where a design system declares
 * its own tokens — only Tailwind's default palette/families by exact name.
 */
const FRAMEWORK_VAR: RegExp[] = [
  /^--tw(?:-|$)/, // Tailwind runtime (ring, shadow, transform, gradient, …) and its `var(--tw)` support probe
  /^--default-/, // Tailwind default font/transition vars
  /^--spacing$/,
  /^--(?:container|text|font-weight|tracking|leading|radius|shadow|inset-shadow|drop-shadow|text-shadow|blur|perspective|aspect|ease|animate|breakpoint)-/,
  /^--color-(?:black|white)$/,
  /^--color-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(?:50|[1-9]00|950)$/,
  /^--font-(?:sans|serif|mono)$/,
  /^--radix-/, // Radix primitives runtime
  /^--(?:anchor|available)-(?:width|height)$/, // Base UI / floating-ui popup runtime
  /^--transform-origin$/,
];

export interface OriginSources {
  /** Text of the authored sources (`--src` minus `--kit`). Undefined = not given. */
  authored?: string;
  /** Text of the unmodified kit sources (`--kit`). Undefined = not given. */
  kit?: string;
  /** CSS of the packages the project imports (node_modules), each with its name. */
  packages?: readonly PackageCss[];
}

export interface OriginContext extends OriginSources {
  /** The ORIGINAL page (finding lines index it). */
  html: string;
}

export interface Attributed {
  origin: FindingOrigin;
  originReason: string;
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|css|scss|sass|less|vue|svelte|astro|html?|mdx)$/i;
const SKIP_DIR = new Set(["node_modules", "dist", "build", ".git", ".next", ".turbo", "coverage"]);

/** Concatenate the source text under `paths` (files or folders), skipping anything under `exclude`. */
export function readSourceText(paths: readonly string[], exclude: readonly string[] = []): string {
  const ex = exclude.map((p) => resolve(p));
  const isExcluded = (abs: string): boolean => ex.some((e) => abs === e || abs.startsWith(e + sep));
  const parts: string[] = [];
  const walk = (abs: string): void => {
    if (isExcluded(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) if (!SKIP_DIR.has(name)) walk(join(abs, name));
    } else if (SOURCE_EXT.test(abs)) {
      parts.push(stripComments(readFileSync(abs, "utf8")));
    }
  };
  for (const p of paths) walk(resolve(p));
  return parts.join("\n");
}

/**
 * Comments are prose, not usage: "switches the transition off" in a CSS comment
 * must not make the `transition` utility authored. Block, HTML and `//` line
 * comments go; a `//` right after `:` (a URL) stays.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(^|[^:\\"'`])\/\/[^\n]*/g, "$1");
}

/** Build an attributor for one page; caches per-subject verdicts. */
export function createOriginAttributor(ctx: OriginContext): (f: FloorFindingBase) => Attributed {
  const subjectCache = new Map<string, Attributed>();
  const styleIndex = indexStyleRegions(ctx.html);

  const classify = (subject: string): Attributed => {
    const hit = subjectCache.get(subject);
    if (hit !== undefined) return hit;
    const verdict = classifySubject(subject, ctx);
    subjectCache.set(subject, verdict);
    return verdict;
  };

  return (f) => {
    const subjects = subjectsOf(f, styleIndex);
    if (subjects.length === 0) return { origin: "authored", originReason: "no attributable subject — counted as authored" };
    const verdicts = subjects.map((s) => ({ s, v: classify(s) }));
    const authored = verdicts.find((x) => x.v.origin === "authored");
    if (authored !== undefined) return { origin: "authored", originReason: `${authored.s}: ${authored.v.originReason}` };
    const pick = verdicts.find((x) => x.v.origin === "kit") ?? verdicts.find((x) => x.v.origin === "framework") ?? verdicts[0];
    return { origin: pick!.v.origin, originReason: `${pick!.s}: ${pick!.v.originReason}` };
  };
}

/** One subject → its origin. Subjects are `--var`, `.class`, `@keyframes name`, or a selector chain. */
function classifySubject(subject: string, ctx: OriginSources): Attributed {
  if (subject.startsWith("@tool ")) return { origin: "tool", originReason: `${subject.slice("@tool ".length)} is the autofixer's raw-HTML convention, not a defect in a source` };
  if (subject.startsWith("--")) {
    if (ctx.authored !== undefined && containsName(ctx.authored, subject)) return { origin: "authored", originReason: "named in the authored sources" };
    if (FRAMEWORK_VAR.some((re) => re.test(subject))) return { origin: "framework", originReason: "a framework runtime variable" };
    const pkg = ctx.packages?.find((p) => containsName(p.text, subject));
    if (pkg !== undefined) return packageVerdict(pkg, "declared");
    if (ctx.kit !== undefined && containsName(ctx.kit, subject)) return { origin: "kit", originReason: "named only in the kit sources" };
    return { origin: "authored", originReason: ctx.kit === undefined ? "not a framework variable (pass --kit to attribute kit names)" : "found in neither the kit nor a framework" };
  }
  if (subject.startsWith("@keyframes ")) return classifyKeyframes(subject.slice("@keyframes ".length).trim(), ctx);
  const tokens = classesOf(subject);
  if (tokens.length === 0) return { origin: "authored", originReason: "a selector with no class to attribute" };
  for (const t of tokens) {
    if (ctx.authored !== undefined && containsToken(ctx.authored, t)) return { origin: "authored", originReason: `'${t}' is used in the authored sources` };
  }
  if (ctx.authored !== undefined && ctx.kit !== undefined && tokens.every((t) => containsToken(ctx.kit!, t))) return { origin: "kit", originReason: "used only in the kit sources" };
  const pkg = ctx.packages?.find((p) => tokens.every((t) => declaresClass(p.text, t)));
  if (pkg !== undefined) return packageVerdict(pkg, "a class");
  if (ctx.authored === undefined || ctx.kit === undefined) return { origin: "authored", originReason: "class origin needs --kit and --src" };
  return { origin: "authored", originReason: "a class found in neither the authored nor the kit sources" };
}

/**
 * A keyframes block belongs to whoever runs it: its name, or the `animate-<name>`
 * utility (under any variant, e.g. `data-open:animate-accordion-down`).
 */
function classifyKeyframes(name: string, ctx: OriginSources): Attributed {
  const used = (text: string): boolean => containsName(text, name) || containsName(text, `animate-${name}`);
  if (ctx.authored !== undefined && used(ctx.authored)) return { origin: "authored", originReason: `'${name}' is run from the authored sources` };
  if (ctx.authored !== undefined && ctx.kit !== undefined && used(ctx.kit)) return { origin: "kit", originReason: `'${name}' is run only from the kit sources` };
  const pkg = ctx.packages?.find((p) => new RegExp(`@keyframes\\s+${escapeRe(name)}(?![\\w-])`).test(p.text));
  if (pkg !== undefined) return packageVerdict(pkg, "keyframes");
  if (ctx.authored === undefined || ctx.kit === undefined) return { origin: "authored", originReason: "keyframes origin needs --kit and --src" };
  return { origin: "authored", originReason: "keyframes run from neither the authored nor the kit sources" };
}

/** A package-declared subject: framework, naming the package and the import that brought it. */
function packageVerdict(pkg: PackageCss, what: string): Attributed {
  return { origin: "framework", originReason: `${what} in the package '${pkg.name}' (node_modules), imported by ${relative(process.cwd(), pkg.importer) || pkg.importer}` };
}
