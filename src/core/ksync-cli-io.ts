/** Small IO + error helpers shared by the three `ui ksync` subcommands. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { errJson, errText } from "./output.js";
import type { CommandResult } from "./output.js";
import type { ParsedArgs } from "./cli-args.js";

export class KsyncCliError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export const failWith = (parsed: ParsedArgs, sub: string, e: KsyncCliError): CommandResult =>
  parsed.json ? errJson(`ksync ${sub}`, e.code, e.message) : errText(`ui: ${e.message}\n`);

/** Read a JSON file; a missing or unparseable file becomes a coded error that says what to do next. */
export function readJsonFile(path: string, what: string, hint: string): unknown {
  let raw: string;
  try { raw = readFileSync(resolve(path), "utf8"); }
  catch { throw new KsyncCliError("FILE_NOT_FOUND", `cannot read ${what} '${path}'. ${hint}`); }
  try { return JSON.parse(raw); }
  catch { throw new KsyncCliError("BAD_JSON", `${what} '${path}' is not valid JSON`); }
}

/** A string-valued flag; a bare `--flag` with no value is a usage error, not an empty string. */
export function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new KsyncCliError("BAD_ARG", `--${name} requires a value`);
  return v;
}

export function requiredFlag(parsed: ParsedArgs, name: string): string {
  const v = stringFlag(parsed, name);
  if (v === undefined) throw new KsyncCliError("BAD_ARG", `--${name} is required`);
  return v;
}
