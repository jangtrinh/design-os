// Every wire CommandName is classified exactly once: it either seals its own undo step
// (MUTATING_COMMANDS, plugin/src/main/mutating-commands.ts) or is explicitly read-only (listed
// here). A command added to shared/protocol.ts's COMMANDS without updating either list is a
// silent gap this test exists to catch — pure, no `figma` global needed (main.ts itself cannot be
// imported outside a live plugin sandbox; see mutating-commands.ts's header).
import { describe, it, expect } from 'vitest';
import { COMMANDS, type CommandName } from '../shared/protocol.ts';
import { MUTATING_COMMANDS } from '../plugin/src/main/mutating-commands.ts';

// Nothing to seal into an undo step: STATUS/GET_SELECTION/SCAN_DESIGN_SYSTEM/AUDIT_DS/
// GET_CORRECTION_MEMORY/EXPORT_PNG are read-only; HTML_TO_FIGMA never reaches main (arrives as
// IMPORT_PAYLOAD); BATCH's children commit individually inside runBatch, never BATCH itself.
const READ_ONLY_COMMANDS: readonly CommandName[] = [
  'STATUS', 'GET_SELECTION', 'SCAN_DESIGN_SYSTEM', 'AUDIT_DS',
  'GET_CORRECTION_MEMORY', 'EXPORT_PNG', 'HTML_TO_FIGMA', 'BATCH',
];

describe('command classification — every COMMANDS entry is MUTATING xor READ_ONLY', () => {
  it('no command is in both lists', () => {
    const overlap = MUTATING_COMMANDS.filter((c) => READ_ONLY_COMMANDS.includes(c));
    expect(overlap).toEqual([]);
  });

  it('every wire command is classified in exactly one list', () => {
    const unclassified = COMMANDS.filter(
      (c) => !MUTATING_COMMANDS.includes(c) && !READ_ONLY_COMMANDS.includes(c),
    );
    expect(unclassified).toEqual([]);
  });

  it('the two lists together account for every command, with no extras', () => {
    expect(MUTATING_COMMANDS.length + READ_ONLY_COMMANDS.length).toBe(COMMANDS.length);
  });
});
