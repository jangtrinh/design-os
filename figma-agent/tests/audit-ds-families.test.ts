// Redundant-family clustering tests (v2): axis-values + name-suffix (moved from the detect
// suite and adapted for normalized-name gating), plus the new variant-structure pass and the
// cross-pass dedupe. normalizeName strips a leading ❌ so tombstones don't fake a family.
import { describe, it, expect } from 'vitest';
import { detectFamilies, normalizeName } from '../cli/src/commands/audit-ds-families.ts';
import type { CrossMasterGroup } from '../cli/src/commands/audit-ds-structure.ts';
import type { AuditComponentFact } from '../shared/audit-types.ts';

function comp(over: Partial<AuditComponentFact> & { id: string; name: string }): AuditComponentFact {
  return {
    id: over.id,
    key: over.key ?? null,
    name: over.name,
    type: over.type ?? 'COMPONENT',
    variantCount: over.variantCount ?? 0,
    variantAxes: over.variantAxes ?? {},
    pageName: over.pageName ?? 'Page 1',
    section: over.section === undefined ? '01 · Primitives' : over.section,
    deprecatedData: over.deprecatedData ?? false,
    width: over.width ?? 0,
    height: over.height ?? 0,
    unboundFills: over.unboundFills ?? 0,
    unboundStrokes: over.unboundStrokes ?? 0,
    units: over.units ?? [],
  };
}

describe('detectFamilies', () => {
  it('normalizeName strips a leading ❌ tombstone marker', () => {
    expect(normalizeName('❌ Data class')).toBe('Data class');
    expect(normalizeName('  ❌  Frame ')).toBe('Frame');
    expect(normalizeName('Button')).toBe('Button');
  });

  it('axis-values: ≥3 shared values across ≥2 distinct normalized names → one family', () => {
    const vals = ['Approved', 'Pending', 'Rejected', 'Superseded'];
    const { families, flaggedById } = detectFamilies([
      comp({ id: 'p1', name: 'Service & API status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Status: vals } }),
      comp({ id: 'p2', name: 'Table status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { State: vals } }),
      comp({ id: 'p3', name: 'MR status', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Kind: vals } }),
    ]);
    const fam = families.filter((f) => f.reason === 'axis-values');
    expect(fam).toHaveLength(1);
    expect(fam[0].members).toEqual(['MR status', 'Service & API status', 'Table status']);
    expect((flaggedById.get('p1') ?? []).some((f) => f.id === 'redundant-family')).toBe(true);
    expect((flaggedById.get('p3') ?? []).some((f) => f.id === 'redundant-family')).toBe(true);
  });

  it('name-suffix: shared UI-part suffix across ≥2 names → one family; a lone suffix does not', () => {
    const { families, flaggedById } = detectFamilies([
      comp({ id: 'm1', name: 'BudgetMeter' }),
      comp({ id: 'm2', name: 'QuotaMeter' }),
      comp({ id: 'solo', name: 'HeaderBar' }),
    ]);
    const fam = families.filter((f) => f.reason === 'name-suffix');
    expect(fam).toHaveLength(1);
    expect(fam[0].signature).toBe('Meter');
    expect(fam[0].members).toEqual(['BudgetMeter', 'QuotaMeter']);
    expect((flaggedById.get('m1') ?? []).some((f) => f.id === 'redundant-family')).toBe(true);
    expect((flaggedById.get('solo') ?? []).length).toBe(0);
  });

  it('tombstone pair (X vs ❌ X) is NOT a family (normalized names collapse to one)', () => {
    const vals = ['Con', 'Internal', 'Public', 'Re'];
    const { families } = detectFamilies([
      comp({ id: 'a', name: 'Data class', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Access: vals } }),
      comp({ id: 'b', name: '❌ Data class', type: 'COMPONENT_SET', variantCount: 4, variantAxes: { Access: vals } }),
    ]);
    expect(families).toHaveLength(0);
  });

  it('variant-structure: cross-master group with distinct names → family (text:{…} + struct:… signatures)', () => {
    const textGroup: CrossMasterGroup = { hash: 'abcd1234ef', masters: ['Service status', 'Table status'], texts: ['Status', 'Label'] };
    const { families } = detectFamilies([
      comp({ id: 'A', name: 'Service status', type: 'COMPONENT_SET', variantCount: 1 }),
      comp({ id: 'B', name: 'Table status', type: 'COMPONENT_SET', variantCount: 1 }),
    ], [textGroup]);
    const fam = families.filter((f) => f.reason === 'variant-structure');
    expect(fam).toHaveLength(1);
    expect(fam[0].members).toEqual(['Service status', 'Table status']);
    expect(fam[0].signature).toBe('text:{Status, Label}');

    // no texts → a stable struct: signature from the hash prefix.
    const structGroup: CrossMasterGroup = { hash: 'deadbeef99', masters: ['X box', 'Y box'], texts: [] };
    const r2 = detectFamilies([], [structGroup]);
    expect(r2.families[0].signature).toBe('struct:deadbeef');
  });

  it('cross-pass dedupe: same members via axis AND structure → ONE family, axis-values wins', () => {
    const vals = ['Approved', 'Pending', 'Rejected'];
    const comps = [
      comp({ id: 'A', name: 'Service status', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { Status: vals } }),
      comp({ id: 'B', name: 'Table status', type: 'COMPONENT_SET', variantCount: 3, variantAxes: { Status: vals } }),
    ];
    const group: CrossMasterGroup = { hash: 'abcd1234ef', masters: ['Service status', 'Table status'], texts: ['Status'] };
    const { families } = detectFamilies(comps, [group]);
    expect(families).toHaveLength(1);
    expect(families[0].reason).toBe('axis-values'); // pass a runs first and claims the member key
  });
});
