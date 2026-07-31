// `figma-agent seat` — probe the current seat once and return which bridge
// ease-design should drive: {seat, bridge, reason}.
//
// Cheapest-first probe (the non-deterministic HAND):
//   1. STATUS round-trip        → is the plugin reachable? (cheapest)
//   2. throwaway setSharedPluginData write via EXEC_JS → editor rights?
// The routing DECISION is a pure function in ../seat/routing.ts (unit-tested).
//
// --seat free|paid  skips the probe (explicit override; the only way to select
//                   the paid Figma MCP, which the plugin probe cannot detect).
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import { route, type Seat, type SeatRouting } from '../seat/routing.ts';

/** A command runner: the transport call, injectable so the probe is testable. */
export type Runner = (cmd: string, params: unknown) => Promise<unknown>;

const PROBE_NAMESPACE = 'easeDesign';
const PROBE_KEY = '__easeSeatProbe';

/**
 * The live seat probe (the HAND). Runs STATUS for connectivity, then a
 * throwaway setSharedPluginData write that it immediately clears. Returns the
 * two observable signals for the pure classifier. `runner` defaults to the real
 * broker transport and is injected in unit tests.
 *
 * LIVE-E2E PENDING: exercised end-to-end only against a live Figma plugin
 * (needs the Ease Design Figma Agent plugin open in Figma Desktop). The wiring
 * and error handling are unit-tested with a stub runner; the round-trips
 * themselves await a live-canvas smoke test.
 */
export async function probeSignals(
  runner: Runner = runCommand,
): Promise<{ pluginReachable: boolean; writeOk: boolean; writeInconclusive?: boolean }> {
  // 1. Cheapest: connectivity.
  try {
    await runner('STATUS', {});
  } catch {
    return { pluginReachable: false, writeOk: false };
  }

  // 2. Editor rights: a throwaway shared-plugin-data write, cleared right after. This
  // probe WRITES (setSharedPluginData) — never declared read-only — so concurrency &
  // jobs' per-file FIFO queue (backlog 1.1+2.6+4.3) can now make it wait behind another
  // agent's mutation.
  const code = `
const NS = ${JSON.stringify(PROBE_NAMESPACE)};
const K = ${JSON.stringify(PROBE_KEY)};
const stamp = String(Date.now());
figma.root.setSharedPluginData(NS, K, stamp);
const readBack = figma.root.getSharedPluginData(NS, K);
figma.root.setSharedPluginData(NS, K, ''); // clear the throwaway
return { wrote: readBack === stamp };
`.trim();
  try {
    const res = (await runner('EXEC_JS', { code, timeoutMs: 5_000 })) as { wrote?: unknown } | null;
    return { pluginReachable: true, writeOk: res?.wrote === true };
  } catch (err) {
    // Concurrency & jobs, phase 01 §3 — a pre-existing defect this wave's queue would
    // otherwise turn from latent into a VISIBLE wrong answer: a TIMEOUT here is now a
    // real possibility (queued behind another agent's mutation), and a timeout is
    // INCONCLUSIVE, never a negative "not an editor" signal the way an explicit refusal
    // is. `writeInconclusive` lets the classifier say so honestly instead of reporting a
    // refusal that never happened.
    const code2 = (err as { code?: string } | null)?.code;
    return code2 === 'E_TIMEOUT'
      ? { pluginReachable: true, writeOk: false, writeInconclusive: true }
      : { pluginReachable: true, writeOk: false };
  }
}

function parseOverride(raw: string | undefined): Seat | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'free' || raw === 'paid') return raw;
  throw new CliError('E_INVALID_ARGS', `--seat must be 'free' or 'paid', got "${raw}"`);
}

export async function run(args: CommandArgs): Promise<SeatRouting> {
  const override = parseOverride(args.str('seat'));
  if (override !== undefined) {
    return route({ override, pluginReachable: false, writeOk: false });
  }
  const signals = await probeSignals();
  return route(signals);
}
