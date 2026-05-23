/**
 * `ui parse-json-stream` — extract all complete JSON objects from a buffer.
 *
 * hasSubcommands: false
 * Positional [0]: file path or `-` (stdin)
 * --strict: exit 1 INCOMPLETE_STREAM if remainder is non-empty
 * --json: emit JsonEnvelope (full object array + remainder)
 * Text mode: NDJSON on stdout, summary on stderr
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { readAllStdin } from "../core/stdin-reader.js";
import { parseJsonStream } from "../core/stream-parse.js";

const CMD = "parse-json-stream";

export const PARSE_JSON_STREAM_HELP = `ui parse-json-stream — extract JSON objects from a concatenated stream

Usage:
  ui parse-json-stream <file|-> [--strict] [--json]

Options:
  --strict   Exit 1 (INCOMPLETE_STREAM) if any trailing bytes remain unparsed
  --json     Emit a JSON envelope with all objects and the remainder string
  -h, --help Show this help

Text mode output:
  stdout — one JSON object per line (NDJSON)
  stderr — "parsed N objects, M trailing bytes"

Error codes:
  BAD_ARG             Missing file argument
  FILE_NOT_FOUND      File does not exist
  READ_ERROR          File exists but cannot be read
  INCOMPLETE_STREAM   Non-empty remainder with --strict
`;

export const parseJsonStreamCommand = {
  name: CMD,
  summary: "Extract concatenated JSON objects from a file or stdin",
  hasSubcommands: false,
  help: PARSE_JSON_STREAM_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const strict = parsed.flags["strict"] === true;

    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui parse-json-stream requires a <file|-> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    let raw: string;
    if (filePath === "-") {
      try {
        raw = readAllStdin();
      } catch (e) {
        const msg = `cannot read from stdin: ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    } else {
      const abs = resolve(filePath);
      try {
        raw = readFileSync(abs, "utf8");
      } catch (e) {
        const isNotFound =
          e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
        const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
        const msg = isNotFound
          ? `file not found: '${filePath}'`
          : `cannot read '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
      }
    }

    const { objects, remainder } = parseJsonStream(raw);

    const trimmedRemainder = remainder.trim();
    if (strict && trimmedRemainder.length > 0) {
      const msg = `stream has ${trimmedRemainder.length} trailing unparsed bytes`;
      return useJson
        ? errJson(CMD, "INCOMPLETE_STREAM", msg)
        : errText(`ui: ${msg}\n`);
    }

    if (useJson) {
      return okJson(CMD, {
        file: filePath,
        count: objects.length,
        objects,
        remainder,
      });
    }

    // Text mode: NDJSON on stdout, summary on stderr
    const ndjson = objects.map((o) => JSON.stringify(o)).join("\n");
    const stdout = objects.length > 0 ? ndjson + "\n" : "";
    const stderr = `parsed ${objects.length} objects, ${remainder.length} trailing bytes\n`;
    return { exitCode: 0, stdout, stderr };
  },
};
