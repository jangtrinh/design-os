/**
 * Generic synchronous stdin reader — shared by any command that accepts `-`
 * as a file argument meaning "read from stdin".
 *
 * The `StdinReader` injection seam lets tests pass synthetic readers without
 * spawning a subprocess or touching real stdin.
 */

import { readSync } from "node:fs";
import { stdin } from "node:process";

// ─── Injection seam ───────────────────────────────────────────────────────────

/**
 * Read synchronously from stdin into `buf` at `offset` for up to `length`
 * bytes. Return bytes read (0 = EOF).
 */
export type StdinReader = (buf: Buffer, offset: number, length: number) => number;

/** Production implementation — reads from the real stdin fd. */
export function makeNodeStdinReader(): StdinReader {
  return (buf, offset, length) => readSync(stdin.fd, buf, offset, length, null);
}

// ─── readAllStdin ─────────────────────────────────────────────────────────────

/**
 * Drain stdin completely and return its contents as a UTF-8 string.
 * Uses a 64 KiB read buffer; loops until EOF (readSync returns 0).
 *
 * @param reader  Injection seam (defaults to real stdin).
 */
export function readAllStdin(reader: StdinReader = makeNodeStdinReader()): string {
  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(65536);
  let n: number;
  do {
    n = reader(buf, 0, buf.length);
    if (n > 0) chunks.push(Buffer.from(buf.subarray(0, n)));
  } while (n > 0);
  return Buffer.concat(chunks).toString("utf8");
}
