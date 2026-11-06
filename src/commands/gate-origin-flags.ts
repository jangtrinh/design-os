/**
 * `ui gate` flags for origin attribution and the baseline, plus their text
 * roll-up. Kept beside gate.ts so the command file stays a readable sequence.
 */
import { existsSync } from "node:fs";
import type { ParsedArgs } from "../core/cli-args.js";
import type { OriginSummary } from "../core/gate-origin-verdict.js";

export interface OriginFlags {
  originMode: boolean;
  kitPaths?: string[];
  srcPaths?: string[];
  baselinePath?: string;
  writeBaselinePath?: string;
}

/** Parse and validate the flags; a string is a BAD_ARG message. */
export function parseOriginFlags(parsed: ParsedArgs): OriginFlags | string {
  const list = (name: string): string[] | undefined | string => {
    const v = parsed.flags[name];
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.trim() === "") return `--${name} needs a comma-separated list of files or folders`;
    const paths = v.split(",").map((p) => p.trim()).filter(Boolean);
    const missing = paths.find((p) => !existsSync(p));
    return missing !== undefined ? `--${name} path '${missing}' does not exist` : paths;
  };
  const kit = list("kit");
  if (typeof kit === "string") return kit;
  const src = list("src");
  if (typeof src === "string") return src;
  if (kit !== undefined && src === undefined) {
    return "--kit needs --src: without the authored sources a kit class that an author also uses would be labelled kit, hiding authored debt";
  }
  const one = (name: string): string | undefined | { error: string } => {
    const v = parsed.flags[name];
    if (v === undefined) return undefined;
    return typeof v === "string" && v.trim() !== "" ? v : { error: `--${name} needs a file path` };
  };
  const baseline = one("baseline");
  if (typeof baseline === "object") return baseline.error;
  const write = one("write-baseline");
  if (typeof write === "object") return write.error;
  if (baseline !== undefined && write !== undefined) return "--baseline and --write-baseline are exclusive: write a baseline OR judge against one";
  if (baseline !== undefined && !existsSync(baseline)) return `--baseline '${baseline}' does not exist — create it with --write-baseline`;
  return {
    originMode: parsed.flags["origin"] !== undefined || kit !== undefined || src !== undefined,
    ...(kit !== undefined && { kitPaths: kit }),
    ...(src !== undefined && { srcPaths: src }),
    ...(baseline !== undefined && { baselinePath: baseline }),
    ...(write !== undefined && { writeBaselinePath: write }),
  };
}

/** The text roll-up printed under the gate header. */
export function originSummaryLines(s: OriginSummary): string[] {
  const out: string[] = [];
  if (s.byOrigin !== undefined) {
    const o = s.byOrigin;
    out.push(`  origin: authored ${o.authored.errors} error(s) / ${o.authored.warnings} warning(s); kit ${o.kit.errors} / ${o.kit.warnings}; framework ${o.framework.errors} / ${o.framework.warnings}; tool ${o.tool.errors} / ${o.tool.warnings} — only authored errors fail`);
    for (const r of (s.byRule ?? []).filter((x) => x.origin !== "authored")) {
      out.push(`    ${r.origin}: ${r.rule} — ${r.errors} error(s), ${r.warnings} warning(s)`);
    }
  }
  if (s.baselined.errors + s.baselined.warnings > 0) out.push(`  baselined: ${s.baselined.errors} error(s), ${s.baselined.warnings} warning(s) accepted`);
  if (s.baselineWritten !== undefined) out.push(`  baseline written: ${s.baselineWritten.path} (${s.baselineWritten.entries} finding(s))`);
  return out;
}
