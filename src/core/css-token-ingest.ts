/**
 * CSS custom properties → DTCG token tree + modes (D4, spec 009 P3 — "the vocabulary").
 *
 * Input: the `customProperties` array from `ui designmd extract-tokens --css`, each
 * `{name, value, hex?, sources, selectors}`. Output: a two-tier DTCG tree (token-model.ts
 * shape) — a literal value → PRIMITIVE, an alias (`var(--x)`) → SEMANTIC (Insight 4, same
 * split figma-ds-tokens.ts already proved). Selectors become modes via classifySelector
 * (D2): base (`:root`/`@theme`/`html`/`body`) → `$value`; theme selectors →
 * `$extensions["mode.<name>"]` (the shared encoding, token-model.ts). Every token also records the custom property
 * it was read from under `$extensions["design-os.custom-property"]` (CUSTOM_PROPERTY_EXTENSION, token-model.ts).
 *
 * Pure: no filesystem, no network, deterministic. Reuses `inferToken` (token-import.ts)
 * for $type inference and `sanitizeSeg` (figma-ds-tokens.ts) for the alias-safe alphabet.
 */
import { CUSTOM_PROPERTY_EXTENSION, modeExtensionKey } from "./token-model.js";
import type { Token, TokenTree } from "./token-model.js";
import type { CustomPropertyObservation } from "./designmd-token-extractor.js";
import { classifySelector } from "./css-selector-mode.js";
import { computeOwnPath, parseVarRef, resolveValue } from "./css-token-paths.js";
import type { PathInfo } from "./css-token-paths.js";
import { planProperty, settleAliases } from "./css-token-plan.js";
import type { Outcome } from "./css-token-plan.js";
import { buildLedger, rankSelectors } from "./css-token-ledger.js";
import type { CssIngestLedger, LeftOutReason, UnrecognisedSelector } from "./css-token-ledger.js";

export class CssTokenIngestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "CssTokenIngestError";
    this.code = code;
  }
}

// ─── D4: the ingest ─────────────────────────────────────────────────────────

export interface CssIngestResult {
  tree: TokenTree;
  stats: { primitives: number; semantics: number; skipped: number };
  /** Every name that did not land in `tree`, or a declaration that couldn't be placed —
   * recorded, never silently dropped (Art VIII). */
  unverified: { name: string; reason: string }[];
  /** Every input property, written or left out for one named reason: the sum equals `ledger.properties`. */
  ledger: CssIngestLedger;
  /** Selectors no rule maps to a base or a mode, largest first, with the declarations under each. */
  unrecognisedSelectors: UnrecognisedSelector[];
}

/** Build the DTCG token tree from extract-tokens' customProperties. Deterministic, sorted keys. */
export function ingestCssTokens(customProperties: CustomPropertyObservation[]): CssIngestResult {
  const byName = new Map<string, CustomPropertyObservation[]>();
  for (const cp of customProperties) {
    const arr = byName.get(cp.name);
    if (arr) arr.push(cp); else byName.set(cp.name, [cp]);
  }

  const pathByName = new Map<string, PathInfo | null>();
  for (const name of byName.keys()) pathByName.set(name, computeOwnPath(name, byName));

  // Collision guard (D6) — two DIFFERENT declared names landing on the same dotted path.
  // With no prefix stripping this should only fire on a genuine sanitization collision
  // (e.g. differing only by case or an underscore/hyphen) — a real ambiguity, not a
  // false merge. Fail loudly, both source lines; never silently pick one.
  const nameByDotted = new Map<string, string>();
  for (const [name, path] of pathByName) {
    if (path === null) continue;
    const dotted = `${path.category}.${path.leaf}`;
    const prior = nameByDotted.get(dotted);
    if (prior !== undefined && prior !== name) {
      const priorSrc = byName.get(prior)?.[0]?.sources[0] ?? "?";
      const nameSrc = byName.get(name)?.[0]?.sources[0] ?? "?";
      throw new CssTokenIngestError(
        "LEAF_COLLISION",
        `'${prior}' (${priorSrc}) and '${name}' (${nameSrc}) both map to token path '${dotted}' ` +
          `after sanitizing to the alias-safe alphabet — rename one of the source custom properties`,
      );
    }
    nameByDotted.set(dotted, name);
  }

  const outcomes = new Map<string, Outcome>();
  const unrecognised = new Map<string, number>();
  for (const [name, entries] of byName) {
    for (const e of entries) {
      if (classifySelector(e.selectors[0] ?? "").kind === "unmapped") {
        const sel = e.selectors[0] || "(none)";
        unrecognised.set(sel, (unrecognised.get(sel) ?? 0) + 1);
      }
    }
    outcomes.set(name, planProperty(name, entries, pathByName.get(name) ?? null, pathByName));
  }
  const written = settleAliases(outcomes);

  const tree: TokenTree = {};
  const unverified: { name: string; reason: string }[] = [];
  const reasons: LeftOutReason[] = [];
  let primitives = 0, semantics = 0;

  for (const [name, o] of outcomes) {
    for (const note of o.notes) unverified.push({ name, reason: note });
    if (o.kind === "left-out") { reasons.push(o.reason); unverified.push({ name, reason: o.message }); continue; }

    const { path, baseValue, modes } = o.planned;
    const leaf: Token = { $value: baseValue, $type: path.type };
    // The property the token came from: an agent writes `var(--ds-surface)`, never a name derived from the path.
    const extensions: Record<string, unknown> = {};
    for (const [modeName, entry] of modes) {
      const ref = parseVarRef(entry.value);
      const mv = ref !== null && !written.has(ref) ? null : resolveValue(entry.value, name.slice(2), pathByName);
      if (mv !== null) extensions[modeExtensionKey(modeName)] = { $value: mv };
      else unverified.push({ name, reason: ref !== null
        ? `mode '${modeName}' not written: it names '${ref}', which ${byName.has(ref) ? "was left out" : "is not in the input"}`
        : `mode '${modeName}' not written: value '${entry.value}' is not one typed leaf` });
    }
    extensions[CUSTOM_PROPERTY_EXTENSION] = name;
    leaf.$extensions = extensions;

    (tree[path.category] ??= {})[path.leaf] = leaf;
    if (o.planned.aliasOf !== null) semantics++;
    else primitives++;
  }

  const ledger = buildLedger({ properties: byName.size, declarations: customProperties.length, primitives, semantics, reasons });
  return { tree: sortTree(tree), stats: { primitives, semantics, skipped: reasons.length }, unverified, ledger, unrecognisedSelectors: rankSelectors(unrecognised) };
}

function sortTree(tree: TokenTree): TokenTree {
  const out: TokenTree = {};
  for (const cat of Object.keys(tree).sort()) {
    const group = tree[cat] as Record<string, Token>;
    const sorted: Record<string, Token> = {};
    for (const tok of Object.keys(group).sort()) sorted[tok] = group[tok] as Token;
    out[cat] = sorted;
  }
  return out;
}
