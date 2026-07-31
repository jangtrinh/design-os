// `ui.boundFill` must verify the bind landed on the FIELD the caller asked for, never on any
// field the node happens to carry a matching variable id under. The previous check searched
// every key of `node.boundVariables` for the variable id, so a variable already bound to an
// UNRELATED field (e.g. a prior call's `strokes` bind, still sitting on the node) false-verified
// a bind that never actually took on the field the caller just asked for (`fills`).
//
// The mock mirrors a paint bind (fills/strokes) onto `node.boundVariables[field]` as a
// `VariableAlias[]`, exactly as Figma does live (read-back convenience; the paint's own
// `boundVariables.color` stays the authoritative bind — see mock-figma.ts's fills/strokes
// setters). That mirror is what the first two tests below prove end-to-end: a REAL bind, through
// the REAL bindVariableToField, is correctly recognised by `readBindings` (scan-node-utils.ts).
//
// The THIRD test needed a different construction. In this mock (matching live Figma) a
// structurally-valid bind essentially never fails to take, so calling boundFill twice for the
// SAME variable on two different fields makes BOTH really land — there is no write-failure mode
// to trigger honestly through the public API. What actually needs protecting is the CONSUMPTION
// side: boundFill must trust only the requested field's own (re-keyed) entries, never any other
// key `readBindings` happens to report. That is tested directly by controlling what
// `readBindings` reports — the field-scoping decision is the same regardless of why the
// requested field's entry is missing (a genuine write failure being one real-world cause).
import { describe, it, expect, vi } from 'vitest';
import {
  installMockFigma, setMockLocalVariables, makeMockVariable, type FakeNode,
} from './helpers/mock-figma.ts';

vi.mock('../plugin/src/main/scan-node-utils.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../plugin/src/main/scan-node-utils.ts')>();
  return { ...actual, readBindings: vi.fn(actual.readBindings) };
});

import { readBindings } from '../plugin/src/main/scan-node-utils.ts';
import { createExecStdlib } from '../plugin/src/main/exec-stdlib.ts';

describe('ui.boundFill — field-scoped verification', () => {
  it('defaults to fills and verifies it landed there', async () => {
    const figma = installMockFigma();
    const variable = makeMockVariable('Brand/Primary', 'COLOR');
    setMockLocalVariables([variable]);
    const node = figma.createFrame() as unknown as FakeNode;

    const stdlib = createExecStdlib();
    const result = await stdlib.boundFill(node as never, variable.name);

    expect(result).toEqual({ id: node.id, field: 'fills', variable: variable.name });
  });

  it('binds a variable to a scalar field (cornerRadius) and verifies it landed there', async () => {
    const figma = installMockFigma();
    const variable = makeMockVariable('Radius/sm', 'FLOAT');
    setMockLocalVariables([variable]);
    const node = figma.createFrame() as unknown as FakeNode;

    const stdlib = createExecStdlib();
    const result = await stdlib.boundFill(node as never, variable.name, 'cornerRadius');

    expect(result).toEqual({ id: node.id, field: 'cornerRadius', variable: variable.name });
  });

  it('throws when the shared binding reader shows the variable bound only to a DIFFERENT field — never false-verifies across fields', async () => {
    const figma = installMockFigma();
    const variable = makeMockVariable('Brand/Primary', 'COLOR');
    setMockLocalVariables([variable]);
    const node = figma.createFrame() as unknown as FakeNode;

    // readBindings genuinely reports the variable bound only to strokes — the exact shape a
    // field-scoped check must refuse, regardless of why `fills` is missing from it.
    vi.mocked(readBindings).mockReturnValue({ strokes: variable.id });

    const stdlib = createExecStdlib();
    await expect(stdlib.boundFill(node as never, variable.name, 'fills')).rejects.toThrow(/did not take/);
  });
});
