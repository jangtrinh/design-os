/**
 * `ui export` — export a single HTML file as a self-contained document.
 *
 * hasSubcommands: false
 * Positional [0]: input HTML file
 * --out <path>:   explicit output path (default: same dir, safe filename)
 * --title <s>:    override <title> tag
 * --minify:       collapse whitespace and strip comments
 * --zip:          not yet implemented (exits 2, NOT_IMPLEMENTED)
 *
 * Side effect: writes one output file. Text mode reports on stderr; --json
 * reports on stdout. Nothing written to stdout in text mode.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import { cleanHtmlForExport, minifyHtml, toSafeFilename } from "../core/html-export.js";

const CMD = "export";

export const EXPORT_HELP = `ui export — export HTML as a standalone self-contained file

Usage:
  ui export <file.html> [--out <path>] [--title <s>] [--minify] [--json]

Options:
  --out <path>   Output file path (default: <input-dir>/<safe-name>.html)
  --title <s>    Override the <title> tag (default: existing title or basename)
  --minify       Collapse whitespace, remove comments, strip blank lines
  --json         Emit a JSON envelope instead of writing to stderr
  --zip          Not yet implemented; single-file export only (exits 2)
  -h, --help     Show this help

Text mode: reports "wrote: <path> (<bytes> bytes)" on stderr.

Error codes:
  BAD_ARG          Missing input file
  FILE_NOT_FOUND   Input file does not exist
  READ_ERROR       Input file cannot be read
  WRITE_ERROR      Output file cannot be written
  NOT_IMPLEMENTED  --zip is not available in this release
`;

// Extract existing <title> text, or fall back to a safe filename derived from basename.
function extractTitle(html: string, fallback: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m?.[1]?.trim() || fallback;
}

export const exportCommand = {
  name: CMD,
  summary: "Export HTML as a standalone self-contained file",
  hasSubcommands: false,
  help: EXPORT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // --zip is not yet implemented; single-file HTML export only for now
    if (parsed.flags["zip"] === true) {
      const msg = "--zip export is not yet implemented — single-file export only for now";
      return useJson
        ? { exitCode: 2, stdout: JSON.stringify({ ok: false, command: CMD, error: { code: "NOT_IMPLEMENTED", message: msg } }, null, 2) + "\n" }
        : { exitCode: 2, stderr: `ui: ${msg}\n` };
    }

    const inputPath = parsed.positionals[0];
    if (inputPath === undefined) {
      const msg = "ui export requires a <file.html> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    const absInput = resolve(inputPath);
    let raw: string;
    try {
      raw = readFileSync(absInput, "utf8");
    } catch (e) {
      const isNotFound =
        e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound
        ? `file not found: '${inputPath}'`
        : `cannot read '${inputPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }

    // Resolve title: --title flag > existing <title> > raw basename (human-readable)
    const base = basename(absInput, extname(absInput));
    const titleFlag = parsed.flags["title"];
    const title =
      typeof titleFlag === "string"
        ? titleFlag
        : extractTitle(raw, base);

    // Resolve output path: --out flag > same dir with safe name
    const outFlag = parsed.flags["out"];
    const outputPath =
      typeof outFlag === "string"
        ? resolve(outFlag)
        : resolve(dirname(absInput), toSafeFilename(base) + ".html");

    const doMinify = parsed.flags["minify"] === true;

    let exported = cleanHtmlForExport(raw, title);
    if (doMinify) exported = minifyHtml(exported);

    try {
      writeFileSync(outputPath, exported, "utf8");
    } catch (e) {
      const msg = `cannot write '${outputPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    const bytes = Buffer.byteLength(exported, "utf8");

    if (useJson) {
      return okJson(CMD, {
        inputFile: absInput,
        outputFile: outputPath,
        bytes,
        minified: doMinify,
        title,
      });
    }

    return { exitCode: 0, stderr: `wrote: ${outputPath} (${bytes} bytes)\n` };
  },
};
