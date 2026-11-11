/**
 * Two token files that both claim to be the source of a project (spec 033 FR-011, FR-017): the sealed store
 * `design/design.tokens.json` and the hand-edited `design/tokens.json`. One comparison, shared by `ui design lint`
 * (the `two-token-sources` finding) and the `source-authority` question, so the finding and the question can never
 * disagree about whether the two files differ.
 */
import { canonicalStringify } from "./ds-manifest.js";

function parseJson(text: string | null): unknown {
  if (text === null) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Leaf tokens of a DTCG document as path -> serialized $value (null when the text is not a JSON object). */
export function tokenValues(text: string | null): Map<string, string> | null {
  const doc = parseJson(text);
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const out = new Map<string, string>();
  const visit = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return;
    const rec = node as Record<string, unknown>;
    // The kernel's canonical rule (sorted keys), so key order inside an object value is not a difference.
    if ("$value" in rec) { out.set(path, canonicalStringify(rec["$value"])); return; }
    for (const k of Object.keys(rec).sort()) if (!k.startsWith("$")) visit(rec[k], path === "" ? k : `${path}.${k}`);
  };
  visit(doc, "");
  return out;
}

export interface TokenSourceDiff {
  sealedTokens: number;
  otherTokens: number;
  /** Tokens whose path exists only in the sealed store / only in the other file. */
  onlyInSealed: number;
  onlyInOther: number;
  /** Paths in both with a different value. */
  differentValue: number;
  /** True when the two token sets are identical. */
  same: boolean;
}

/** null when either text is not a readable token document: an unreadable file is not a comparison. */
export function diffTokenSources(sealedText: string | null, otherText: string | null): TokenSourceDiff | null {
  const sealed = tokenValues(sealedText);
  const other = tokenValues(otherText);
  if (sealed === null || other === null) return null;
  const onlyInSealed = [...sealed.keys()].filter((k) => !other.has(k)).length;
  const onlyInOther = [...other.keys()].filter((k) => !sealed.has(k)).length;
  const differentValue = [...sealed].filter(([k, v]) => other.has(k) && other.get(k) !== v).length;
  return {
    sealedTokens: sealed.size, otherTokens: other.size, onlyInSealed, onlyInOther, differentValue,
    same: onlyInSealed === 0 && onlyInOther === 0 && differentValue === 0,
  };
}
