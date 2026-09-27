/** `ui ksync drift --pins <pins.json> --frames <frames.json>` — did any pinned frame move since the pin? */
import { okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { computeDrift } from "../core/ksync-drift.js";
import { IngestError, parseIngest, toMs } from "../core/ksync-ingest.js";
import { parsePins, PinsError } from "../core/ksync-pins.js";
import { failWith, KsyncCliError, readJsonFile, requiredFlag, stringFlag } from "../core/ksync-cli-io.js";

export function runDrift(parsed: ParsedArgs): CommandResult {
  try {
    const pinsPath = requiredFlag(parsed, "pins");
    const framesPath = requiredFlag(parsed, "frames");
    const maxRaw = stringFlag(parsed, "max-age-days") ?? "14";
    const maxAgeDays = Number(maxRaw);
    if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) throw new KsyncCliError("BAD_ARG", `--max-age-days '${maxRaw}' must be a non-negative number`);
    const nowRaw = stringFlag(parsed, "now");
    const nowMs = nowRaw === undefined ? Date.now() : toMs(nowRaw);
    if (nowMs === null) throw new KsyncCliError("BAD_ARG", `--now '${nowRaw}' is not an ISO instant`);

    let pins, ingest;
    try { pins = parsePins(readJsonFile(pinsPath, "pins file", "Create it with 'ui ksync pin <route> --file <key> --node <id>'.")); }
    catch (e) { throw e instanceof PinsError ? new KsyncCliError("BAD_PINS", `${pinsPath}: ${e.message}`) : e; }
    try { ingest = parseIngest(readJsonFile(framesPath, "frames file", "Capture the Figma frames with the host and pass the file here — the kernel never calls Figma.")); }
    catch (e) { throw e instanceof IngestError ? new KsyncCliError("BAD_FRAMES", `${framesPath}: ${e.message}`) : e; }

    const report = computeDrift(pins.pins, ingest, { nowMs, maxAgeDays });
    const warnOnly = parsed.flags["warn-only"] === true;
    const exitCode = report.verdict === "CLEAN" || warnOnly ? 0 : 1;
    if (parsed.json) return okJsonWithExit("ksync drift", { ...report, warnOnly, pins: pinsPath, frames: framesPath }, exitCode);
    const c = report.counts;
    const age = report.ingestAgeDays === null ? "unknown age" : `${report.ingestAgeDays}d old`;
    const lines = [
      `ksync drift: ${report.verdict} — ${pins.pins.length} pin(s): ok ${c.OK} / drift ${c.DRIFT} / missing ${c.MISSING} / uncheckable ${c.UNCHECKABLE}; ingest ${age} (max ${maxAgeDays}d)`,
      ...(report.verdict === "STALE-INGEST" ? ["  ✗ the ingest is older than the limit (or undated): re-capture the frames before trusting any verdict"] : []),
      ...(report.verdict === "EMPTY" ? ["  ✗ no pins to check: run 'ui ksync pin' for the routes you built"] : []),
      ...report.results.filter((r) => r.state !== "OK").map((r) => `  ✗ ${r.state} ${r.route} ${r.node}: ${r.reason}`),
    ];
    return { exitCode, stdout: `${lines.join("\n")}\n` };
  } catch (e) {
    if (e instanceof KsyncCliError) return failWith(parsed, "drift", e);
    throw e;
  }
}
