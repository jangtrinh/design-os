// Seat → bridge routing table (PURE, zero I/O — the deterministic core of
// `figma-agent seat`). The non-deterministic seat *probe* lives in
// commands/seat.ts; this file only decides, given probe signals, which bridge
// ease-design should drive. Every branch is unit-tested (tests/seat-routing.test.ts).
//
// Decision (locked, plan.md §Decisions):
//   free / starter seat → ease-design's own figma-agent CLI (Plugin API,
//                          editor rights on Figma Free, native variable binding)
//   paid full / dev seat → the official Figma MCP (use_figma, richer reads)
//   DesignAgent is NOT adopted — the figma-agent CLI supersedes it.

export type Seat = 'free' | 'paid';
export type Bridge = 'figma-agent-cli' | 'figma-mcp';

/** The routing table itself — the single source of the seat→bridge mapping. */
export const BRIDGE_FOR_SEAT: Readonly<Record<Seat, Bridge>> = {
  free: 'figma-agent-cli',
  paid: 'figma-mcp',
};

/** Pure routing table lookup: a classified seat → the bridge to drive. */
export function selectBridge(seat: Seat): Bridge {
  return BRIDGE_FOR_SEAT[seat];
}

/**
 * Signals the seat probe collects (or an explicit user override). All the
 * classifier ever sees — keeping it a pure function of observable inputs.
 *
 * NOTE on `paid`: a paid Figma MCP seat is NOT observable from inside the
 * figma-agent plugin probe (the Plugin API exposes no seat/entitlement signal).
 * So `paid` is reachable only via an explicit `--seat paid` override; the probe
 * confirms the free/editor-rights path positively and defaults there.
 */
export interface ProbeSignals {
  /** Explicit `--seat free|paid` — when set, skips the probe entirely. */
  override?: Seat;
  /** STATUS round-trip succeeded (the plugin is reachable). */
  pluginReachable: boolean;
  /** A throwaway setSharedPluginData write round-tripped (editor rights). */
  writeOk: boolean;
}

/** A classified seat plus the human-readable reason it was chosen. */
export interface SeatClassification {
  seat: Seat;
  reason: string;
}

const PAID_HINT =
  'A paid Figma MCP seat is not probe-detectable — pass --seat paid to route to it.';

/**
 * Classify a seat from probe signals (PURE). An explicit override always wins;
 * otherwise the probe can only positively confirm the free/editor-rights path,
 * so it defaults to `free` and explains why in `reason`.
 */
export function classifySeat(s: ProbeSignals): SeatClassification {
  if (s.override !== undefined) {
    return { seat: s.override, reason: `seat forced to '${s.override}' via --seat (probe skipped)` };
  }
  if (!s.pluginReachable) {
    return {
      seat: 'free',
      reason: `figma-agent plugin not reachable — defaulting to the figma-agent-cli bridge (open the Ease Design Figma Agent plugin in Figma Desktop). ${PAID_HINT}`,
    };
  }
  if (s.writeOk) {
    return {
      seat: 'free',
      reason: `figma-agent plugin reachable and editable (throwaway setSharedPluginData write round-tripped) — Figma Free / editor rights confirmed. ${PAID_HINT}`,
    };
  }
  return {
    seat: 'free',
    reason: `figma-agent plugin reachable but the throwaway write was refused (possible view-only access) — still routing to the figma-agent-cli bridge. ${PAID_HINT}`,
  };
}

/** The full routing result the `seat` command emits. */
export interface SeatRouting {
  seat: Seat;
  bridge: Bridge;
  reason: string;
}

/** Compose classification + routing table into the emitted result (PURE). */
export function route(s: ProbeSignals): SeatRouting {
  const { seat, reason } = classifySeat(s);
  return { seat, bridge: selectBridge(seat), reason };
}
