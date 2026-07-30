// Registry-integrity phase 01 (5.1) — file↔project binding, pure core. Mirrors
// tests/edit-feed-log.test.ts's tmp-dir shape for the fs-touching pieces.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bindCacheFile,
  bindMarkerPath,
  fileIdentity,
  isUsable,
  loadBindIndex,
  needsAliasPromotion,
  readBindCache,
  readBindMarker,
  recordBinding,
  removeBinding,
  resolveProjectDir,
  writeBindCache,
  writeBindMarker,
  type Binding,
} from '../cli/src/transport/project-bind.ts';

let dirA: string;
let dirB: string;
let cacheFile: string;
const prevCacheEnv = process.env['FIGMA_AGENT_BINDS_FILE'];

beforeEach(() => {
  dirA = mkdtempSync(join(tmpdir(), 'fa-bind-a-'));
  dirB = mkdtempSync(join(tmpdir(), 'fa-bind-b-'));
  cacheFile = join(mkdtempSync(join(tmpdir(), 'fa-bind-cache-')), 'binds.json');
  process.env['FIGMA_AGENT_BINDS_FILE'] = cacheFile;
});

afterEach(() => {
  if (prevCacheEnv === undefined) delete process.env['FIGMA_AGENT_BINDS_FILE'];
  else process.env['FIGMA_AGENT_BINDS_FILE'] = prevCacheEnv;
  rmSync(dirA, { recursive: true, force: true });
  rmSync(dirB, { recursive: true, force: true });
});

describe('fileIdentity — fileKey → slugged fileName → unknown', () => {
  it('prefers fileKey verbatim', () => {
    expect(fileIdentity('ABC123', 'ignored')).toBe('ABC123');
  });
  it('slugs fileName when fileKey is absent', () => {
    expect(fileIdentity(null, 'VSF - PCP')).toBe('vsf-pcp');
  });
  it('falls back to "unknown" when neither is usable', () => {
    expect(fileIdentity(null, null)).toBe('unknown');
    expect(fileIdentity('', '')).toBe('unknown');
  });
});

describe('isUsable — target must still look like a project', () => {
  it('true when <projectDir>/design exists', () => {
    mkdirSync(join(dirA, 'design'), { recursive: true });
    expect(isUsable({ projectDir: dirA, source: 'bind', at: 1 })).toBe(true);
  });
  it('false once the project has moved/vanished', () => {
    expect(isUsable({ projectDir: join(dirA, 'nope'), source: 'bind', at: 1 })).toBe(false);
  });
});

describe('resolveProjectDir — precedence, no guessing', () => {
  it('unknown identity → null (never a cwd fallback)', () => {
    const index = new Map<string, Binding>();
    expect(resolveProjectDir('nowhere', index)).toBeNull();
  });

  it('a bind beats a request regardless of recency', () => {
    mkdirSync(join(dirA, 'design'), { recursive: true });
    mkdirSync(join(dirB, 'design'), { recursive: true });
    const index = new Map<string, Binding>();
    recordBinding(index, 'id1', { projectDir: dirA, source: 'bind', at: 1 });
    recordBinding(index, 'id1', { projectDir: dirB, source: 'request', at: 999 }); // later, but weaker
    expect(resolveProjectDir('id1', index)).toBe(dirA);
  });

  it('a request is used when no bind exists', () => {
    mkdirSync(join(dirB, 'design'), { recursive: true });
    const index = new Map<string, Binding>();
    recordBinding(index, 'id2', { projectDir: dirB, source: 'request', at: 5 });
    expect(resolveProjectDir('id2', index)).toBe(dirB);
  });

  it('an explicit bind can replace a prior bind (re-bind)', () => {
    mkdirSync(join(dirA, 'design'), { recursive: true });
    mkdirSync(join(dirB, 'design'), { recursive: true });
    const index = new Map<string, Binding>();
    recordBinding(index, 'id3', { projectDir: dirA, source: 'bind', at: 1 });
    recordBinding(index, 'id3', { projectDir: dirB, source: 'bind', at: 2 });
    expect(resolveProjectDir('id3', index)).toBe(dirB);
  });

  it('a binding whose design/ has vanished refuses instead of falling back', () => {
    const index = new Map<string, Binding>();
    recordBinding(index, 'id4', { projectDir: join(dirA, 'moved-away'), source: 'bind', at: 1 });
    expect(resolveProjectDir('id4', index)).toBeNull();
  });
});

describe('bind marker persistence — <projectDir>/design/figma-bind.json', () => {
  it('read → null when absent', () => {
    expect(readBindMarker(dirA)).toBeNull();
  });
  it('round-trips write → read', () => {
    const marker = { v: 1 as const, bindings: [{ fileKey: 'abc', fileNameSlug: 'vsf-pcp', boundAt: 42 }] };
    writeBindMarker(dirA, marker);
    expect(readBindMarker(dirA)).toEqual(marker);
    expect(bindMarkerPath(dirA)).toBe(join(dirA, 'design', 'figma-bind.json'));
  });
  it('malformed marker → null, never throws', () => {
    mkdirSync(join(dirA, 'design'), { recursive: true });
    writeFileSync(bindMarkerPath(dirA), 'not json');
    expect(readBindMarker(dirA)).toBeNull();
  });
});

