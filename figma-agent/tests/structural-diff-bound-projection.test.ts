// spec-005 P17 — a BOUND value's literal is a mode projection, not data.
//
// THE LIVE BUG. On the P16 gate, inner child `…;5198:1124` carries a paint bound to
// `VariableID:5140:17717` (`base/sidebar-foreground`). Both scans recorded the SAME
// binding — the round-trip carried the only thing that IS the data — yet the literal
// colours differ (`r=0` original, `r=0.0392` rebuild) because the rebuild resolves the
// variable in a different MODE. The diff scored a perfect round-trip as data loss. On
// the DS that never fired (one mode); on VSF-PCP, which uses several, it would.
//
// The claim these tests defend is two-sided, and the second half is the load-bearing
// one: a MATCHING binding makes the literal a projection, and NOTHING ELSE does. Every
// forgiving test below has a twin that proves the same code still fails the gate when
// the binding is different, one-sided, or absent — because a literal with no binding
// behind it is the only record of that colour there is.
//
// Shapes here are the walker's real output (plugin/src/main/scan-node-instance.ts,
// instance-inner-visual.ts): a node carries `figmaScanBindings` (raw id, always) and
// `keyedBindings` (publish key, when the variable resolved); an inner child's `visual`
// layer carries `keyedBindings` ONLY. Both must work — the rule reads the object it is
// given, not a path it expects.
import { describe, it, expect } from 'vitest';
import { structuralDiff } from '../cli/src/util/structural-diff.ts';

const VAR_ID = 'VariableID:5140:17717';
const VAR_KEY = 'e3f0a1c2d4b5';

const solid = (r: number) => ({ type: 'SOLID', color: { r, g: 0, b: 0, a: 1 } });

/** A TEXT node as the walker emits it when its fill is bound: literal + both signals. */
const boundText = (r: number, over: Record<string, unknown> = {}) => ({
  type: 'TEXT',
  name: 'Label',
  characters: 'Dashboard',
  fills: [solid(r)],
  textColor: { r, g: 0, b: 0, a: 1 },
  figmaScanBindings: { fills: VAR_ID },
  keyedBindings: { fills: { key: VAR_KEY, name: 'base/sidebar-foreground' } },
  ...over,
});

describe('spec-005 P17 — a matching binding makes the paint literal a projection', () => {
  it('the LIVE case: same binding, different resolved colour → equal, not a diff', () => {
    const { equal, diffs } = structuralDiff(boundText(0), boundText(0.0392));
    expect(equal).toBe(true);
    expect(diffs).toEqual([]);
  });

  it('says out loud what it looked past — never a silent pass', () => {
    const { normalized } = structuralDiff(boundText(0), boundText(0.0392));
    expect(normalized).toEqual([
      expect.stringContaining('fills[0].color'),
      expect.stringContaining('textColor'),
    ]);
    expect(normalized[0]).toContain(VAR_KEY);
    expect(normalized[0]).toContain('projection');
  });

  it('reports NOTHING when the projections happen to agree — the list records what was forgiven, not what is bound', () => {
    expect(structuralDiff(boundText(0), boundText(0)).normalized).toEqual([]);
  });

  it('forgives the literal ONLY — a real change next to it still fails the gate', () => {
    const a = boundText(0);
    const b = boundText(0.0392, { characters: 'Settings' });
    const { equal, diffs } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(diffs).toEqual([{ path: 'characters', left: 'Dashboard', right: 'Settings' }]);
  });
});

