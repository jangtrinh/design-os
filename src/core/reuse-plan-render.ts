/**
 * Plain-text report for `ui reuse-plan check`. Everything lifted out of the plan file
 * (screen names, slots, component names) is author-controlled, so it passes through
 * `forTerminal` before it reaches stdout — a plan cannot forge a line of engine output.
 */
import { forTerminal } from "./output.js";
import type { CheckResult } from "./reuse-plan-check.js";

const MESSAGE_WIDTH = 400;

export function renderReusePlanText(file: string, registryPath: string, registrySize: number, r: CheckResult): string {
  const f = forTerminal(file, 300);
  const head = r.findings.length === 0
    ? `reuse-plan check: ok — ${r.screens.length} screen(s), 0 findings  [${f}]`
    : `reuse-plan check: ${r.findings.length} finding(s) in ${r.screens.length} screen(s)  [${f}]`;
  const lines = [head, `registry: ${forTerminal(registryPath, 300)} (${registrySize} registered names)`];

  for (const x of r.findings) {
    const where = [x.screen !== null ? `screen "${x.screen}"` : "", x.slot !== null && x.slot !== "" ? `slot "${x.slot}"` : ""].filter(Boolean).join(" · ");
    lines.push(`  ✗ ${x.code} ${f}:${x.line} — ${forTerminal(`${where === "" ? "" : `${where}: `}${x.message}`, MESSAGE_WIDTH)}`);
  }

  for (const s of r.screens) {
    const extra = [`pattern: ${s.pattern === null ? "none" : forTerminal(s.pattern, 200)}`, s.skipped > 0 ? `${s.skipped} skipped` : ""].filter(Boolean).join(" · ");
    lines.push(`screen: ${forTerminal(s.name, 200)} — reuse: ${s.reuse}/${s.total} · ${extra}`);
  }

  if (r.dsNew.length > 0) {
    lines.push(`ds-new (${r.dsNew.length} for the owner):`);
    for (const d of r.dsNew) {
      lines.push(`  - ds-new: ${forTerminal(d.name, 200)} — ${forTerminal(d.reason, 300)}  (${forTerminal(d.screen, 100)} · ${forTerminal(d.slot, 100)} · ${f}:${d.line})`);
    }
  }
  return lines.join("\n") + "\n";
}
