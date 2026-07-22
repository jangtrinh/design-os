import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { scanNodeSpec, resolveScanTimeout } from './scan-node.ts';
import { resolveSafeTarget } from '../../../shared/safe-target.ts';
import type { CorrectionEvent } from '../../../shared/supervised-memory.ts';

interface SelectionReply {
  selection?: { id?: string }[];
}

type Runner = typeof runCommand;

/** Default inspection depth: root + direct children (progressive disclosure). */
export const DEFAULT_INSPECT_DEPTH = 1;

/**
 * Resolve + validate the `--depth` flag BEFORE any plugin call. Absent → default 1.
 * A negative or non-integer depth is rejected with E_INVALID_ARGS so a bad bound
 * never reaches the broker (arg-parse only guards NaN, not sign or integrality).
 */
export function resolveInspectDepth(requested?: number): number {
  if (requested === undefined) return DEFAULT_INSPECT_DEPTH;
  if (!Number.isInteger(requested) || requested < 0) {
    throw new CliError('E_INVALID_ARGS', `--depth must be a non-negative integer, got "${requested}"`);
  }
  return requested;
}

export async function inspectTarget(input: {
  explicit?: string;
  out?: string;
  scale?: number;
  timeout?: number;
  depth?: number;
}, runner: Runner = runCommand): Promise<unknown> {
  // Validate FIRST — an invalid depth must fail closed with no plugin round-trip.
  const depth = resolveInspectDepth(input.depth);
  const selected = input.explicit ? [] : ((await runner('GET_SELECTION', { depth: 0 })) as SelectionReply)
    .selection?.flatMap((node) => node.id ? [node.id] : []) ?? [];
  const recent = input.explicit || selected.length > 0
    ? []
    : ((await runner('GET_CORRECTION_MEMORY', {}, { activity: 'Resolve recent target' })) as {
      events?: CorrectionEvent[];
    }).events?.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((event) => event.nodeId) ?? [];
  const target = resolveSafeTarget({ explicit: input.explicit, selection: selected, recent });
  const timeout = resolveScanTimeout(input.timeout);
  const structure = await scanNodeSpec(target.nodeId, timeout, runner, `Inspect · ${target.nodeId}`, depth);
  const image = await runner('EXPORT_PNG', {
    nodeId: target.nodeId,
    scale: input.scale ?? 1,
  }, { activity: `Inspect screenshot · ${target.nodeId}` }) as { base64: string; w: number; h: number };
  const defaultPath = join(tmpdir(), `figma-inspect-${target.nodeId.replace(/[^a-z0-9]+/gi, '-')}.png`);
  const screenshotPath = resolve(input.out ?? defaultPath);
  writeFileSync(screenshotPath, Buffer.from(image.base64, 'base64'));
  return {
    nodeId: target.nodeId,
    targetSource: target.source,
    depth,
    structure,
    visualArtifact: {
      type: 'image/png',
      path: screenshotPath,
      width: image.w,
      height: image.h,
      required: true,
      contract: 'VISUAL_CHECK_REQUIRED: inspect this screenshot before and after visual edits.',
    },
  };
}

export async function run(args: CommandArgs): Promise<unknown> {
  return inspectTarget({
    explicit: args.str('node') ?? args.positionals[0],
    out: args.str('out'),
    scale: args.num('scale'),
    timeout: args.num('timeout'),
    depth: args.num('depth'),
  });
}
