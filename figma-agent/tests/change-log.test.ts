// spec 004 P1 — the broker's change-log fs layer: append-only JSONL, one frame
// per line, cursor = line count. Mirrors the design-memory ledger; this is the
// on-disk contract reconcile (P2/P4) walks.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHANGE_LOG_FILENAME, UNBOUND_STAGING_DIRNAME, appendChangeFrames, changeLogDir,
  changeLogLineCount, changeLogPath, changeLogPathFor, migratedMarkerPath, migrateStagedChanges,
  unboundStagingPath,
} from '../cli/src/transport/change-log.ts';
import { CHANGE_LOG_SCHEMA_VERSION, type ComponentChange } from '../shared/figma-changes.ts';

const change = (over: Partial<ComponentChange>): ComponentChange => ({
  op: 'updated', nodeId: 'n1', nodeName: 'Button', nodeType: 'COMPONENT',
  changedProps: ['fills'], origin: 'LOCAL', ...over,
});

let dir: string;
let path: string;
const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-changes-'));
  process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
  path = changeLogPath();
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
  else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
  rmSync(dir, { recursive: true, force: true });
});

const readLines = (): string[] => readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);

describe('changeLogDir / changeLogPath — env override', () => {
  it('honours FIGMA_AGENT_CHANGES_DIR and names the file', () => {
    expect(changeLogDir()).toBe(dir);
    expect(changeLogPath()).toBe(join(dir, CHANGE_LOG_FILENAME));
  });
  it('defaults to <cwd>/design when the env is unset', () => {
    delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    expect(changeLogDir()).toBe(join(process.cwd(), 'design'));
  });
});

