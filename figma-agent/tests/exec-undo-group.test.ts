// Phase 02 — the undo bracket's ORDER guarantee (begin→commit on success,
// begin→rollback on failure) plus the honesty guarantee on `rolledBack`: a bracket
// whose own rollback() throws must never make the caller believe changes were undone.
// Injected bracket, no `figma` global — this is the part that was smoke-tested and the
// part that can silently destroy the caller's previous undo step.
import { describe, it, expect } from 'vitest';
import { runInUndoGroup, type UndoBracket } from '../plugin/src/main/executor-exec-js.ts';

function recordingBracket(onRollback?: () => void): { bracket: UndoBracket; calls: string[] } {
  const calls: string[] = [];
  const bracket: UndoBracket = {
    begin: () => calls.push('begin'),
    commit: () => calls.push('commit'),
    rollback: () => {
      calls.push('rollback');
      onRollback?.();
    },
  };
  return { bracket, calls };
}

describe('runInUndoGroup', () => {
  it('success → begin, commit — no rollback', async () => {
    const { bracket, calls } = recordingBracket();
    await expect(runInUndoGroup(bracket, async () => 'ok')).resolves.toBe('ok');
    expect(calls).toEqual(['begin', 'commit']);
  });

  it('throw → begin, rollback — the script error rethrown and tagged rolledBack', async () => {
    const { bracket, calls } = recordingBracket();
    const boom = new Error('boom');
    await expect(runInUndoGroup(bracket, async () => { throw boom; })).rejects.toBe(boom);
    expect(calls).toEqual(['begin', 'rollback']);
    expect((boom as Error & { rolledBack?: boolean }).rolledBack).toBe(true);
  });

  it('a bracket whose rollback() throws still rethrows the SCRIPT error, unset rolledBack, rollbackFailed carries the undo message', async () => {
    const undoErr = new Error('undo api exploded');
    const { bracket } = recordingBracket(() => { throw undoErr; });
    const boom = new Error('boom');
    await expect(runInUndoGroup(bracket, async () => { throw boom; })).rejects.toBe(boom);
    const tagged = boom as Error & { rolledBack?: boolean; rollbackFailed?: string };
    expect(tagged.rolledBack).toBeUndefined();
    expect(tagged.rollbackFailed).toBe('undo api exploded');
  });

  it('null bracket → no calls, value passes through untagged', async () => {
    await expect(runInUndoGroup(null, async () => 42)).resolves.toBe(42);
  });

  it('null bracket → a throw passes through untagged', async () => {
    const boom = new Error('boom');
    await expect(runInUndoGroup(null, async () => { throw boom; })).rejects.toBe(boom);
    expect((boom as Error & { rolledBack?: boolean }).rolledBack).toBeUndefined();
  });

  it('Codex round 1 finding 2: a primitive throw is normalized into an Error and tagged rolledBack on rollback', async () => {
    const { bracket, calls } = recordingBracket();
    const rejection = runInUndoGroup(bracket, async () => { throw 'boom'; });
    await expect(rejection).rejects.toBeInstanceOf(Error);
    await expect(rejection).rejects.toMatchObject({ message: 'boom', rolledBack: true, originalPrimitive: 'boom' });
    expect(calls).toEqual(['begin', 'rollback']);
  });

  it('Codex round 1 finding 2: a primitive throw with no bracket still passes through as a plain Error', async () => {
    const rejection = runInUndoGroup(null, async () => { throw 'boom'; });
    await expect(rejection).rejects.toBeInstanceOf(Error);
    await expect(rejection).rejects.toThrow('boom');
    await expect(rejection).rejects.not.toMatchObject({ rolledBack: true });
  });
});
