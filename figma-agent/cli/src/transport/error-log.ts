// Error log writer (backlog 4.6) — fs layer for the broker. Append-only JSONL, one line
// per `ReplyErr` the broker relays, at `design/figma-errors.jsonl` — a SIBLING of
// `figma.changes.jsonl`, not inside the wave 4.4 edit feed's `changes/` subdirectory
// (same BASE dir resolution as both — `changeLogDir()` — but its own file, its own
// shape, never mixed into either of those two logs).
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { changeLogDir } from './change-log.ts';
import type { CommandName, ErrorCode, ReplyErr } from '../../../shared/protocol.ts';

export const ERROR_LOG_FILENAME = 'figma-errors.jsonl';

/** `<changeLogDir()>/figma-errors.jsonl` — shares changeLogDir()'s
 *  `FIGMA_AGENT_CHANGES_DIR` override, same as the change log and the edit feed base. */
export function errorLogPath(): string {
  return join(changeLogDir(), ERROR_LOG_FILENAME);
}

/** One line of the error log. Append-only; no schema-version field — this is a
 *  diagnostic tail, not a contract any reconcile/reader parses strictly (the planned
 *  `figma-agent errors` reader, backlog 4.4 P2, is out of scope for this task). */
export interface ErrorLogFrame {
  ts: number;              // epoch ms, stamped by the broker at append
  cmd: CommandName | null; // null when the relaying build didn't echo it (older client)
  activity: string | null; // the CLI's intent label, when it sent one
  code: ErrorCode;
  message: string;         // FULL, untruncated — this is the one place the real reason lives
  rolledBack?: boolean;    // present only when the error payload itself carried it (EXEC_JS --undo-group)
  fileName: string | null;
  requestId: string;
}

/**
 * Stamp one relayed `ReplyErr` into a fully-formed `ErrorLogFrame` (pure). `fileName`
 * prefers the reply's own `fileContext` (the plugin's authoritative "which file actually
 * answered") and falls back to `fallbackFileName` (the routed plugin's scene fileName,
 * resolved broker-side via the registry) only when the reply carried no fileContext at
 * all — e.g. a broker-generated error (E_NO_PLUGIN) that never reached a plugin.
 */
export function buildErrorLogFrame(
  reply: ReplyErr,
  fallbackFileName: string | null,
  ts: number,
): ErrorLogFrame {
  const frame: ErrorLogFrame = {
    ts,
    cmd: reply.cmd ?? null,
    activity: typeof reply.activity === 'string' && reply.activity !== '' ? reply.activity : null,
    code: reply.error.code,
    message: typeof reply.error.message === 'string' ? reply.error.message : String(reply.error.message ?? ''),
    fileName: reply.fileContext?.fileName ?? fallbackFileName ?? null,
    requestId: reply.id,
  };
  if (reply.error.rolledBack === true) frame.rolledBack = true;
  return frame;
}

/** Append one ErrorLogFrame line, creating the design/ dir if needed. */
export function appendErrorFrame(path: string, frame: ErrorLogFrame): void {
  mkdirSync(resolveDir(path), { recursive: true });
  appendFileSync(path, JSON.stringify(frame) + '\n', 'utf8');
}

/** Parent dir of a file path (mirrors change-log.ts's / edit-feed-log.ts's private
 *  helper — kept separate per the same "near-copy, deliberately separate" contract). */
function resolveDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx <= 0 ? filePath : filePath.slice(0, idx);
}
