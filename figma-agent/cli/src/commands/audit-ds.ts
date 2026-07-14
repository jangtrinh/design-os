// `figma-agent audit-ds` — DS-hygiene audit of the open file's component library.
// The plugin (AUDIT_DS) returns RAW facts; this command runs the pure detect core over
// them. Three inputs decide where the facts come from and where results land:
//   --from-facts <file>  replay a raw capture OFFLINE (the runner/broker is NEVER touched);
//   --facts <file>       write the raw scan (pretty) so future detector iterations can replay;
//   --out <file>         write the full report and print only {path,file,summary}.
// --sections "A,B" configures the DS taxonomy (misfiled fires only then). --timeout <ms>
// raises the per-attempt wire timeout; a cold first attempt that times out is retried ONCE warm.
// A schema gate refuses stale facts (E_PLUGIN_STALE) on BOTH the transport and from-facts paths.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMMAND_TIMEOUTS } from '../../../shared/protocol.ts';
import { AUDIT_FACTS_SCHEMA, type AuditDsFacts } from '../../../shared/audit-types.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { runCommand } from '../transport/broker-client.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runWithWarmRetry } from '../transport/warm-retry.ts';
import { detectAudit, type AuditReport } from './audit-ds-detect.ts';

/** A command runner (the AUDIT_DS transport call), injectable for tests. */
export type Runner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

export interface AuditDsOpts {
  out?: string;
  timeout?: number;
  sections?: string[];
  facts?: string;
  fromFacts?: string;
}

export interface AuditDsResult {
  path?: string;
  file?: AuditReport['file'];
  summary?: AuditReport['summary'];
  /** Full report (only when --out was NOT given). */
  report?: AuditReport;
  /** Where the raw facts were written (only when --facts was given). */
  factsPath?: string;
}

/**
 * Decoupled from CommandArgs + the real transport so it is unit-testable with a stub
 * runner and temp paths. `fromFacts` short-circuits the runner entirely (offline replay);
 * otherwise a cold E_TIMEOUT triggers exactly one warm retry. The plugin returns raw facts;
 * the detect core (pure) turns them into the report here on the CLI side.
 */
export async function execute(opts: AuditDsOpts, runner: Runner = runCommand): Promise<AuditDsResult> {
  let facts: AuditDsFacts;
  if (opts.fromFacts !== undefined) {
    // Offline replay: read the raw capture from disk; the broker/transport is never touched.
    facts = JSON.parse(readFileSync(resolve(opts.fromFacts), 'utf8')) as AuditDsFacts;
  } else {
    const perAttempt = opts.timeout ?? COMMAND_TIMEOUTS.AUDIT_DS;
    facts = (await runWithWarmRetry(() =>
      runner('AUDIT_DS', {}, perAttempt ? { timeoutMs: perAttempt } : undefined),
    )) as AuditDsFacts;
  }

  // Schema gate (BOTH paths, BEFORE detect): a stale plugin sandbox — or a v1 --from-facts
  // file — would otherwise be mis-detected against the v2 shape and produce garbage.
  const got = (facts as { schema?: unknown }).schema;
  if (got !== AUDIT_FACTS_SCHEMA) {
    throw new CliError(
      'E_PLUGIN_STALE',
      `audit facts schema ${String(got)} ≠ ${AUDIT_FACTS_SCHEMA} — the Figma plugin panel is running an older build; close & reopen the Design Agent plugin (Plugins → Development), rebuild if needed, then retry. (--from-facts: the file is a v1 capture.)`,
    );
  }

  // --facts: persist the raw scan (pretty) for offline replay.
  let factsPath: string | undefined;
  if (opts.facts !== undefined) {
    factsPath = resolve(opts.facts);
    writeFileSync(factsPath, JSON.stringify(facts, null, 2));
  }

  const report = detectAudit(facts, { sections: opts.sections });

  if (opts.out === undefined) return { report, factsPath };
  const abs = resolve(opts.out);
  writeFileSync(abs, JSON.stringify(report, null, 2));
  return { path: abs, file: report.file, summary: report.summary, factsPath };
}

export async function run(args: CommandArgs): Promise<unknown> {
  const res = await execute({
    out: args.str('out'),
    timeout: args.num('timeout'),
    sections: args.str('sections')?.split(',').map((s) => s.trim()).filter(Boolean),
    facts: args.str('facts'),
    fromFacts: args.str('from-facts'),
  });
  // With --out stdout is the compact {path,file,summary(,factsPath)}; without it, the full report.
  return res.path !== undefined
    ? { path: res.path, file: res.file, summary: res.summary, factsPath: res.factsPath }
    : res.report;
}
