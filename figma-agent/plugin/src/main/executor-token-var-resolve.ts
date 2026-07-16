// spec-005 P6 — the emitter half of the mirror's binding contract.
//
// THE GAP THIS CLOSES: a scanned spec records its bindings as token NAMES
// (scan-token-refs.bindingsToTokenRefs). Rebuilding that spec is the reverse
// trip — but the only name→Variable map the build path had was the one
// `createVariablesFromTokens` derives from `payload.tokens`. A rebuild FROM A
// SPEC ALONE carries no tokens, so that map came back empty and every tokenRef
// silently lost its binding. The round-trip looked like a fixed point only
// because the harness handed the builder the tokens by hand.
//
// The fix is to resolve a tokenRef against the variables the FILE already has,
// looked up by name — the exact inverse of the id→name join the scanner does.
//
// WHY NOT REUSE createVariablesFromTokens: its de-dup (findReusableVariable)
// matches by VALUE, so feeding it synthesised tokens to force a map would mint
// duplicate variables in the owner's file whenever a value drifted. This module
// never creates a variable; it only ever binds to one that already exists.

import type { FigmaExportTokens } from '../../../shared/figma-payload-types';
import { createVariablesFromTokens } from './executor-variables';
import { pushImportWarning } from './executor-styles';

/** True when the payload carries no token of any kind (the rebuild-from-spec case). */
function tokensAreEmpty(tokens: FigmaExportTokens): boolean {
  return !(tokens.colors?.length || tokens.spacing?.length || tokens.radii?.length);
}

/**
 * name → Variable for every LOCAL variable in the file, read in ONE async call.
 *
 * First occurrence wins on a duplicate name (Figma permits the same name across
 * collections): the scanner's id→name map is many-to-one in the same direction,
 * so neither side can do better than pick deterministically.
 *
 * Library / remote variables are NOT listed by getLocalVariablesAsync — a
 * tokenRef naming one stays unresolvable here and surfaces as an import warning
 * at bind time (applyTokenRefs), which is the same known edge spec-005 P1
 * documented on the scan side.
 */
export async function readLocalVariableMap(): Promise<Map<string, Variable>> {
  const byName = new Map<string, Variable>();
  try {
    for (const v of await figma.variables.getLocalVariablesAsync()) {
      if (!byName.has(v.name)) byName.set(v.name, v);
    }
  } catch (err) {
    // A file we cannot enumerate binds nothing; it must not abort the import.
    pushImportWarning(`local variable lookup failed — tokenRefs left unbound: ${String(err)}`);
  }
  return byName;
}

/**
 * The build path's name → Variable map: the file's existing local variables,
 * overlaid with whatever `payload.tokens` produced.
 *
 * Precedence is payload-over-local ON PURPOSE — a payload that ships tokens is
 * authoritative about what those names mean, so this stays byte-identical to the
 * pre-P6 behaviour for every caller that passes tokens. The local map is a
 * FALLBACK: it can only fill names the payload never spoke for.
 *
 * With empty tokens we skip createVariablesFromTokens entirely rather than let it
 * mint an empty "EaseDesign Tokens" collection as a side effect of a rebuild that
 * asked for no tokens at all.
 */
export async function resolveTokenVars(tokens: FigmaExportTokens): Promise<Map<string, Variable>> {
  const resolved = await readLocalVariableMap();
  if (tokensAreEmpty(tokens)) return resolved;
  for (const [name, variable] of await createVariablesFromTokens(tokens)) {
    resolved.set(name, variable);
  }
  return resolved;
}
