// Phase 03 — the routing precedence rule, pure: --file (exact) > FIGMA_AGENT_FILE
// (substring) > active plugin. One comparison (`fileMatches`) backs both routing and
// the plugin-side guard, so they can never disagree.
import { describe, it, expect } from 'vitest';
import { resolveRouteFilter, fileMatches } from '../cli/src/transport/route-filter.ts';

describe('resolveRouteFilter — precedence', () => {
  it('--file set + env set → flag wins, exact', () => {
    expect(resolveRouteFilter('VSF - PCP', 'design')).toEqual({ value: 'VSF - PCP', exact: true, source: 'flag' });
  });

  it('only env set → env, substring', () => {
    expect(resolveRouteFilter(undefined, 'design')).toEqual({ value: 'design', exact: false, source: 'env' });
  });

  it('neither set → none, unrestricted', () => {
    expect(resolveRouteFilter(undefined, undefined)).toEqual({ value: null, exact: false, source: 'none' });
    expect(resolveRouteFilter(null, null)).toEqual({ value: null, exact: false, source: 'none' });
  });

  it('a whitespace-only --file is treated as unset — falls through to the env pin', () => {
    expect(resolveRouteFilter('   ', 'design')).toEqual({ value: 'design', exact: false, source: 'env' });
  });

  it('a whitespace-only env pin with no --file → none', () => {
    expect(resolveRouteFilter(undefined, '   ')).toEqual({ value: null, exact: false, source: 'none' });
  });
});

describe('fileMatches', () => {
  it('substring mode is case-insensitive', () => {
    expect(fileMatches('Design System', 'design', false)).toBe(true);
  });

  it('exact mode requires the whole name', () => {
    expect(fileMatches('Design System', 'design', true)).toBe(false);
  });

  it('exact mode trims and lowercases both sides', () => {
    expect(fileMatches('VSF - PCP', ' vsf - pcp ', true)).toBe(true);
  });

  it('null/undefined actual never matches', () => {
    expect(fileMatches(null, 'design', false)).toBe(false);
    expect(fileMatches(undefined, 'design', true)).toBe(false);
  });
});
