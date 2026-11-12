/**
 * CSS custom properties → DTCG token tree + modes (D4, spec 009 P3 — "the vocabulary").
 *
 * Input: the `customProperties` array from `ui designmd extract-tokens --css`, each
 * `{name, value, hex?, sources, selectors}`. Output: a two-tier DTCG tree (token-model.ts
 * shape) — a literal value → PRIMITIVE, an alias (`var(--x)`) → SEMANTIC (Insight 4, same
 * split figma-ds-tokens.ts already proved). Selectors become modes via classifySelector
 * (D2): base (`:root`/`@theme`/`html`/`body`) → `$value`; theme selectors →
 * `$extensions["mode.<name>"]` (the shared encoding, token-model.ts).
 *
 * Pure: no filesystem, no network, deterministic. Reuses `inferToken` (token-import.ts)
 * for $type inference and `sanitizeSeg` (figma-ds-tokens.ts) for the alias-safe alphabet.
 */
import { modeExtensionKey } from "./token-model.js";
import type { Token, TokenTree } from "./token-model.js";
import type { CustomPropertyObservation } from "./designmd-token-extractor.js";
import { classifySelector } from "./css-selector-mode.js";
import { computeOwnPath, resolveValue } from "./css-token-paths.js";
import type { PathInfo } from "./css-token-paths.js";

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

  const tree: TokenTree = {};
  const unverified: { name: string; reason: string }[] = [];
  let primitives = 0, semantics = 0, skipped = 0;

  for (const [name, entries] of byName) {
    const path = pathByName.get(name) ?? null;
    if (path === null) { skipped++; unverified.push({ name, reason: `unmappable value on every declaration (e.g. '${entries[0]?.value}')` }); continue; }

    const classified = entries.map((e) => ({ e, cls: classifySelector(e.selectors[0] ?? "") }));
    for (const { e, cls } of classified) {
      if (cls.kind === "unmapped") {
        unverified.push({ name, reason: `declaration under unrecognized selector '${e.selectors[0] || "(none)"}' (${e.sources[0] ?? "?"}) — not a mode` });
      }
    }

    const baseEntry = classified.find((c) => c.cls.kind === "base")?.e;
    const modeGroups = new Map<string, CustomPropertyObservation>();
    for (const { e, cls } of classified) {
      if (cls.kind === "modes") for (const m of cls.names) if (!modeGroups.has(m)) modeGroups.set(m, e);
    }

    if (baseEntry === undefined) {
      skipped++;
      const modeList = [...modeGroups.keys()];
      unverified.push({
        name,
        reason: modeList.length > 0
          ? `declared only under mode(s) ${modeList.join(", ")} — no base value; not promoted (D2)`
          : "no recognised base/mode selector for any declaration",
      });
      continue;
    }

    const leafRaw = name.slice(2);
    const baseValue = resolveValue(baseEntry.value, leafRaw, pathByName);
    if (baseValue === null) { skipped++; unverified.push({ name, reason: `could not resolve value '${baseEntry.value}'` }); continue; }

    const leaf: Token = { $value: baseValue, $type: path.type };
    const extensions: Record<string, unknown> = {};
    for (const [modeName, entry] of modeGroups) {
      const mv = resolveValue(entry.value, leafRaw, pathByName);
      if (mv !== null) extensions[modeExtensionKey(modeName)] = { $value: mv };
    }
    if (Object.keys(extensions).length > 0) leaf.$extensions = extensions;

    (tree[path.category] ??= {})[path.leaf] = leaf;
    if (typeof leaf.$value === "string" && /^\{.+\}$/.test(leaf.$value)) semantics++;
    else primitives++;
  }

  return { tree: sortTree(tree), stats: { primitives, semantics, skipped }, unverified };
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
