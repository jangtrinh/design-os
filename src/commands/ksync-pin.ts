/** `ui ksync pin <route> --file <key> --node <id>` — record the frame a built route was built against. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { okJson, ok } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { emptyPins, parsePins, PinsError, serializePins, upsertPin } from "../core/ksync-pins.js";
import type { KsyncPin } from "../core/ksync-pins.js";
import { failWith, KsyncCliError, requiredFlag, stringFlag } from "../core/ksync-cli-io.js";

export const DEFAULT_PINS_PATH = "design/ksync/pins.json";

function headSha(): string {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { throw new KsyncCliError("BAD_ARG", "cannot read the git HEAD here — run inside a git repo or pass --commit <sha>"); }
}

export function runPin(parsed: ParsedArgs): CommandResult {
  try {
    const route = parsed.positionals[0];
    if (route === undefined) throw new KsyncCliError("BAD_ARG", "ui ksync pin requires <route>");
    const file = requiredFlag(parsed, "file");
    const node = requiredFlag(parsed, "node");
    const path = resolve(stringFlag(parsed, "pins") ?? DEFAULT_PINS_PATH);
    const at = stringFlag(parsed, "at");
    if (at !== undefined && Number.isNaN(Date.parse(at))) throw new KsyncCliError("BAD_ARG", `--at '${at}' is not an ISO instant`);
    const specHash = stringFlag(parsed, "spec-hash");
    const pin: KsyncPin = {
      route, file, node, pinnedAt: new Date(at ?? Date.now()).toISOString(), builtFrom: stringFlag(parsed, "commit") ?? headSha(),
      ...(specHash !== undefined ? { specHash } : {}),
    };

    let doc = emptyPins();
    if (existsSync(path)) {
      try { doc = parsePins(JSON.parse(readFileSync(path, "utf8"))); }
      catch (e) { throw new KsyncCliError("BAD_PINS", `${path}: ${e instanceof PinsError ? e.message : "not valid JSON"}`); }
    }
    const { doc: next, created } = upsertPin(doc, pin);
    try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, serializePins(next)); }
    catch { throw new KsyncCliError("WRITE_ERROR", `cannot write pins file '${path}'`); }
    const data = { pins: path, action: created ? "created" : "updated", pin, total: next.pins.length };
    return parsed.json ? okJson("ksync pin", data) : ok(`ksync pin: ${data.action} ${route} → ${file} ${node} (${next.pins.length} pin(s) in ${path})\n`);
  } catch (e) {
    if (e instanceof KsyncCliError) return failWith(parsed, "pin", e);
    throw e;
  }
}
