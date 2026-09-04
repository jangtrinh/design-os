import type { CommandResult } from "../../src/core/output.js";
import type { Json } from "./product-context-fixtures.js";

export interface BoundedOps {
  open(path: string): number;
  fstat(fd: number): { isFile(): boolean; size: number };
  read(fd: number, target: Buffer, offset: number, length: number): number;
  close(fd: number): void;
}
export type BoundedRead = { ok: true; bytes: Buffer } | { ok: false; code: string };
type ProductContextHandler = (...args: unknown[]) => CommandResult;
export interface ProductContextSeams {
  productContextCommand?: { run: ProductContextHandler };
  runProductContextCompile?: ProductContextHandler;
  runProductContextLint?: ProductContextHandler;
  readBoundedFile?: (path: string, limit: number, tooLargeCode: string, ops?: BoundedOps) => BoundedRead;
  assertAtlasOutputSize?: (bytes: Buffer) => string | undefined;
}
export interface ProductContextCoreSeams {
  normalizeProductContextReceipt?: (value: unknown) => Json;
  normalizeProductAtlas?: (value: unknown) => Json;
  finalizeProductContextFindings?: (findings: Json[]) => { findings: Json[]; errorCount: number; warningCount: number };
}

const productContextModulePath = "../../src/commands/" + "product-context.js";
const productContextCoreModulePath = "../../src/core/" + "product-context-model.js";

export async function productContextSeams(): Promise<ProductContextSeams | undefined> {
  try {
    return await import(productContextModulePath) as ProductContextSeams;
  } catch (error) {
    if (error instanceof Error && /product-context/.test(error.message)) return undefined;
    throw error;
  }
}
export async function productContextCoreSeams(): Promise<ProductContextCoreSeams | undefined> {
  try {
    return await import(productContextCoreModulePath) as ProductContextCoreSeams;
  } catch (error) {
    if (error instanceof Error && /product-context/.test(error.message)) return undefined;
    throw error;
  }
}
export function fakeBoundedOps(chunks: Buffer[], size: number, faults: { open?: boolean; fstat?: boolean; read?: boolean; close?: boolean } = {}): { ops: BoundedOps; state: { closeCount: number; readCount: number; readCalls: Array<[number, number, number]> } } {
  let index = 0;
  const state = { closeCount: 0, readCount: 0, readCalls: [] as Array<[number, number, number]> };
  return {
    state,
    ops: {
      open: () => { if (faults.open) throw new Error("open failure"); return 17; },
      fstat: () => { if (faults.fstat) throw new Error("fstat failure"); return { isFile: () => true, size }; },
      read: (_fd, target, offset, length) => {
        state.readCount++;
        state.readCalls.push([offset, length, target.length]);
        if (faults.read) throw new Error("read failure");
        const chunk = chunks[index++] ?? Buffer.alloc(0);
        const read = Math.min(chunk.length, length);
        chunk.copy(target, offset, 0, read);
        return read;
      },
      close: () => { state.closeCount++; if (faults.close) throw new Error("close failure"); },
    },
  };
}
