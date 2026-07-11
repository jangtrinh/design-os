/**
 * The flow artefact (DESIGN-OS T3) — the smallest true model of a multi-screen design:
 * screens (each with its data-lifecycle *states*), transitions, and entry points.
 *
 * Statechart vocabulary (states / transitions / guards / entries), navigation scope.
 * Guards are DECLARED for linting + handoff, NEVER executed — the moment you run them
 * you've built an app and lost determinism. Pointer states (hover/focus/pressed) are
 * deliberately out; they're within-screen (CSS), not flow nodes.
 *
 * This module owns the shape + parse/validate. flow-lint.ts owns the graph checks.
 */
export const TRIGGERS = ["ON_CLICK", "ON_HOVER", "ON_PRESS", "AFTER_DELAY", "ON_KEY", "ON_SUBMIT"] as const;
export type Trigger = (typeof TRIGGERS)[number];

/** Modes that render data and therefore need empty/skeleton/error states. */
export const DATA_MODES = new Set(["dashboard", "admin", "ecommerce", "app"]);

export interface FlowScreen {
  id: string;
  name?: string;
  mode?: string;
  artifact?: string;
  states: string[]; // always includes an implicit "default" if empty
  terminal: boolean;
}
export interface FlowTransition {
  id: string;
  from: string; // "screenId" or "screenId.stateId"
  to: string;   // "screenId" or "screenId.stateId"
  trigger: string;
  label?: string;
  source?: string;
  guard?: string;
  async: boolean;
}
export interface FlowEntry {
  id: string;
  screen: string;
  name?: string;
}
export interface Flow {
  name?: string;
  screens: FlowScreen[];
  transitions: FlowTransition[];
  entryPoints: FlowEntry[];
}

export class FlowError extends Error {
  constructor(readonly code: "BAD_FLOW", message: string) {
    super(message);
  }
}

function obj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function str(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** Parse + structurally validate a flow.json. Throws FlowError("BAD_FLOW") on a shape error. */
export function parseFlow(json: unknown, path = "flow.json"): Flow {
  if (!obj(json) || !Array.isArray(json["screens"]) || !Array.isArray(json["transitions"])) {
    throw new FlowError("BAD_FLOW", `${path} must be { screens:[…], transitions:[…], entryPoints?:[…] }`);
  }
  const screens: FlowScreen[] = [];
  const seenScreen = new Set<string>();
  for (const s of json["screens"] as unknown[]) {
    if (!obj(s) || !str(s["id"])) throw new FlowError("BAD_FLOW", `each screen needs a non-empty string id (${path})`);
    if (seenScreen.has(s["id"])) throw new FlowError("BAD_FLOW", `duplicate screen id '${s["id"]}' (${path})`);
    seenScreen.add(s["id"]);
    const states = Array.isArray(s["states"]) ? (s["states"] as unknown[]).filter(str) : [];
    screens.push({
      id: s["id"],
      ...(str(s["name"]) ? { name: s["name"] } : {}),
      ...(str(s["mode"]) ? { mode: s["mode"] } : {}),
      ...(str(s["artifact"]) ? { artifact: s["artifact"] } : {}),
      states: states.length > 0 ? states : ["default"],
      terminal: s["terminal"] === true,
    });
  }

  const transitions: FlowTransition[] = [];
  const seenTr = new Set<string>();
  for (const t of json["transitions"] as unknown[]) {
    if (!obj(t) || !str(t["id"]) || !str(t["from"]) || !str(t["to"]) || !str(t["trigger"])) {
      throw new FlowError("BAD_FLOW", `each transition needs id/from/to/trigger strings (${path})`);
    }
    if (seenTr.has(t["id"])) throw new FlowError("BAD_FLOW", `duplicate transition id '${t["id"]}' (${path})`);
    seenTr.add(t["id"]);
    transitions.push({
      id: t["id"], from: t["from"], to: t["to"], trigger: t["trigger"],
      ...(str(t["label"]) ? { label: t["label"] } : {}),
      ...(str(t["source"]) ? { source: t["source"] } : {}),
      ...(str(t["guard"]) ? { guard: t["guard"] } : {}),
      async: t["async"] === true,
    });
  }

  const entryPoints: FlowEntry[] = [];
  if (Array.isArray(json["entryPoints"])) {
    for (const e of json["entryPoints"] as unknown[]) {
      if (!obj(e) || !str(e["id"]) || !str(e["screen"])) throw new FlowError("BAD_FLOW", `each entryPoint needs id + screen (${path})`);
      entryPoints.push({ id: e["id"], screen: e["screen"], ...(str(e["name"]) ? { name: e["name"] } : {}) });
    }
  }

  return { ...(str(json["name"]) ? { name: json["name"] } : {}), screens, transitions, entryPoints };
}

/** Split "screenId.stateId" → [screenId, stateId?]. A bare screen id has no state part. */
export function splitNode(node: string): { screen: string; state?: string } {
  const dot = node.indexOf(".");
  return dot === -1 ? { screen: node } : { screen: node.slice(0, dot), state: node.slice(dot + 1) };
}
