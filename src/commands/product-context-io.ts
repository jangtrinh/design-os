import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { errJson, errText, forTerminal } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";

export const MAX_RECEIPT_FILE_BYTES = 131_072;
export const MAX_COMPILE_INPUT_BYTES = 524_288;
export const MAX_ATLAS_FILE_BYTES = 2_097_152;

export interface BoundedOps {
  open(path: string): number;
  fstat(fd: number): { isFile(): boolean; size: number };
  read(fd: number, target: Buffer, offset: number, length: number): number;
  close(fd: number): void;
}

export type BoundedRead =
  { ok: true; bytes: Buffer } | { ok: false; code: string };

const nodeOps: BoundedOps = {
  open: (path) => openSync(path, "r"),
  fstat: fstatSync,
  read: (fd, target, offset, length) =>
    readSync(fd, target, offset, length, null),
  close: closeSync,
};

export function readBoundedFile(
  path: string,
  limit: number,
  tooLargeCode: string,
  ops: BoundedOps = nodeOps,
): BoundedRead {
  let fd: number;
  try {
    fd = ops.open(path);
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "FILE_NOT_FOUND"
        : "READ_ERROR";
    return { ok: false, code };
  }

  let overflow = false;
  let failed = false;
  const bytes = Buffer.alloc(limit + 1);
  let offset = 0;
  try {
    const stat = ops.fstat(fd);
    overflow = stat.isFile() && stat.size > limit;
    while (!overflow) {
      const count = ops.read(fd, bytes, offset, bytes.length - offset);
      if (count === 0) break;
      offset += count;
      overflow = offset === bytes.length;
    }
  } catch {
    failed = true;
  }
  try {
    ops.close(fd);
  } catch {
    if (!overflow) failed = true;
  }
  if (overflow) return { ok: false, code: tooLargeCode };
  if (failed) return { ok: false, code: "READ_ERROR" };
  const admitted = Buffer.alloc(offset);
  bytes.copy(admitted, 0, 0, offset);
  return { ok: true, bytes: admitted };
}

export function assertAtlasOutputSize(bytes: Buffer): string | undefined {
  return bytes.length > MAX_ATLAS_FILE_BYTES
    ? "PRODUCT_ATLAS_OUTPUT_TOO_LARGE"
    : undefined;
}

export class InvalidUtf8Error extends Error {}

export function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof TypeError) throw new InvalidUtf8Error();
    throw error;
  }
}

export type ProductContextMode = "text" | "json";

/**
 * The code names the class of failure; the message must name the instance.
 *
 * A message defaulted to its own code tells the operator nothing the code did not
 * already say — which file, which ceiling, which of the causes one code covers. So
 * callers pass one explicitly, and the two channels treat it differently: JSON
 * carries the raw string for an agent to parse, while the terminal gets a copy
 * through `forTerminal`, because a value lifted out of a path or an artifact can
 * otherwise forge a line or move the cursor. The cap is raised from the default
 * because a whole message legitimately runs longer than one lifted value; escaping,
 * not the cap, is what keeps it to a single line.
 */
export function productContextFailure(
  command: string,
  mode: ProductContextMode,
  code: string,
  message: string,
): CommandResult {
  if (mode === "json") {
    return errJson(command, code, message);
  }
  return errText(`ui: ${command}: ${forTerminal(message, 512)}\n`);
}

export function localProductContextArgs(
  parsed: ParsedArgs,
  command: string,
  min: number,
  max: number,
): { mode: ProductContextMode; bad?: CommandResult } {
  const mode = parsed.json ? "json" : "text";
  const invalidJson = parsed.flags.json !== undefined && parsed.flags.json !== true;
  const invalidArity = parsed.positionals.length < min || parsed.positionals.length > max;
  if (invalidJson || parsed.repeatedFlags.has("json") || invalidArity) {
    // `productContextFailure` already prefixes the command on the text channel, so the
    // message says only what is wrong — repeating the command printed it twice.
    const bound = min === max
      ? `exactly ${min}`
      : parsed.positionals.length < min ? `at least ${min}` : `at most ${max}`;
    const reason = invalidJson
      ? "--json takes no value"
      : parsed.repeatedFlags.has("json")
        ? "repeated flag: --json"
        : `expects ${bound} positional argument(s), got ${parsed.positionals.length}`;
    return { mode, bad: productContextFailure(command, mode, "BAD_ARG", reason) };
  }
  return { mode };
}

export type DecodedReceipts =
  | { ok: true; documents: unknown[] }
  | { ok: false; error: unknown; path: string };

/**
 * Decode and parse receipts ONE FILE AT A TIME.
 *
 * A single `map()` over the whole set collapses every malformed input into the same
 * anonymous throw, so a bad seventh receipt among twelve is indistinguishable from a
 * bad first one — precisely what the operator cannot act on. Pairing each buffer with
 * the path it came from costs one loop and makes the failure nameable.
 */
export function decodeReceipts(buffers: Buffer[], paths: string[]): DecodedReceipts {
  const documents: unknown[] = [];
  for (const [index, bytes] of buffers.entries()) {
    try {
      documents.push(JSON.parse(decodeUtf8(bytes)));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof InvalidUtf8Error) {
        return { ok: false, error, path: String(paths[index]) };
      }
      throw error;
    }
  }
  return { ok: true, documents };
}
