// spec-005 P14 — the Filter drawer's two residual diffs, and the clobber behind them.
//
// LIVE EVIDENCE (scratchpad/p14-evidence-filterdrawer-binding.json, 25579:376846):
//   children[2].figmaScanBindings  {fills: "VariableID:1:148"} → null
//   children[2].tokenRefs          {fill: "tailwind colors/base/black"} → null
// with ZERO import warnings — nothing failed. That absence was the tell.
//
// children[2] is an INSTANCE, `_Sheet`. A read-only probe settled it: its
// `overrides` is EMPTY and its main component's fills carry the very same
// VariableID:1:148. The binding was never an override at all — the instance inherits
// it, free, the moment createInstance() runs. We then destroyed it ourselves.
//
// THE MECHANISM. executor-instance re-applies a node-level field only when it
// "differs" from what the main gives — but `fillsDiffer` compared a LIVE Paint
// (carrying visible / blendMode / boundVariables) against a payload-derived one
// (carrying none of them) through JSON.stringify. Those never match, so the guard
// answered "differ" for EVERY instance ever rebuilt, and the write below it stamped
// literal paints over the main's bound ones. Nothing threw; the binding just stopped
// existing. The fix compares through `asFills` — the walker's own lens — so both
// sides speak the payload's vocabulary and a spec that merely echoes the main is
// recognised as such.
//
// This suite is the linter for that standard (Art II): the emitter is `fillsDiffer`,
// and what follows is the check that fails without it.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockComponents, setMockLocalVariables, setMockVariableCollections,
  makeMockVariable, FakeNode, type FakeVariable,
} from './helpers/mock-figma.ts';
import type { FigmaExportNode, FigmaExportTokens } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { resolveTokenVars } = await import('../plugin/src/main/executor-token-var-resolve.ts');
const { getImportWarnings, resetImportWarnings } = await import('../plugin/src/main/executor-styles.ts');

const NO_TOKENS: FigmaExportTokens = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };

/** The alias a paint-copy binding leaves on the first paint's color. */
const fillAliasOf = (node: Record<string, unknown>): string | undefined => {
  const paints = node.fills as Array<{ boundVariables?: { color?: { id: string } } }> | undefined;
  return paints?.[0]?.boundVariables?.color?.id;
};

let black: FakeVariable;

/**
 * The live `_Sheet`: a main whose FIRST fill is bound to a variable, second is not.
 * Two fills on purpose — the live node has exactly that, and a single-fill fixture
 * would not notice a builder that dropped the tail.
 */
function mainSheet(): FakeNode {
  const comp = new FakeNode('COMPONENT');
  comp.name = '_Sheet';
  comp.key = 'KEY-SHEET';
  comp.width = 384;
  comp.height = 900;
  comp.fills = [
    {
      type: 'SOLID',
      color: { r: 0, g: 0, b: 0 },
      boundVariables: { color: { type: 'VARIABLE_ALIAS', id: black.id } },
    },
    { type: 'SOLID', opacity: 0.2, color: { r: 1, g: 1, b: 1 } },
  ];
  return comp;
}

/** What the walker scanned off the live instance: the main's fills, flattened. */
const sheetSpec = (): FigmaExportNode => ({
  type: 'INSTANCE',
  name: '_Sheet',
  componentKey: 'KEY-SHEET',
  width: 384,
  height: 900,
  fills: [
    { type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } },
    { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.2 } },
  ],
  tokenRefs: { fill: 'tailwind colors/base/black' },
});

const rebuild = async (spec: FigmaExportNode): Promise<Record<string, unknown>> => {
  const tokenVars = await resolveTokenVars(NO_TOKENS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), tokenVars as any);
  if (!node) throw new Error('builder returned null');
  return node as unknown as Record<string, unknown>;
};

beforeEach(() => {
  resetImportWarnings();
  black = makeMockVariable('tailwind colors/base/black');
  black.id = 'VariableID:1:148';
  setMockLocalVariables([black]);
  setMockVariableCollections([]);
  setMockComponents([mainSheet()]);
});

describe('spec-005 P14 — an instance whose fills come from its main', () => {
  it('keeps the variable binding it inherited — the builder must not write over it', async () => {
    const node = await rebuild(sheetSpec());

    // The whole residual: this was `undefined` before the fix.
    expect(fillAliasOf(node)).toBe('VariableID:1:148');
  });

  it('leaves the main\'s paints untouched rather than minting a spurious override', async () => {
    const node = await rebuild(sheetSpec());

    // Not merely "a binding exists" — the main's ENTIRE paint stack survives intact,
    // second fill and all. Re-writing it would be an override the source never had.
    expect(node.fills).toEqual(mainSheet().fills);
    expect(getImportWarnings()).toEqual([]);
  });

  it('STILL writes fills the instance genuinely overrides', async () => {
    // The guard must not overshoot into "never write fills on an instance": a real
    // override has to land, even though landing it costs the inherited binding (a
    // loss the gate reports honestly, as figmaScanBindings — not one we hide).
    const spec = sheetSpec();
    spec.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }];
    delete spec.tokenRefs;

    const node = await rebuild(spec);

    const paints = node.fills as Array<{ color: { r: number } }>;
    expect(paints).toHaveLength(1);
    expect(paints[0].color.r).toBe(1);
  });
});
