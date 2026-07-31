// `figma-agent errors` (backlog 4.6, folded into wave 4.4 P2 — "cùng khuôn lệnh `changes`")
// — the agent's read path over the broker's error log (`design/figma-errors.jsonl`). The
// WRITER already shipped as a hotfix (error-log.ts: `appendErrorFrame`/`errorLogPath`,
// wired in broker-daemon.ts's `isReplyMsg` branch) — this command is the missing reader.
//
// Unlike `changes` (one feed FILE per Figma file, selected via `--file`), the error log is
// a SINGLE shared file across every file the broker has relayed for — `ErrorLogFrame`
// already carries its own `fileName` per entry, so `--file` here FILTERS entries rather
// than picking a file on disk.
//
//   figma-agent errors [--since <ts|iso>] [--file <name>] [--limit 50]
//
// Same parser asymmetry as `changes` (module comment there): a malformed line is skipped
// and counted, never fatal — this is a diagnostic tail, not the kernel's audit ledger.
import { readFileSync } from 'node:fs';
import type { CommandArgs } from '../figma-agent.ts';
import { isValidErrorLogFrame, errorLogPath, type ErrorLogFrame } from '../transport/error-log.ts';
import { parseSince, validateLimit } from './changes.ts';

const DEFAULT_LIMIT = 50;

export interface ReadErrorLogResult {
  frames: ErrorLogFrame[];
  /** Lines that failed to JSON.parse — skipped, never fatal (see module header). */
  warnings: number;
}

/** Reads and parses the error log. A missing file (no error has ever landed) reads as
 *  empty, not an error.
 *
 *  Stage-4 fix round (M1) — `isValidErrorLogFrame` (error-log.ts) now gates every parsed
 *  line, not just a JSON.parse failure — a shape-invalid line (missing `code`, a garbage
 *  `ts`) is skipped and counted the same way, never fatal, never silently admitted. */
export function readErrorLog(path: string): ReadErrorLogResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { frames: [], warnings: 0 };
    throw err;
  }
  const frames: ErrorLogFrame[] = [];
  let warnings = 0;
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      warnings++;
      continue;
    }
    if (!isValidErrorLogFrame(parsed)) { warnings++; continue; }
    frames.push(parsed);
  }
  return { frames, warnings };
}

export interface ErrorsFilter {
  since?: number;
  /** Case-insensitive substring against each entry's OWN `fileName` — the log is shared
   *  across files, so this filters entries, unlike `changes`' `--file` which picks a feed. */
  file?: string;
}

export function filterErrors(frames: readonly ErrorLogFrame[], filter: ErrorsFilter): ErrorLogFrame[] {
  const needle = filter.file?.trim().toLowerCase();
  return frames.filter((f) =>
    (filter.since === undefined || f.ts >= filter.since) &&
    (needle === undefined || (f.fileName ?? '').toLowerCase().includes(needle)));
}

/** Newest-last kept (a log reads chronologically oldest-first) — `limit <= 0` means all. */
export function limitErrors(frames: readonly ErrorLogFrame[], limit: number): ErrorLogFrame[] {
  if (limit <= 0) return [...frames];
  return frames.slice(-limit);
}

export async function run(args: CommandArgs): Promise<unknown> {
  const sinceRaw = args.str('since');
  const since = sinceRaw !== undefined ? parseSince(sinceRaw) : undefined;
  const file = args.str('file');
  const limit = validateLimit(args.num('limit')) ?? DEFAULT_LIMIT;

  const path = errorLogPath();
  const { frames: allFrames, warnings } = readErrorLog(path);
  const filtered = filterErrors(allFrames, { since, file });
  const limited = limitErrors(filtered, limit);

  // Stage-4 fix round (minor 6) — `--file` here FILTERS a single SHARED log (module
  // header), so "this file has zero logged errors" is a legitimate, GOOD outcome, not a
  // typo to correct loudly the way `changes`' unknown-`--file` (picking among several
  // per-file FEEDS) is. A plain informational `note` replaces the old throw — never based
  // on other files' entries refusing to answer about THIS one.
  const note = file !== undefined && filtered.length === 0 && allFrames.length > 0
    ? (() => {
        const knownFileNames = [...new Set(allFrames.map((f) => f.fileName).filter((n): n is string => n !== null))];
        return knownFileNames.length > 0
          ? `no logged error matches --file "${file}" — files with errors logged: ${knownFileNames.join(', ')}`
          : `no logged error matches --file "${file}" — no error yet carries a fileName`;
      })()
    : undefined;

  return {
    // Resolved path printed for the same reason `changes`' `feedPath` is — a cwd/broker
    // spawn-cwd mismatch (spec 4.4 unresolved q5 / backlog 4.5) is visible, never silent.
    logPath: path,
    since: since ?? null,
    count: filtered.length,
    errors: limited,
    ...(warnings > 0 && { warnings }),
    ...(note !== undefined && { note }),
  };
}