describe('spec-005 P17 — and nothing else is forgiven', () => {
  it('a DIFFERENT binding is a real diff: the colours differ AND the binding does', () => {
    const a = boundText(0);
    const b = boundText(0.0392, {
      figmaScanBindings: { fills: 'VariableID:1:1' },
      keyedBindings: { fills: { key: 'other-key', name: 'base/other' } },
    });
    const { equal, diffs, normalized } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(normalized).toEqual([]);
    expect(diffs.map((d) => d.path)).toEqual(expect.arrayContaining([
      'fills[0].color.r', 'keyedBindings.fills.key', 'textColor.r',
    ]));
  });

  it('BOUND on one side, literal on the other is a binding LOST — the reddest case there is', () => {
    const a = boundText(0);
    const { fills, textColor, type, name, characters } = a;
    const b = { type, name, characters, fills: [solid(0.0392)], textColor: { r: 0.0392, g: 0, b: 0, a: 1 } };
    expect(fills).toBeDefined();
    expect(textColor).toBeDefined();
    const { equal, diffs, normalized } = structuralDiff(a, b);
    expect(equal).toBe(false);
    expect(normalized).toEqual([]);
    // Both signals are absent wholesale on the rebuild, so the diff names them at the
    // record itself — the loss is the binding, and the colour is reported beside it.
    expect(diffs.map((d) => d.path)).toEqual(expect.arrayContaining([
      'fills[0].color.r', 'figmaScanBindings', 'keyedBindings',
    ]));
  });

  it('UNBOUND on both sides: the literal IS the data, so a different colour is a loss', () => {
    const bare = (r: number) => ({ type: 'FRAME', name: 'Card', fills: [solid(r)] });
    const { equal, diffs, normalized } = structuralDiff(bare(0), bare(0.0392));
    expect(equal).toBe(false);
    expect(normalized).toEqual([]);
    expect(diffs).toEqual([{ path: 'fills[0].color.r', left: 0, right: 0.0392 }]);
  });

  it('a MULTI-paint fills array keeps its literals: nothing says WHICH paint the one binding names', () => {
    // readBindings records the first bound paint's id for the whole field, so with two
    // paints the spec cannot prove the overlay is bound too. A false red beats
    // forgiving a real loss on the unbound sibling.
    const multi = (r: number) => ({
      type: 'FRAME',
      name: 'Card',
      fills: [solid(r), { type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 0.1 } }],
      figmaScanBindings: { fills: VAR_ID },
      keyedBindings: { fills: { key: VAR_KEY } },
    });
    const { equal, diffs } = structuralDiff(multi(0), multi(0.0392));
    expect(equal).toBe(false);
    expect(diffs).toEqual([{ path: 'fills[0].color.r', left: 0, right: 0.0392 }]);
  });

  it('a binding with NO shared signal is not a match — an id on one side, a key on the other proves nothing', () => {
    const a = { type: 'FRAME', name: 'Card', fills: [solid(0)], figmaScanBindings: { fills: VAR_ID } };
    const b = { type: 'FRAME', name: 'Card', fills: [solid(0.0392)], keyedBindings: { fills: { key: VAR_KEY } } };
    expect(structuralDiff(a, b).equal).toBe(false);
  });
});

describe('spec-005 P17 — the same rule on an inner child, and on scalars', () => {
  it("an inner child's visual layer is bound by KEY alone, and is forgiven the same way", () => {
    const inner = (r: number) => ({
      innerOverrides: [{
        childKey: '5198:1124',
        fields: {},
        visual: {
          fills: [solid(r)],
          keyedBindings: { fills: { key: VAR_KEY, name: 'base/sidebar-foreground' } },
        },
      }],
    });
    const { equal, normalized } = structuralDiff(inner(0), inner(0.0392));
    expect(equal).toBe(true);
    expect(normalized).toEqual([
      expect.stringContaining('innerOverrides[childKey=5198:1124].visual.fills[0].color'),
    ]);
  });

  it('a bound SCALAR resolves per mode by the same mechanism, so its literal goes too', () => {
    const card = (radius: number) => ({
      type: 'FRAME',
      name: 'Card',
      cornerRadius: radius,
      figmaScanBindings: { cornerRadius: VAR_ID },
      keyedBindings: { cornerRadius: { key: VAR_KEY, name: 'radius/card' } },
    });
    const { equal, normalized } = structuralDiff(card(8), card(12));
    expect(equal).toBe(true);
    expect(normalized).toEqual([expect.stringContaining('cornerRadius')]);
  });

  it('an UNBOUND scalar next to a bound one is still compared — the binding names ONE field', () => {
    const card = (radius: number, gap: number) => ({
      type: 'FRAME',
      name: 'Card',
      cornerRadius: radius,
      itemSpacing: gap,
      figmaScanBindings: { cornerRadius: VAR_ID },
    });
    const { equal, diffs } = structuralDiff(card(8, 4), card(12, 16));
    expect(equal).toBe(false);
    expect(diffs).toEqual([{ path: 'itemSpacing', left: 4, right: 16 }]);
  });
});
