// Which CommandName values seal their own undo step (backlog 2.4). Pure — no `figma` access —
// specifically so this classification is unit-testable in isolation: main.ts itself cannot be
// imported outside a live plugin sandbox (it calls `figma.showUI(__html__, …)` at module load).
import type { CommandName } from '../../../shared/protocol';

// Each successful mutating command becomes its own undo step. Without commitUndo, Figma's
// default makes an entire agent session ONE ⌘Z. BATCH is absent deliberately: its children
// commit individually (inside runBatch), which is the granularity a user wants. Read-only
// commands never commit.
export const MUTATING_COMMANDS: readonly CommandName[] = [
  'CREATE_FRAME', 'CREATE_INSTANCE', 'SET_VARIANT', 'CREATE_VARIABLE', 'BIND_VARIABLE',
  'SET_AUTOLAYOUT', 'SET_CONSTRAINTS', 'SET_TEXT', 'CLONE_TRAITS', 'SET_CORRECTION_MEMORY',
  'EXEC_JS', 'IMPORT_PAYLOAD',
];
// Not in the set (nothing to seal into an undo step): STATUS, GET_SELECTION,
// SCAN_DESIGN_SYSTEM, AUDIT_DS, GET_CORRECTION_MEMORY, EXPORT_PNG, HTML_TO_FIGMA, BATCH.
// AUDIT_DS does move the user's current page (executor-audit.ts walks pages via
// setCurrentPageAsync and does not restore the original) — page navigation is not
// undoable, so a commit would do nothing. Excluded on that basis, not on innocence.
// SET_CORRECTION_MEMORY IS in the set — it writes figma.root.setSharedPluginData
// (correction-edge-store.ts:28-31). HTML_TO_FIGMA never reaches main (it arrives as
// IMPORT_PAYLOAD). BATCH itself never commits — see the note above.
