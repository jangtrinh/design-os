/**
 * `ui flow lint` — the deterministic IA checks (DESIGN-OS T3). Pure graph/set algorithms
 * over a parsed Flow: reachability, dead ends, missing error/empty states, dangling
 * references, guarded-without-else, orphan screens. Nobody else deterministically lints
 * an information architecture — this is the moat. No browser, no network.
 */
import { TRIGGERS, DATA_MODES, splitNode } from "./flow-model.js";
import type { Flow } from "./flow-model.js";

export type FlowSeverity = "error" | "warning";
export interface FlowFinding {
  checkId: string;
  severity: FlowSeverity;
  message: string;
}
export interface FlowLintResult {
  findings: FlowFinding[];
  errorCount: number;
  warningCount: number;
}

export function lintFlow(flow: Flow): FlowLintResult {
  const findings: FlowFinding[] = [];
  const err = (checkId: string, message: string): void => { findings.push({ checkId, severity: "error", message }); };
  const warn = (checkId: string, message: string): void => { findings.push({ checkId, severity: "warning", message }); };

  const screenIds = new Set(flow.screens.map((s) => s.id));
  const statesOf = new Map(flow.screens.map((s) => [s.id, new Set(s.states)]));

  // ── dangling-ref + invalid-trigger + noop-self-loop (per transition) ──
  const outByScreen = new Map<string, typeof flow.transitions>();
  const inScreens = new Set<string>();
  const targetedStates = new Set<string>(); // "screen.state" actually targeted
  for (const t of flow.transitions) {
    const f = splitNode(t.from), to = splitNode(t.to);
    if (!screenIds.has(f.screen)) err("dangling-ref", `transition ${t.id}: from screen '${f.screen}' does not exist`);
    else if (f.state !== undefined && !(statesOf.get(f.screen)?.has(f.state) ?? false)) err("dangling-ref", `transition ${t.id}: from state '${t.from}' does not exist`);
    if (!screenIds.has(to.screen)) err("dangling-ref", `transition ${t.id}: to screen '${to.screen}' does not exist`);
    else if (to.state !== undefined && !(statesOf.get(to.screen)?.has(to.state) ?? false)) err("dangling-ref", `transition ${t.id}: to state '${t.to}' does not exist`);
    if (!(TRIGGERS as readonly string[]).includes(t.trigger)) err("invalid-trigger", `transition ${t.id}: unknown trigger '${t.trigger}' (expected ${TRIGGERS.join("/")})`);
    if (t.from === t.to) err("noop-self-loop", `transition ${t.id}: from and to are identical ('${t.from}')`);

    const list = outByScreen.get(f.screen) ?? [];
    list.push(t);
    outByScreen.set(f.screen, list);
    if (screenIds.has(to.screen)) inScreens.add(to.screen);
    if (to.state !== undefined) targetedStates.add(t.to);
  }

  // ── entry points ──
  if (flow.entryPoints.length === 0) err("no-entry", "flow has no entryPoints — nothing can be reached");
  for (const e of flow.entryPoints) {
    if (!screenIds.has(e.screen)) err("dangling-ref", `entryPoint ${e.id}: screen '${e.screen}' does not exist`);
  }

  // ── reachability (BFS from entry screens over transitions) ──
  const entryScreens = flow.entryPoints.map((e) => e.screen).filter((s) => screenIds.has(s));
  const reachable = new Set<string>(entryScreens);
  const queue = [...entryScreens];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    for (const t of outByScreen.get(cur) ?? []) {
      const to = splitNode(t.to).screen;
      if (screenIds.has(to) && !reachable.has(to)) { reachable.add(to); queue.push(to); }
    }
  }

  // ── reverse reachability (can each screen get BACK to an entry screen?) ──
  const backReachable = new Set<string>(entryScreens);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of flow.transitions) {
      const f = splitNode(t.from).screen, to = splitNode(t.to).screen;
      if (backReachable.has(to) && !backReachable.has(f) && screenIds.has(f)) { backReachable.add(f); grew = true; }
    }
  }

  // ── per-screen checks ──
  for (const s of flow.screens) {
    const outs = outByScreen.get(s.id) ?? [];
    const hasIn = inScreens.has(s.id);
    const isEntry = entryScreens.includes(s.id);

    if (!hasIn && outs.length === 0 && !isEntry) warn("orphan-screen", `screen '${s.id}' is declared but wired to nothing (no in/out transitions)`);
    if (!reachable.has(s.id)) err("unreachable-screen", `screen '${s.id}' is not reachable from any entry point`);
    if (!s.terminal && outs.length === 0) err("dead-end", `screen '${s.id}' is not terminal but has no outgoing transition (a dead end)`);
    if (!isEntry && !s.terminal && !backReachable.has(s.id) && reachable.has(s.id)) warn("missing-back-path", `screen '${s.id}' can be reached but has no path back to an entry — is the back/home nav missing?`);

    // declared non-default states that nothing targets → decorative
    for (const st of s.states) {
      if (st === "default") continue;
      if (!targetedStates.has(`${s.id}.${st}`)) warn("unreachable-state", `screen '${s.id}' declares state '${st}' but no transition targets '${s.id}.${st}'`);
    }

    // async/submit screen must declare an error state
    const hasAsync = outs.some((t) => t.async || t.trigger === "ON_SUBMIT");
    if (hasAsync && !s.states.includes("error")) err("missing-error-state", `screen '${s.id}' has an async/submit transition but declares no 'error' state`);

    // data-bearing modes must declare empty + skeleton
    if (s.mode !== undefined && DATA_MODES.has(s.mode)) {
      if (!s.states.includes("empty")) warn("missing-empty-state", `data screen '${s.id}' (${s.mode}) declares no 'empty' state`);
      if (!s.states.includes("skeleton")) warn("missing-skeleton", `data screen '${s.id}' (${s.mode}) declares no 'skeleton' state`);
    }
  }

  // ── guard-without-complement: a guarded transition whose from-node has no sibling ──
  for (const [screen, outs] of outByScreen) {
    const guarded = outs.filter((t) => t.guard !== undefined);
    for (const g of guarded) {
      const siblings = outs.filter((t) => t.id !== g.id && splitNode(t.from).state === splitNode(g.from).state);
      if (siblings.length === 0) warn("guard-without-complement", `transition ${g.id} on '${screen}' is guarded ('${g.guard}') but has no complementary (else) transition — the negative branch is a trap`);
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.checkId.localeCompare(b.checkId) || a.message.localeCompare(b.message));
  const errorCount = findings.filter((f) => f.severity === "error").length;
  return { findings, errorCount, warningCount: findings.length - errorCount };
}
