/** `ui design principles-index <principles.md> --out <principles.json> [--check]` — the index emitter. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, ok, okJson, okJsonWithExit } from "../core/output.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { buildPrinciplesIndex, serializePrinciplesIndex } from "../core/design-dir-principles.js";

const SUB = "design principles-index";
const err = (json: boolean, code: string, message: string): CommandResult =>
  json ? errJson(SUB, code, message) : errText(`ui: ${message}\n`);

export function runPrinciplesIndex(parsed: ParsedArgs): CommandResult {
  const j = parsed.json;
  const unknown = findUnknownFlag(parsed.flags, ["out", "check"]);
  if (unknown !== null) return err(j, "UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const out = parsed.flags["out"];
  if (parsed.positionals.length !== 1 || typeof out !== "string") {
    return err(j, "BAD_ARG", "ui design principles-index requires <principles.md> and --out <principles.json>");
  }
  const check = parsed.flags["check"] === true;
  const src = resolve(parsed.positionals[0]!);
  let markdown: string;
  try { markdown = readFileSync(src, "utf8"); }
  catch { return err(j, "FILE_NOT_FOUND", `cannot read '${src}'`); }

  const { index, problems } = buildPrinciplesIndex(markdown, basename(src));
  if (problems.length > 0) {
    return err(j, "BAD_PRINCIPLES", problems.map((p) => p.message).join("; "));
  }
  const bytes = serializePrinciplesIndex(index);
  const target = resolve(out);
  if (check) {
    const status = !existsSync(target) ? "missing" : readFileSync(target, "utf8") === bytes ? "in-sync" : "drift";
    const data = { index: target, status, principles: index.principles.length };
    const exit = status === "in-sync" ? 0 : 1;
    if (j) return okJsonWithExit(SUB, data, exit);
    const hint = status === "in-sync" ? "" : ` — run: ui design principles-index ${parsed.positionals[0]} --out ${out}`;
    return { exitCode: exit, stdout: `principles index ${status} (${index.principles.length} principles)${hint}\n` };
  }
  try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  catch { return err(j, "WRITE_ERROR", `cannot write '${target}'`); }
  const data = { index: target, status: "written", principles: index.principles.length };
  return j ? okJson(SUB, data) : ok(`principles index written: ${index.principles.length} principles → ${target}\n`);
}
