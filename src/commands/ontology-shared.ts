/**
 * What `ui ontology build` and `ui ontology lint` share: the project directory, the stored rulings, one read of every
 * source and the in-memory build. A failure to read becomes an exit-1 envelope that names the file or the store.
 */
import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { RulingStoreError, readRulingStore } from "../core/owner-rulings/ruling-store.js";
import type { Ruling } from "../core/owner-rulings/ruling-store.js";
import { buildOntology } from "../core/ontology/build-ontology.js";
import type { Built } from "../core/ontology/build-ontology.js";
import { readNodeSources } from "../core/ontology/node-sources.js";
import type { NodeSources } from "../core/ontology/node-sources.js";
import { OntologyReadError } from "../core/ontology/read-error.js";

export interface Prepared { dir: string; rulings: Ruling[]; sources: NodeSources; built: Built }

/** A failure as the text surface prints it: the meaning first, the code after it. */
export function fail(command: string, json: boolean, code: string, message: string): CommandResult {
  return json ? errJson(command, code, message) : errText(`ui: ${message} (${code})\n`);
}

export function prepare(parsed: ParsedArgs, command: string, known: readonly string[]): Prepared | CommandResult {
  const json = parsed.json;
  const unknown = findUnknownFlag(parsed.flags, known);
  if (unknown !== null) return fail(command, json, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  for (const key of known) if (parsed.flags[key] !== undefined && typeof parsed.flags[key] !== "string" && key !== "strict") return fail(command, json, "BAD_ARG", `--${key} needs a value`);
  const dir = resolve(typeof parsed.flags["dir"] === "string" ? parsed.flags["dir"] : process.cwd());
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return fail(command, json, "READ_ERROR", `cannot read the project directory '${dir}'`);
  try {
    const rulings = readRulingStore(dir).rulings;
    const sources = readNodeSources(dir, rulings);
    return { dir, rulings, sources, built: buildOntology(sources, rulings) };
  } catch (e) {
    if (e instanceof OntologyReadError || e instanceof RulingStoreError || e instanceof PendingStoreError) return fail(command, json, e.code, e.message);
    throw e;
  }
}

/** A `--out` or `--file` value as a path relative to the project, or the refusal that names it: it must be a file inside the project. */
export function insideProject(command: string, json: boolean, dir: string, flag: string, value: string): string | CommandResult {
  const rel = relative(dir, resolve(dir, value));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return fail(command, json, "BAD_ARG", `--${flag} '${value}' must be a file inside the project ${dir}`);
  return rel.split("\\").join("/");
}

export const isResult = (v: Prepared | CommandResult): v is CommandResult => "exitCode" in v;