describe('bind cache — restart-survival list of project dirs', () => {
  it('empty when absent', () => {
    expect(readBindCache()).toEqual({ v: 1, projectDirs: [] });
  });
  it('round-trips + de-duplicates', () => {
    writeBindCache([dirA, dirB, dirA]);
    expect(readBindCache().projectDirs.sort()).toEqual([dirA, dirB].sort());
  });
  it('honours FIGMA_AGENT_BINDS_FILE', () => {
    expect(bindCacheFile()).toBe(cacheFile);
  });
});

describe('loadBindIndex — startup rebuild', () => {
  it('drops a cached dir that no longer looks like a project', () => {
    writeBindCache([join(dirA, 'gone')]);
    const { index, usableDirs } = loadBindIndex();
    expect(index.size).toBe(0);
    expect(usableDirs).toEqual([]);
  });

  it('loads a survivor project\'s marker into the index under BOTH aliases', () => {
    writeBindMarker(dirA, { v: 1, bindings: [{ fileKey: 'key1', fileNameSlug: 'vsf-pcp', boundAt: 10 }] });
    writeBindCache([dirA]);
    const { index, usableDirs } = loadBindIndex();
    expect(usableDirs).toEqual([dirA]);
    expect(resolveProjectDir('key1', index)).toBe(dirA);
    expect(resolveProjectDir('vsf-pcp', index)).toBe(dirA);
  });

  it('two markers claiming the SAME identity — newest boundAt wins, regardless of cache order (finding 5)', () => {
    mkdirSync(join(dirA, 'design'), { recursive: true });
    mkdirSync(join(dirB, 'design'), { recursive: true });
    // dirA is the OLDER binding, dirB is the NEWER re-bind elsewhere — a stale duplicate
    // marker left behind in dirA after the file moved to dirB.
    writeBindMarker(dirA, { v: 1, bindings: [{ fileKey: 'key1', fileNameSlug: 'vsf-pcp', boundAt: 10 }] });
    writeBindMarker(dirB, { v: 1, bindings: [{ fileKey: 'key1', fileNameSlug: 'vsf-pcp', boundAt: 20 }] });

    writeBindCache([dirA, dirB]); // older listed first
    let { index } = loadBindIndex();
    expect(resolveProjectDir('key1', index)).toBe(dirB);
    expect(resolveProjectDir('vsf-pcp', index)).toBe(dirB);

    writeBindCache([dirB, dirA]); // shuffled — older listed LAST this time
    ({ index } = loadBindIndex());
    expect(resolveProjectDir('key1', index)).toBe(dirB);
    expect(resolveProjectDir('vsf-pcp', index)).toBe(dirB);
  });
});

describe('needsAliasPromotion — explicit bind replaces a weaker alias, always (finding 4, part 1)', () => {
  const target: Binding = { projectDir: '/tmp/fixture-project', source: 'bind', at: 100 };

  it('no existing alias → needs promotion', () => {
    expect(needsAliasPromotion(undefined, target)).toBe(true);
  });

  it('a WEAKER request-sourced alias must be replaced, not treated as already-handled', () => {
    const weaker: Binding = { projectDir: target.projectDir, source: 'request', at: 50 };
    expect(needsAliasPromotion(weaker, target)).toBe(true);
  });

  it('a STALE bind pointing at a different project must be replaced', () => {
    const stale: Binding = { projectDir: '/somewhere/else', source: 'bind', at: 10 };
    expect(needsAliasPromotion(stale, target)).toBe(true);
  });

  it('an IDENTICAL prior promotion is a no-op', () => {
    const same: Binding = { projectDir: target.projectDir, source: 'bind', at: 1 }; // `at` may differ
    expect(needsAliasPromotion(same, target)).toBe(false);
  });
});

describe('removeBinding — unbind drops EVERY alias, not just the caller\'s one key (finding 4, part 2)', () => {
  it('removes every key passed, leaving unrelated identities untouched', () => {
    const index = new Map<string, Binding>([
      ['vsf-pcp', { projectDir: '/p', source: 'bind', at: 1 }],
      ['key1', { projectDir: '/p', source: 'bind', at: 1 }],
      ['other-file', { projectDir: '/p', source: 'bind', at: 1 }],
    ]);
    removeBinding(index, ['vsf-pcp', 'key1']);
    expect(index.has('vsf-pcp')).toBe(false);
    expect(index.has('key1')).toBe(false);
    expect(index.has('other-file')).toBe(true);
  });

  it('removing a key that was never present is a no-op', () => {
    const index = new Map<string, Binding>();
    expect(() => removeBinding(index, ['nope'])).not.toThrow();
    expect(index.size).toBe(0);
  });
});
