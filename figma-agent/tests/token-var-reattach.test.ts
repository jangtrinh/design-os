// spec-005 P6 — the OFFLINE proof that a rebuild FROM A SPEC ALONE reattaches its
// token bindings.
//
// WHY THIS SUITE EXISTS: scan-node-fixed-point's `roundTrips` hands the builder the
// token collection by hand ("Both passes see the SAME token collection"). That is a
// fair question to ask, but it is NOT the question the mirror asks. The mirror
// rebuilds a component from its sidecar spec — a payload with NO tokens — and the
// build path's only name→Variable map came from those very tokens. So P1's "binding
// survives" held in the harness and dropped on a real canvas: a gap a green fixture
// suite could not see, exactly the class of miss the repo's own rule warns about.
//
// Every test here therefore withholds payload.tokens and asserts against the file's
// EXISTING local variables — the state a real rebuild actually runs in.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  installMockFigma, setMockLocalVariables, setMockVariableCollections,
  makeMockVariable, type FakeVariable,
} from './helpers/mock-figma.ts';
import type { FigmaExportNode, FigmaExportTokens } from '../shared/figma-payload-types.ts';

beforeAll(() => { installMockFigma(); });

const { createFigmaNode } = await import('../plugin/src/main/executor-frame.ts');
const { resolveTokenVars, readLocalVariableMap } = await import('../plugin/src/main/executor-token-var-resolve.ts');
const { getImportWarnings, resetImportWarnings } = await import('../plugin/src/main/executor-styles.ts');

const NO_TOKENS: FigmaExportTokens = { colors: [], typography: [], spacing: [], radii: [], shadows: [] };

/** The alias the mock records on a bound scalar field. */
const aliasOf = (bound: unknown): string | undefined => (bound as { id?: string } | undefined)?.id;
/** The alias a paint-copy binding stamps on the first paint's color. */
const paintAliasOf = (node: Record<string, unknown>, field: string): string | undefined => {
  const paints = node[field] as Array<{ boundVariables?: { color?: { id: string } } }> | undefined;
  return paints?.[0]?.boundVariables?.color?.id;
};

/** Build a spec the way the mirror does: through the REAL builder, tokens withheld. */
async function rebuildFromSpecAlone(spec: FigmaExportNode): Promise<Record<string, unknown>> {
  const tokenVars = await resolveTokenVars(NO_TOKENS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = await createFigmaNode(spec as any, new Map(), tokenVars as any);
  if (!node) throw new Error('builder returned null');
  return node as unknown as Record<string, unknown>;
}

beforeEach(() => {
  resetImportWarnings();
  setMockLocalVariables([]);
  setMockVariableCollections([]);
});

describe('readLocalVariableMap — the name→Variable join', () => {
  it('keys the file\'s local variables by name', async () => {
    const primary = makeMockVariable('color.primary');
    const gap = makeMockVariable('space.md', 'FLOAT');
    setMockLocalVariables([primary, gap]);

    const map = await readLocalVariableMap();

    expect(map.get('color.primary')).toBe(primary);
    expect(map.get('space.md')).toBe(gap);
    expect(map.size).toBe(2);
  });

  it('keeps the FIRST of a duplicated name (deterministic, as Figma permits dupes)', async () => {
    const first = makeMockVariable('color.primary');
    const second = makeMockVariable('color.primary');
    setMockLocalVariables([first, second]);

    expect((await readLocalVariableMap()).get('color.primary')).toBe(first);
  });

  it('never mints a variable — the file\'s local list is untouched', async () => {
    const before: FakeVariable[] = [makeMockVariable('color.primary')];
    setMockLocalVariables(before);

    await resolveTokenVars(NO_TOKENS);

    expect(await figma.variables.getLocalVariablesAsync()).toHaveLength(1);
  });
});

describe('rebuild from spec alone — bindings REATTACH by name (the P6 gap)', () => {
  it('binds a FRAME fill tokenRef to the existing variable, with NO payload tokens', async () => {
    const primary = makeMockVariable('color.primary');
    setMockLocalVariables([primary]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      tokenRefs: { fill: 'color.primary' },
    });

    // The binding the pre-P6 gate dropped on the floor.
    expect(paintAliasOf(frame, 'fills')).toBe(primary.id);
    expect(getImportWarnings()).toEqual([]);
  });

  it('binds scalar refs (radius → cornerRadius, gap → itemSpacing)', async () => {
    const radius = makeMockVariable('radius.lg', 'FLOAT');
    const gap = makeMockVariable('space.md', 'FLOAT');
    setMockLocalVariables([radius, gap]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      layoutMode: 'VERTICAL', itemSpacing: 12, cornerRadius: 8,
      tokenRefs: { radius: 'radius.lg', gap: 'space.md' },
    });

    const bound = frame.boundVariables as Record<string, unknown>;
    expect(aliasOf(bound.cornerRadius)).toBe(radius.id);
    expect(aliasOf(bound.itemSpacing)).toBe(gap.id);
  });

  it('binds a uniform padding ref to all four sides', async () => {
    const pad = makeMockVariable('space.lg', 'FLOAT');
    setMockLocalVariables([pad]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      layoutMode: 'VERTICAL', paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
      tokenRefs: { padding: 'space.lg' },
    });

    const bound = frame.boundVariables as Record<string, unknown>;
    for (const side of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      expect(aliasOf(bound[side])).toBe(pad.id);
    }
  });

  it('binds a TEXT child\'s textColor ref (the builder recurses with the same map)', async () => {
    const ink = makeMockVariable('color.ink');
    setMockLocalVariables([ink]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50, layoutMode: 'VERTICAL',
      children: [{
        type: 'TEXT', name: 'Title', characters: 'Hello', fontSize: 16,
        textColor: { r: 1, g: 1, b: 1, a: 1 },
        tokenRefs: { textColor: 'color.ink' },
      }],
    });

    const text = (frame.children as Array<Record<string, unknown>>)[0];
    expect(paintAliasOf(text, 'fills')).toBe(ink.id);
  });

  it('binds a RECTANGLE\'s fill ref', async () => {
    const accent = makeMockVariable('color.accent');
    setMockLocalVariables([accent]);

    const rect = await rebuildFromSpecAlone({
      type: 'RECTANGLE', name: 'Swatch', width: 24, height: 24,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      tokenRefs: { fill: 'color.accent' },
    });

    expect(paintAliasOf(rect, 'fills')).toBe(accent.id);
  });
});

