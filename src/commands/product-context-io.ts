import { closeSync, fstatSync, openSync, readSync } from "node:fs";

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
