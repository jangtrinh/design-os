// Phase 02 — `ui.setProps` (backlog 3.1 + 3.2): resolvePropKey's pure name-matching
// contract, plus one integration case proving an INSTANCE_SWAP property accepts a
// component KEY (not just a node id) and is verified through the mock's STRICT
// setProperties (mock-figma.ts:442-470) — never a permissive stub.
import { describe, it, expect, beforeEach } from 'vitest';
import { installMockFigma, setMockComponents, makeMockComponent, FakeNode } from './helpers/mock-figma.ts';
import { resolvePropKey, setProps } from '../plugin/src/main/exec-stdlib-instance.ts';

describe('resolvePropKey (pure)', () => {
  it('exact hit wins', () => {
    expect(resolvePropKey(['Icon', 'Label'], 'Icon')).toBe('Icon');
  });

  it('falls back to the unique `name#id` suffix key', () => {
    expect(resolvePropKey(['Icon#12:34', 'Label#56:78'], 'Icon')).toBe('Icon#12:34');
  });

  it('0 matches → throws listing available names', () => {
    expect(() => resolvePropKey(['Icon', 'Label'], 'Icn')).toThrow(/Icon, Label/);
  });

  it('≥2 matches → throws ambiguous, listing the matches', () => {
    expect(() => resolvePropKey(['Icon#1:1', 'Icon#2:2'], 'Icon'))
      .toThrow(/ambiguous.*Icon#1:1.*Icon#2:2/s);
  });
});

describe('setProps — INSTANCE_SWAP by component key (integration, strict mock)', () => {
  beforeEach(() => { installMockFigma(); });

  it('resolves a component KEY to the target main\'s id via importComponentByKeyAsync', async () => {
    const iconStar = makeMockComponent('Icon Star', 'KEY-ICON-STAR');
    const main = makeMockComponent('Button');
    main.componentPropertyDefinitions = {
      Icon: { type: 'INSTANCE_SWAP' },
      Label: { type: 'TEXT' },
    };
    const iconDefault = makeMockComponent('Icon Default');
    setMockComponents([main, iconStar, iconDefault]);
    const inst = main.createInstance() as unknown as FakeNode & { componentProperties: unknown };
    inst.componentProperties = {
      Icon: { type: 'INSTANCE_SWAP', value: iconDefault.id },
      Label: { type: 'TEXT', value: 'hi' },
    };

    const result = await setProps(inst as never, { Icon: 'KEY-ICON-STAR', Label: 'hello' });

    expect(result.Icon).toBe(iconStar.id);
    expect(result.Label).toBe('hello');
  });

  it('an unknown property throws E_EVAL listing the available names', async () => {
    const main = makeMockComponent('Button');
    main.componentPropertyDefinitions = { Label: { type: 'TEXT' } };
    setMockComponents([main]);
    const inst = main.createInstance() as unknown as FakeNode & { componentProperties: unknown };
    inst.componentProperties = { Label: { type: 'TEXT', value: 'hi' } };

    await expect(setProps(inst as never, { Lbel: 'x' })).rejects.toThrow(/Label/);
  });
});

describe('setProps — re-read assertion (Codex round 1, finding 4)', () => {
  it('a BOOLEAN re-read as the string "true" must throw — Object.is catches the type mismatch', async () => {
    // A minimal instance-shaped stand-in, not the mock-figma FakeNode: this reproduces a host
    // that stores booleans as strings internally on re-read, which `String(actual) !== String(value)`
    // would have missed ("true" stringifies equal to true) and `Object.is` correctly does not.
    const inst = {
      type: 'INSTANCE',
      name: 'Toggle',
      componentProperties: { Enabled: { type: 'BOOLEAN', value: false } },
      setProperties(props: Record<string, unknown>) {
        this.componentProperties = {
          Enabled: { type: 'BOOLEAN', value: props.Enabled === true ? 'true' : 'false' },
        };
      },
    };

    await expect(setProps(inst as never, { Enabled: true })).rejects.toThrow(/still true/);
  });
});
