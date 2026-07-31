// `figma-agent changes` (owner-edit change feed, wave 4.4 phase 02 §1) — the agent's read
// path over the per-file edit feed (`design/changes/<slug>.jsonl`, wave 4.4 phase 01). Pure
// fs + filtering, no broker round-trip — this is the whole point: an agent resuming work
// reads what happened while it was away, even with the plugin closed.
//
//   figma-agent changes [--since <ts|iso>] [--owner-only] [--actor owner|agent|ambiguous]
//                       [--file <name|slug>] [--limit 50] [--page <name>]
//
// Parser asymmetry, stated deliberately (mirrors sync-corrections.ts's parseJsonl in
// spirit, NOT in strictness): this feed is a best-effort OBSERVATION log, not the kernel's
// audit ledger (figma.changes.jsonl / parseChangeLog), so a malformed line is SKIPPED and
// COUNTED rather than throwing — one bad line must never hide every good one behind it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { editFeedDir } from '../transport/edit-feed-log.ts';
import { editSentence } from '../../../shared/edit-vocabulary.ts';
import { isValidEditFrame, type EditActor, type EditFrame } from '../../../shared/edit-feed.ts';

const VALID_ACTORS: ReadonlySet<string> = new Set(['owner', 'agent', 'ambiguous']);
const DEFAULT_LIMIT = 50;

/** `--since` accepts epoch ms OR an ISO string (agents produce both). A bare integer
 *  string is always epoch ms (an ISO date never parses as one); anything else goes
 *  through `Date.parse`, which also rejects garbage as NaN. */
export function parseSince(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  throw new CliError('E_INVALID_ARGS', `--since must be an epoch-ms integer or an ISO date string, got "${raw}"`);
}

/** Stage-4 fix round (minor 7) — `args.num('limit')` already rejects a non-numeric
 *  STRING, but `Number('Infinity')` parses clean (not NaN), so `--limit Infinity` slipped
 *  through and `limitFrames`' own `slice(-limit)` silently clamped it to "return
 *  everything" — the SAME outcome as `--limit 0`, reached by a value that never
 *  legitimately meant that. Rejected explicitly, named for what it is. */
export function validateLimit(n: number | undefined): number | undefined {
  if (n !== undefined && !Number.isFinite(n)) {
    throw new CliError('E_INVALID_ARGS', `--limit must be a finite number, got "${n}"`);
  }
  return n;
}

export interface ReadEditFeedResult {
  frames: EditFrame[];
  /** Lines that failed to JSON.parse — skipped, never fatal (see module header). */
  warnings: number;
}

/** Reads and parses one feed file, line by line. A missing file (nothing captured yet
 *  for this slug) reads as empty, not an error.
 *
 *  Stage-4 fix round (M1) — a JSON-VALID but semantically-wrong line (missing `op`, a
 *  garbage `actor`) used to pass straight through: this module only caught a JSON.parse
 *  failure, so a shape-invalid line crashed downstream instead (`countByActor`'s
 *  `counts[f.actor]++`, `editSentence`'s field reads). `isValidEditFrame` (shared/edit-
 *  feed.ts) now gates every parsed line the same way a parse failure already was —
 *  skipped and counted, never fatal, never silently admitted either.
 *
 *  Stage-4 fix round (N3) — sorts by `ts` UNCONDITIONALLY before returning, making feed
 *  order a READER guarantee rather than a writer assumption. Appends are usually already
 *  chronological, but M2's promotion-time migration (merging a name-slug feed into a
 *  fileKey feed) is exactly the kind of writer-side operation that can interleave two
 *  files' own append orders — sorting here kills that whole class of out-of-order reads,
 *  cheaply, since a feed read is always bounded (`--limit`/`--since`/`--file` already
 *  narrow it before this ever needs to scale). `Array.prototype.sort` is a STABLE sort
 *  (guaranteed since ES2019), so two frames with the identical `ts` keep their original
 *  on-disk relative order. */
export function readEditFeed(path: string): ReadEditFeedResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { frames: [], warnings: 0 };
    throw err;
  }
  const frames: EditFrame[] = [];
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
    if (!isValidEditFrame(parsed)) { warnings++; continue; }
    frames.push(parsed);
  }
  frames.sort((a, b) => a.ts - b.ts);
  return { frames, warnings };
}

function listFeedSlugs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.slice(0, -'.jsonl'.length))
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export interface ResolvedFeed {
  path: string;
  /** The slug printed as `file` in the envelope — the feed filename's own stem. */
  slug: string;
}

/**
 * Resolve `--file <name|slug>` to one feed file. Matching is against the SLUGS actually
 * on disk (feed filenames ARE `fileIdentity` slugs) — a case-insensitive exact match wins
 * outright; otherwise a substring match, which must be unique. No `--file` at all only
 * works when exactly one feed exists (the common single-project case) — anything more
 * ambiguous is an error naming every feed that DOES exist, per the spec's courtesy
 * (`noPluginMessage`'s sibling for this command), never a silent guess.
 */