describe('appendChangeFrames — one JSONL line per change', () => {
  it('writes a well-formed frame line for each change and creates the dir', () => {
    const written = appendChangeFrames(
      path,
      [change({ nodeId: 'a' }), change({ nodeId: 'b', op: 'deleted', nodeName: null, origin: 'REMOTE' })],
      { page: 'Components', fileKey: 'KEY1' },
      42,
    );
    expect(written).toBe(2);
    const lines = readLines();
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({
      v: CHANGE_LOG_SCHEMA_VERSION, ts: 42, op: 'updated', nodeId: 'a',
      scopeHint: 'local', page: 'Components', fileKey: 'KEY1',
    });
    const second = JSON.parse(lines[1]);
    expect(second).toMatchObject({ op: 'deleted', nodeId: 'b', origin: 'REMOTE', scopeHint: 'global', nodeName: null });
  });

  it('appends across calls (append-only, never truncates)', () => {
    appendChangeFrames(path, [change({ nodeId: 'a' })], { page: 'P', fileKey: null }, 1);
    appendChangeFrames(path, [change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 2);
    expect(readLines().map((l) => JSON.parse(l).nodeId)).toEqual(['a', 'b']);
  });

  it('skips malformed entries but keeps the valid ones (untrusted wire input)', () => {
    const batch = [
      change({ nodeId: 'ok' }),
      { op: 'updated' } as unknown as ComponentChange, // no nodeId
      { nodeId: 'x', op: 'bogus' } as unknown as ComponentChange, // bad op
      null as unknown as ComponentChange,
    ];
    const written = appendChangeFrames(path, batch, { page: 'P', fileKey: null }, 1);
    expect(written).toBe(1);
    expect(readLines()).toHaveLength(1);
    expect(JSON.parse(readLines()[0]).nodeId).toBe('ok');
  });

  it('writes nothing (no file) for an empty batch', () => {
    const written = appendChangeFrames(path, [], { page: 'P', fileKey: null }, 1);
    expect(written).toBe(0);
  });
});

describe('changeLogPathFor — rooted at an explicit project, not the broker cwd', () => {
  it('names the same file under <projectDir>/design', () => {
    expect(changeLogPathFor('/tmp/some-project')).toBe(join('/tmp/some-project', 'design', CHANGE_LOG_FILENAME));
  });
});

describe('unboundStagingPath / migrateStagedChanges — registry-integrity fix round finding 1', () => {
  it('stages beside the default change log, never inside a project design/', () => {
    expect(unboundStagingPath('vsf-pcp')).toBe(join(dir, UNBOUND_STAGING_DIRNAME, 'vsf-pcp.jsonl'));
  });

  it('migrating an absent staging file is a no-op (0 migrated)', () => {
    const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
    expect(migrateStagedChanges(unboundStagingPath('nope'), bound)).toBe(0);
    expect(existsSync(bound)).toBe(false);
  });

  it('stage → bind → migrated count matches + staging file is gone', () => {
    const staging = unboundStagingPath('vsf-pcp');
    appendChangeFrames(staging, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
    expect(readFileSync(staging, 'utf8').split('\n').filter(Boolean)).toHaveLength(2);

    const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
    const migrated = migrateStagedChanges(staging, bound);
    expect(migrated).toBe(2);
    expect(existsSync(staging)).toBe(false);
    expect(readFileSync(bound, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).nodeId)).toEqual(['a', 'b']);
  });

  it('a second migrate of the same file is idempotent — no duplicates', () => {
    const staging = unboundStagingPath('vsf-pcp');
    appendChangeFrames(staging, [change({ nodeId: 'a' })], { page: 'P', fileKey: null }, 1);
    const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
    expect(migrateStagedChanges(staging, bound)).toBe(1);
    expect(migrateStagedChanges(staging, bound)).toBe(0); // staging already gone — nothing re-copied
    expect(readFileSync(bound, 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('preserves order across a migrate that runs between two staged batches (no interleaving)', () => {
    const staging = unboundStagingPath('vsf-pcp');
    const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
    appendChangeFrames(staging, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
    migrateStagedChanges(staging, bound); // "bind" happens here
    // A frame for the SAME (now-bound) identity arriving afterwards goes straight to the
    // bound path in real use (broker-daemon.ts resolves the binding fresh per batch) —
    // simulated here by appending directly to `bound`, proving the migrated lines stay
    // first and nothing from the second batch leaks into another migrate.
    appendChangeFrames(bound, [change({ nodeId: 'c' })], { page: 'P', fileKey: null }, 2);
    expect(migrateStagedChanges(staging, bound)).toBe(0); // nothing left staged
    expect(readFileSync(bound, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).nodeId))
      .toEqual(['a', 'b', 'c']);
  });

  // Closing review round (Codex, defect #1): a bare copy-then-delete leaves a crash window
  // where the append (step b) lands but cleanup (d/e) never runs, so the NEXT migrate would
  // re-append the same frames. These simulate the two crash points directly (writing the
  // exact post-crash on-disk state) rather than actually killing a process mid-write.
  describe('crash-safety — the marker-file protocol closes the re-append window', () => {
    it('crash between append and the marker write: belt-check on the bound log tail avoids a duplicate', () => {
      const staging = unboundStagingPath('vsf-pcp');
      appendChangeFrames(staging, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
      const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
      const stagedContent = readFileSync(staging, 'utf8');
      // Simulate: (b) append already landed, (c) marker write never happened — staging
      // still present, no marker at all.
      mkdirSync(join(dir, 'bound-project', 'design'), { recursive: true });
      writeFileSync(bound, stagedContent, 'utf8');
      expect(existsSync(migratedMarkerPath(staging))).toBe(false);

      const migrated = migrateStagedChanges(staging, bound);
      expect(migrated).toBe(0); // nothing NEW appended this call
      expect(existsSync(staging)).toBe(false);
      expect(existsSync(migratedMarkerPath(staging))).toBe(false); // cleaned up, not left behind
      expect(readFileSync(bound, 'utf8')).toBe(stagedContent); // unchanged — no duplicate
    });

    it('crash after the marker write, before cleanup: a matching marker short-circuits straight to cleanup', () => {
      const staging = unboundStagingPath('vsf-pcp');
      appendChangeFrames(staging, [change({ nodeId: 'a' })], { page: 'P', fileKey: null }, 1);
      const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
      const stagedContent = readFileSync(staging, 'utf8');
      // Simulate: (b) append AND (c) marker write both landed — only (d)/(e) cleanup is
      // outstanding.
      mkdirSync(join(dir, 'bound-project', 'design'), { recursive: true });
      writeFileSync(bound, stagedContent, 'utf8');
      const hash = createHash('sha256').update(stagedContent, 'utf8').digest('hex');
      writeFileSync(migratedMarkerPath(staging), JSON.stringify({ hash, at: 1 }), 'utf8');

      const migrated = migrateStagedChanges(staging, bound);
      expect(migrated).toBe(0);
      expect(existsSync(staging)).toBe(false);
      expect(existsSync(migratedMarkerPath(staging))).toBe(false);
      expect(readFileSync(bound, 'utf8')).toBe(stagedContent); // still no duplicate
    });

    it('a genuinely fresh migrate (no prior crash) is unaffected by the belt-check', () => {
      const staging = unboundStagingPath('vsf-pcp');
      appendChangeFrames(staging, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
      const bound = join(dir, 'bound-project', 'design', CHANGE_LOG_FILENAME);
      expect(migrateStagedChanges(staging, bound)).toBe(2); // real migration, unchanged behavior
      expect(existsSync(migratedMarkerPath(staging))).toBe(false); // no artifact left behind
      expect(readFileSync(bound, 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
    });
  });
});

describe('changeLogLineCount — reconcile cursor', () => {
  it('is 0 when the log is absent', () => {
    expect(changeLogLineCount(path)).toBe(0);
  });
  it('counts non-blank lines and advances with each append', () => {
    expect(changeLogLineCount(path)).toBe(0);
    appendChangeFrames(path, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
    expect(changeLogLineCount(path)).toBe(2);
    appendChangeFrames(path, [change({ nodeId: 'c' })], { page: 'P', fileKey: null }, 2);
    expect(changeLogLineCount(path)).toBe(3);
    expect(existsSync(path)).toBe(true);
  });
});