describe('unresolvable ref — honest, not silent (the library/remote edge)', () => {
  it('warns and keeps the literal fill when NO variable carries the name', async () => {
    setMockLocalVariables([makeMockVariable('color.other')]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      fills: [{ type: 'SOLID', color: { r: 0.5, g: 0, b: 0, a: 1 } }],
      tokenRefs: { fill: 'color.fromLibrary' },
    });

    expect(paintAliasOf(frame, 'fills')).toBeUndefined();
    // The literal survives — a missed binding degrades, never destroys.
    // (A Figma paint carries RGB in `color` and alpha in `opacity`.)
    expect((frame.fills as Array<{ color: unknown }>)[0].color).toEqual({ r: 0.5, g: 0, b: 0 });
    expect(getImportWarnings().join('\n')).toContain('color.fromLibrary');
  });

  it('warns rather than crashing when the file has NO variables at all', async () => {
    setMockLocalVariables([]);

    const frame = await rebuildFromSpecAlone({
      type: 'FRAME', name: 'Card', width: 100, height: 50,
      tokenRefs: { fill: 'color.primary' },
    });

    expect(frame.name).toBe('Card'); // built fine
    expect(getImportWarnings().join('\n')).toContain('color.primary');
  });
});

describe('the pre-P6 flow is untouched (payload tokens stay authoritative)', () => {
  const TOKENS: FigmaExportTokens = {
    colors: [{ name: 'color.primary', color: { r: 1, g: 0, b: 0, a: 1 } }],
    typography: [], spacing: [], radii: [], shadows: [],
  };

  it('a payload token WINS over a same-named local variable', async () => {
    const stale = makeMockVariable('color.primary');
    setMockLocalVariables([stale]);

    const tokenVars = await resolveTokenVars(TOKENS);

    // createVariablesFromTokens minted a variable for the payload's value; the
    // fallback must not shadow it.
    expect(tokenVars.get('color.primary')).not.toBe(stale);
    expect(tokenVars.get('color.primary')?.name).toBe('color.primary');
  });

  it('a payload token still binds when the file had no variable (P3 leg B intact)', async () => {
    setMockLocalVariables([]);
    const tokenVars = await resolveTokenVars(TOKENS);

    const node = await createFigmaNode(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        type: 'FRAME', name: 'Card', width: 100, height: 50,
        fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
        tokenRefs: { fill: 'color.primary' },
      } as any,
      new Map(),
      tokenVars as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );

    expect(paintAliasOf(node as unknown as Record<string, unknown>, 'fills'))
      .toBe(tokenVars.get('color.primary')?.id);
  });

  it('empty tokens mint NO collection (a rebuild asks for none)', async () => {
    setMockLocalVariables([]);
    await resolveTokenVars(NO_TOKENS);

    expect(await figma.variables.getLocalVariableCollectionsAsync()).toEqual([]);
  });
});
