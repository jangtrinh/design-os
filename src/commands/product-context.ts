import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { compileProductContext } from "../core/product-context-compile.js";
import { lintProductContext } from "../core/product-context-lint.js";
import { ProductContextError, canonicalDigest, normalizeProductAtlas as normalizeAtlas } from "../core/product-context-model.js";
import {
  InvalidUtf8Error,
  MAX_ATLAS_FILE_BYTES,
  MAX_COMPILE_INPUT_BYTES,
  MAX_RECEIPT_FILE_BYTES,
  assertAtlasOutputSize,
  decodeUtf8,
  readBoundedFile,
} from "./product-context-io.js";
export { assertAtlasOutputSize, readBoundedFile } from "./product-context-io.js";

const CMD = "product-context";
export const PRODUCT_CONTEXT_HELP = `ui product-context — compile and replay-lint product context

Usage:
  ui product-context compile <receipt.json>... [--json]
  ui product-context lint <atlas.json> [--json]

Subcommands:
  compile  Compile receipts into a canonical Product Atlas
  lint     Replay and byte-compare a canonical Product Atlas

Options:
  --json      Emit a JSON envelope
  -h, --help  Show this help

Error codes:
  BAD_ARG PRODUCT_CONTEXT_RECEIPT_TOO_LARGE PRODUCT_CONTEXT_INPUT_TOO_LARGE
  PRODUCT_ATLAS_OUTPUT_TOO_LARGE PRODUCT_ATLAS_INPUT_TOO_LARGE
  PRODUCT_CONTEXT_OMITTED_COUNT_OVERFLOW BAD_PRODUCT_CONTEXT BAD_PRODUCT_ATLAS
  PRODUCT_ID_MISMATCH FILE_NOT_FOUND READ_ERROR UNKNOWN_FLAG
`;
function failure(command: string, mode: "text" | "json", code: string, message = code): CommandResult {
  return mode === "json"
    ? errJson(command, code, message)
    : errText(`ui: ${command}: ${message}\n`);
}
export function buildProductContextCompileResult(context: {
  command: "product-context compile";
  mode: "text" | "json";
  atlasBytes: Buffer;
  data: Record<string, unknown>;
}): CommandResult {
  const tooLarge = assertAtlasOutputSize(context.atlasBytes);
  if (tooLarge !== undefined)
    return failure(context.command, context.mode, tooLarge);
  const exitCode = Number(context.data.errorCount ?? 0) > 0 ? 1 : 0;
  return context.mode === "text"
    ? { exitCode, stdout: context.atlasBytes.toString("utf8") }
    : okJsonWithExit(context.command, context.data, exitCode);
}
function local(
  parsed: ParsedArgs,
  command: string,
  min: number,
  max: number,
): { mode: "text" | "json"; bad?: CommandResult } {
  const mode = parsed.json ? "json" : "text";
  if (
    (parsed.flags.json !== undefined && parsed.flags.json !== true) ||
    parsed.repeatedFlags.has("json") ||
    parsed.positionals.length < min ||
    parsed.positionals.length > max
  )
    return {
      mode,
      bad: failure(command, mode, "BAD_ARG", `${command}: invalid arguments`),
    };
  return { mode };
}
function normalizeProductAtlas(value: unknown): ReturnType<typeof normalizeAtlas> {
  return normalizeAtlas(value);
}
function compileError(error: unknown): string {
  if (error instanceof ProductContextError)
    return error.name === "ProductIdMismatch"
      ? "PRODUCT_ID_MISMATCH"
      : error.name === "OmittedOverflow"
        ? "PRODUCT_CONTEXT_OMITTED_COUNT_OVERFLOW"
        : "BAD_PRODUCT_CONTEXT";
  return "BAD_PRODUCT_CONTEXT";
}
export function runProductContextCompile(parsed: ParsedArgs): CommandResult {
  const command = "product-context compile";
  const checked = local(parsed, command, 1, 1024);
  if (checked.bad !== undefined) return checked.bad;
  const raw: Buffer[] = [];
  let total = 0;
  for (const path of parsed.positionals) {
    const read = readBoundedFile(
      path,
      MAX_RECEIPT_FILE_BYTES,
      "PRODUCT_CONTEXT_RECEIPT_TOO_LARGE",
    );
    if (!read.ok) return failure(command, checked.mode, read.code);
    if (read.bytes.length > MAX_COMPILE_INPUT_BYTES - total)
      return failure(command, checked.mode, "PRODUCT_CONTEXT_INPUT_TOO_LARGE");
    total += read.bytes.length;
    raw.push(read.bytes);
  }
  let result;
  try {
    result = compileProductContext(
      raw.map((bytes) => JSON.parse(decodeUtf8(bytes))),
    );
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof InvalidUtf8Error ||
      error instanceof ProductContextError
    )
      return failure(command, checked.mode, compileError(error));
    throw error;
  }
  const outputCode = assertAtlasOutputSize(result.atlasBytes);
  if (outputCode !== undefined)
    return failure(command, checked.mode, outputCode);
  return buildProductContextCompileResult({
    command,
    mode: checked.mode,
    atlasBytes: result.atlasBytes,
    data: {
      atlas: result.atlas,
      atlasDigest: canonicalDigest(result.atlas),
      findings: result.findings,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
    },
  });
}
export function runProductContextLint(parsed: ParsedArgs): CommandResult {
  const command = "product-context lint";
  const checked = local(parsed, command, 1, 1);
  if (checked.bad !== undefined) return checked.bad;
  const path = parsed.positionals[0];
  if (path === undefined) return failure(command, checked.mode, "BAD_ARG");
  const read = readBoundedFile(
    path,
    MAX_ATLAS_FILE_BYTES,
    "PRODUCT_ATLAS_INPUT_TOO_LARGE",
  );
  if (!read.ok) return failure(command, checked.mode, read.code);
  let result;
  try {
    const raw = JSON.parse(decodeUtf8(read.bytes));
    normalizeProductAtlas(raw);
    result = lintProductContext(raw, read.bytes);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof InvalidUtf8Error ||
      error instanceof ProductContextError ||
      (error instanceof Error && error.message === "BAD_PRODUCT_ATLAS")
    )
      return failure(command, checked.mode, "BAD_PRODUCT_ATLAS");
    throw error;
  }
  const data = {
    atlas: result.atlas,
    atlasDigest: canonicalDigest(result.atlas),
    findings: result.findings,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
  };
  const exitCode = result.errorCount > 0 ? 1 : 0;
  return checked.mode === "json"
    ? okJsonWithExit(command, data, exitCode)
    : { exitCode, stdout: result.atlasBytes.toString("utf8") };
}
export const productContextCommand = {
  name: CMD,
  summary: "Compile and replay-lint Product Context Atlases",
  hasSubcommands: true,
  help: PRODUCT_CONTEXT_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "compile":
        return runProductContextCompile(parsed);
      case "lint":
        return runProductContextLint(parsed);
      default:
        return failure(
          CMD,
          parsed.json ? "json" : "text",
          "BAD_ARG",
          "product-context requires compile or lint",
        );
    }
  },
};
