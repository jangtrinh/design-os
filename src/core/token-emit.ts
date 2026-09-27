/**
 * Token emitters: resolved map → CSS custom properties, Tailwind v4 @theme,
 * or Figma Tokens Studio flat JSON.
 *
 * All emitters are pure string transforms — no I/O, no side effects.
 * Composite tokens (typography/shadow) expand to per-member CSS properties;
 * a shadow ALSO emits one `box-shadow` composite value under its own path's
 * var name (PR-FU3-r2 A6) — the per-member vars remain for consumers that
 * compose their own box-shadow string from them.
 */
import type { ResolvedMap, ResolvedToken } from "./token-model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a dotted token path to a CSS custom property name. "color.primary" → "--color-primary" */
function pathToCssVar(path: string): string {
  return "--" + path.replace(/\./g, "-");
}

/** Format a single scalar token value as a CSS value string. */
function scalarToCss(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  // A fontFamily token's $value may be a font stack array (PR-FU3-r2 A6):
  // one comma-separated CSS value, quoting any family name with a space.
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" && /\s/.test(v) ? `"${v}"` : String(v))).join(", ");
  }
  return String(value);
}

/**
 * Expand a composite token value to an array of [varName, cssValue] pairs.
 * E.g. a typography token at path "text.body" with members fontFamily, fontSize
 * becomes [["--text-body-font-family", "Inter"], ["--text-body-font-size", "16px"]].
 */
function expandComposite(
  path: string,
  value: Record<string, unknown>,
): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [memberKey, memberVal] of Object.entries(value)) {
    const varName = pathToCssVar(path) + "-" + memberKey.replace(/([A-Z])/g, "-$1").toLowerCase();
    pairs.push([varName, scalarToCss(memberVal)]);
  }
  return pairs;
}

/** True when a shadow value has zero geometry (blur/offsetX/offsetY/spread
 * all 0) — no visible effect. */
function isZeroLength(v: unknown): boolean {
  if (typeof v === "number") return v === 0;
  if (typeof v === "string") return /^0(px)?$/.test(v.trim());
  return false;
}

function isNullShadow(type: string, value: Record<string, unknown>): boolean {
  if (type !== "shadow") return false;
  return isZeroLength(value["blur"]) && isZeroLength(value["offsetX"]) &&
    isZeroLength(value["offsetY"]) && isZeroLength(value["spread"]);
}

/**
 * Build the single `box-shadow` CSS value (`offsetX offsetY blur spread
 * color`, CSS's own box-shadow order) a DTCG shadow composite compiles to
 * (PR-FU3-r2 A6). The per-member vars stay alongside it — an existing
 * consumer (`ds-preview-sections.ts`'s `shadowValue()`) composes its own
 * `box-shadow` string from them directly — this is the additional single
 * value the shadow $type itself is defined to compile to. Returns undefined
 * when a required member is missing (malformed shadow — the per-member
 * expansion still runs on whatever is present).
 */
function shadowToBoxShadow(value: Record<string, unknown>): string | undefined {
  const { offsetX, offsetY, blur, spread, color } = value;
  if ([offsetX, offsetY, blur, spread, color].some((v) => v === undefined)) return undefined;
  return [offsetX, offsetY, blur, spread, color].map(scalarToCss).join(" ");
}

/**
 * Yield all CSS var declarations for a single resolved token.
 *
 * A "null" shadow (zero blur/offset/spread) is omitted entirely (PR-FU3 A3):
 * it has no visible effect, so emitting its members — including a raw hex
 * `color` member the token model has no way to alias back to a color token
 * (a shadow's $value is a plain object, never walked for embedded hexes) —
 * would put a raw hex in the compiled CSS that the gate's raw-hex-when-
 * token-exists check would reject once linked CSS is judged (PR-FU3 A1).
 */
function tokenToCssDecls(token: ResolvedToken): [string, string][] {
  // A fontFamily $value array is ONE font-stack value, never split into
  // per-index -0/-1/-2 variables (PR-FU3-r2 A6 — the kernel could not consume
  // its own persona library's font stacks until this was distinguished from
  // a composite like shadow/typography).
  if (Array.isArray(token.value)) {
    return [[pathToCssVar(token.path), scalarToCss(token.value)]];
  }
  if (typeof token.value === "object" && token.value !== null) {
    const value = token.value as Record<string, unknown>;
    if (isNullShadow(token.type, value)) return [];
    const pairs = expandComposite(token.path, value);
    if (token.type === "shadow") {
      const composite = shadowToBoxShadow(value);
      if (composite !== undefined) pairs.unshift([pathToCssVar(token.path), composite]);
    }
    return pairs;
  }
  return [[pathToCssVar(token.path), scalarToCss(token.value)]];
}

/**
 * Every CSS custom-property name a resolved token map emits (composite
 * members included, e.g. "text.body" → "--text-body-font-family" AND
 * "--text-body-font-size"). The declared-token vocabulary ds-usage-lint.ts
 * checks page CSS against — same expansion emitCss/emitTailwind use, so the
 * declared set never drifts from what a real `ui tokens compile` would emit.
 */
export function declaredCssVarNames(map: ResolvedMap): Set<string> {
  const out = new Set<string>();
  for (const token of map) {
    for (const [varName] of tokenToCssDecls(token)) out.add(varName);
  }
  return out;
}

// ─── CSS emitter ──────────────────────────────────────────────────────────────

/**
 * Emit resolved tokens as CSS custom properties.
 *
 * :root {
 *   --color-primary: #3B82F6;
 *   --text-body-font-family: Inter;
 * }
 */
export function emitCss(map: ResolvedMap): string {
  const lines: string[] = [":root {"];
  for (const token of map) {
    for (const [varName, value] of tokenToCssDecls(token)) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ─── Tailwind v4 emitter ──────────────────────────────────────────────────────

/**
 * Emit resolved tokens as a Tailwind v4 CSS-first @theme block.
 *
 * @theme {
 *   --color-primary: #3B82F6;
 * }
 */
export function emitTailwind(map: ResolvedMap): string {
  const lines: string[] = ["@theme {"];
  for (const token of map) {
    for (const [varName, value] of tokenToCssDecls(token)) {
      lines.push(`  ${varName}: ${value};`);
    }
  }
  lines.push("}");
  return lines.join("\n") + "\n";
}

// ─── Figma Tokens Studio emitter ─────────────────────────────────────────────

/**
 * Emit resolved tokens in Figma Tokens Studio flat format.
 *
 * Re-nests the flat ResolvedMap back into a two-level object:
 * { category: { tokenName: { type, value } } }
 *
 * Composite token members are emitted as a nested object value.
 */
export function emitFigma(map: ResolvedMap): string {
  // Build nested structure preserving insertion order
  const root: Record<string, Record<string, unknown>> = {};

  for (const token of map) {
    const dotIdx = token.path.indexOf(".");
    if (dotIdx === -1) continue; // malformed path — skip

    const category = token.path.slice(0, dotIdx);
    const name = token.path.slice(dotIdx + 1);

    if (root[category] === undefined) {
      root[category] = {};
    }

    const figmaValue =
      typeof token.value === "object" && token.value !== null
        ? token.value
        : token.value;

    (root[category] as Record<string, unknown>)[name] = {
      type: token.type,
      value: figmaValue,
    };
  }

  return JSON.stringify(root, null, 2) + "\n";
}