export function resolveFeedFile(dir: string, fileArg: string | undefined): ResolvedFeed {
  const slugs = listFeedSlugs(dir);
  if (fileArg === undefined) {
    if (slugs.length === 1) return { path: join(dir, `${slugs[0]}.jsonl`), slug: slugs[0]! };
    if (slugs.length === 0) {
      throw new CliError('E_INVALID_ARGS', `no edit feeds found under ${dir} — nothing has been captured yet`);
    }
    throw new CliError('E_INVALID_ARGS', `multiple feeds exist — pass --file to pick one: ${slugs.join(', ')}`);
  }
  const needle = fileArg.trim().toLowerCase();
  const exact = slugs.find((s) => s.toLowerCase() === needle);
  if (exact) return { path: join(dir, `${exact}.jsonl`), slug: exact };
  const hits = slugs.filter((s) => s.toLowerCase().includes(needle));
  if (hits.length === 1) return { path: join(dir, `${hits[0]}.jsonl`), slug: hits[0]! };
  if (hits.length > 1) {
    throw new CliError('E_INVALID_ARGS', `--file "${fileArg}" matches ${hits.length} feeds [${hits.join(', ')}] — be more specific`);
  }
  throw new CliError(
    'E_INVALID_ARGS',
    slugs.length > 0
      ? `--file "${fileArg}" matches no feed — feeds that exist: ${slugs.join(', ')}`
      : `--file "${fileArg}" matches no feed — no feeds exist yet under ${dir}`,
  );
}

export interface ChangesFilter {
  since?: number;
  actor?: EditActor;
  page?: string;
}

export function filterFrames(frames: readonly EditFrame[], filter: ChangesFilter): EditFrame[] {
  return frames.filter((f) =>
    (filter.since === undefined || f.ts >= filter.since) &&
    (filter.actor === undefined || f.actor === filter.actor) &&
    (filter.page === undefined || f.page === filter.page));
}

export interface ActorCounts {
  owner: number;
  agent: number;
  ambiguous: number;
  total: number;
}

/** Counts the FILTERED set (before `--limit` truncates what's displayed) — the caller
 *  can always tell "how much matched" from how much it can actually see on screen. */
export function countByActor(frames: readonly EditFrame[]): ActorCounts {
  const counts: ActorCounts = { owner: 0, agent: 0, ambiguous: 0, total: frames.length };
  for (const f of frames) counts[f.actor]++;
  return counts;
}

/** Newest-last kept (a log reads chronologically oldest-first) — `limit <= 0` means all. */
export function limitFrames(frames: readonly EditFrame[], limit: number): EditFrame[] {
  if (limit <= 0) return [...frames];
  return frames.slice(-limit);
}

export interface ChangesOutputFrame {
  ts: number;
  actor: EditActor;
  source: EditFrame['source'];
  op: EditFrame['op'];
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  parentName: string | null;
  changedProps: string[];
  page: string;
  /** Stage-4 fix round (minor 9b) — honest provenance: which Figma file this frame's OWN
   *  identity resolution used (phase 02 fix — see shared/edit-feed.ts's `EditFrame.fileName`
   *  doc). `null` for a frame written before that fix landed. */
  fileName: string | null;
  sentence: string;
}

function toOutputFrame(f: EditFrame): ChangesOutputFrame {
  return {
    ts: f.ts, actor: f.actor, source: f.source, op: f.op, nodeId: f.nodeId,
    nodeName: f.nodeName, nodeType: f.nodeType, parentName: f.parentName,
    changedProps: f.changedProps, page: f.page, fileName: f.fileName ?? null,
    sentence: editSentence(f),
  };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const sinceRaw = args.str('since');
  const since = sinceRaw !== undefined ? parseSince(sinceRaw) : undefined;

  const ownerOnly = args.bool('owner-only');
  const actorArg = args.str('actor');
  if (actorArg !== undefined && !VALID_ACTORS.has(actorArg)) {
    throw new CliError('E_INVALID_ARGS', `--actor must be one of owner|agent|ambiguous, got "${actorArg}"`);
  }
  // `--owner-only` is sugar for `--actor owner`; passing both with DIFFERENT values is an
  // error, not a silent precedence rule (spec §1) — an operator who typed both deserves to
  // know they conflict, not have one silently win.
  if (ownerOnly && actorArg !== undefined && actorArg !== 'owner') {
    throw new CliError('E_INVALID_ARGS', '--owner-only conflicts with --actor (different values) — pass only one');
  }
  // Validated against VALID_ACTORS above — safe to narrow.
  const actor = (ownerOnly ? 'owner' : actorArg) as EditActor | undefined;

  const page = args.str('page');
  const limit = validateLimit(args.num('limit')) ?? DEFAULT_LIMIT;

  const dir = editFeedDir();
  const { path, slug } = resolveFeedFile(dir, args.str('file'));
  const { frames: allFrames, warnings } = readEditFeed(path);
  const filtered = filterFrames(allFrames, { since, actor, page });
  const limited = limitFrames(filtered, limit);

  return {
    file: slug,
    // Resolved path printed so a cwd/broker spawn-cwd mismatch (spec unresolved q5) is
    // visible instead of silent.
    feedPath: path,
    since: since ?? null,
    counts: countByActor(filtered),
    changes: limited.map(toOutputFrame),
    ...(warnings > 0 && { warnings }),
  };
}
