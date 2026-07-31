// `figma-agent bind` (registry-integrity phase 01, §2) — explicit file↔project binding.
// This is the ONLY way a project's durable state (registry, sidecars, cursor, manifest)
// gets to be something other than "wherever the broker happened to be spawned from". The
// command writes the project's own durable marker (`design/figma-bind.json`) itself, so it
// works even when no broker is reachable; it also asks a LIVE broker to record/remove the
// binding in its own in-memory index via `PROJECT_BIND` — a normal request/reply (fix
// round: the original fire-and-forget event could never report fileKey/migratedCount back).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import {
  bindMarkerPath, fileIdentity, isUsable, readBindCache, readBindMarker, writeBindCache, writeBindMarker,
  type BindMarkerEntry, type BindMarkerFile,
} from '../transport/project-bind.ts';

function upsertBinding(marker: BindMarkerFile, fileName: string, fileKey: string | null): BindMarkerEntry {
  const slug = fileIdentity(null, fileName); // identity chain minus fileKey — the stable per-name slug
  const at = Date.now();
  const idx = marker.bindings.findIndex(
    (b) => b.fileNameSlug === slug || (fileKey !== null && b.fileKey === fileKey),
  );
  const entry: BindMarkerEntry = {
    fileKey,
    fileNameSlug: slug,
    boundAt: at,
    ...(fileKey === null ? { pendingKey: true as const } : {}),
  };
  if (idx >= 0) marker.bindings[idx] = entry;
  else marker.bindings.push(entry);
  return entry;
}

function listBindings(): unknown {
  const cache = readBindCache();
  const bindings: Array<Record<string, unknown>> = [];
  for (const projectDir of cache.projectDirs) {
    const marker = readBindMarker(projectDir);
    if (!marker) continue;
    for (const b of marker.bindings) {
      bindings.push({
        projectDir,
        fileKey: b.fileKey,
        fileNameSlug: b.fileNameSlug,
        boundAt: b.boundAt,
        pendingKey: b.pendingKey === true,
        usable: isUsable({ projectDir, source: 'bind', at: b.boundAt }),
      });
    }
  }
  return { bindings };
}

async function unbind(args: CommandArgs): Promise<unknown> {
  const fileName = (args.str('file') ?? '').trim();
  const dirArg = (args.str('dir') ?? '').trim();
  if (fileName === '') throw new CliError('E_INVALID_ARGS', 'bind --unbind needs --file "<exact file name>"');
  if (dirArg === '') throw new CliError('E_INVALID_ARGS', 'bind --unbind needs --dir <projectDir>');
  const projectDir = resolve(dirArg);
  const slug = fileIdentity(null, fileName);
  const marker = readBindMarker(projectDir);
  // Captured BEFORE the rewrite: a live broker needs every fileKey this entry carried to
  // remove ALL its aliases (fix round, finding 4) — once the marker is rewritten below,
  // that information is gone from disk.
  const removedEntries = (marker?.bindings ?? []).filter((b) => b.fileNameSlug === slug);
  const removedFileKeys = removedEntries.map((e) => e.fileKey).filter((k): k is string => typeof k === 'string');
  const next: BindMarkerFile = {
    v: 1,
    bindings: (marker?.bindings ?? []).filter((b) => b.fileNameSlug !== slug),
  };
  writeBindMarker(projectDir, next);
  try {
    await runCommand('PROJECT_BIND', { fileName, projectDir, unbind: true, removedFileKeys });
  } catch {
    // No live broker reachable — the durable marker is already updated; a future broker's
    // own startup scan simply never re-loads the removed entry.
  }
  return { projectDir, fileName, removed: removedEntries.length, marker: bindMarkerPath(projectDir) };
}

export async function run(args: CommandArgs): Promise<unknown> {
  if (args.bool('list')) return listBindings();
  if (args.bool('unbind')) return unbind(args);

  const fileName = (args.str('file') ?? '').trim();
  const dirArg = (args.str('dir') ?? '').trim();
  if (fileName === '') throw new CliError('E_INVALID_ARGS', 'bind needs --file "<exact file name>"');
  if (dirArg === '') throw new CliError('E_INVALID_ARGS', 'bind needs --dir <projectDir>');
  const projectDir = resolve(dirArg);
  if (!existsSync(projectDir)) throw new CliError('E_INVALID_ARGS', `--dir "${projectDir}" does not exist`);

  let fileKey: string | null = null;
  let migratedCount = 0;
  try {
    const result = await runCommand('PROJECT_BIND', { fileName, projectDir }) as
      { fileKey?: string | null; migratedCount?: number };
    fileKey = result.fileKey ?? null;
    migratedCount = result.migratedCount ?? 0;
  } catch {
    // No live broker reachable — write the durable marker anyway (`pendingKey: true`); a
    // LATER broker's own startup scan (`loadBindIndex`) picks this marker up, and if the
    // file happens to be open by then `promotePendingBind` fills the key in.
  }

  const marker = readBindMarker(projectDir) ?? { v: 1 as const, bindings: [] };
  const entry = upsertBinding(marker, fileName, fileKey);
  writeBindMarker(projectDir, marker);
  writeBindCache([...readBindCache().projectDirs, projectDir]);

  return {
    projectDir,
    fileName,
    fileKey: entry.fileKey,
    pendingKey: entry.pendingKey === true,
    migratedCount,
    marker: bindMarkerPath(projectDir),
  };
}
