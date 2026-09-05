/**
 * What a product-context failure tells the operator.
 *
 * The error CODE names a class of failure and is a public contract; the MESSAGE
 * names the instance — which file, which ceiling, which of the causes a single
 * code covers. Keeping the shaping here means the reading layer stays about
 * bytes, and every command tells the operator the same kind of thing.
 */
import { ProductContextError } from "../core/product-context-model.js";
import { InvalidUtf8Error, MAX_ATLAS_FILE_BYTES, MAX_COMPILE_INPUT_BYTES, MAX_RECEIPT_FILE_BYTES } from "./product-context-io.js";

export const OUTPUT_TOO_LARGE = `compiled atlas exceeds ${MAX_ATLAS_FILE_BYTES} bytes`;

export function aggregateTooLargeMessage(path: string): string {
  return `receipts exceed ${MAX_COMPILE_INPUT_BYTES} bytes in total, reached at '${path}'`;
}

/** Which file, and which way it refused to be read. */
export function fileFailureMessage(code: string, path: string): string {
  if (code === "FILE_NOT_FOUND") return `file not found: '${path}'`;
  if (code === "READ_ERROR") return `cannot read '${path}'`;
  if (code === "PRODUCT_CONTEXT_RECEIPT_TOO_LARGE") {
    return `receipt exceeds ${MAX_RECEIPT_FILE_BYTES} bytes: '${path}'`;
  }
  if (code === "PRODUCT_ATLAS_INPUT_TOO_LARGE") {
    return `atlas exceeds ${MAX_ATLAS_FILE_BYTES} bytes: '${path}'`;
  }
  return `${code}: '${path}'`;
}

/**
 * One code, BAD_PRODUCT_ATLAS, covers bad bytes, a bad shape and a failed replay.
 * Splitting the code is a public-contract change; naming the cause is not, and it
 * is the half the operator actually needs to know which repair to reach for.
 */
export function atlasFailureMessage(error: unknown, path: string): string {
  if (error instanceof InvalidUtf8Error) return `atlas is not valid UTF-8: '${path}'`;
  if (error instanceof SyntaxError) return `atlas is not valid JSON: '${path}'`;
  if (error instanceof Error && error.message === "ATLAS_NOT_CANONICAL") {
    return `atlas is not in canonical form, so its bytes cannot be compared: '${path}'`;
  }
  if (error instanceof Error && error.message === "BAD_PRODUCT_ATLAS") {
    return `replay mismatch: recompiling the embedded receipts did not reproduce '${path}'`;
  }
  const reason = error instanceof Error ? error.message : String(error);
  return `invalid atlas '${path}': ${reason}`;
}

/** A receipt that never reached the parser: say which one, and which layer refused it. */
export function receiptDecodeMessage(error: unknown, path: string): string {
  const why = error instanceof InvalidUtf8Error ? "not valid UTF-8" : "not valid JSON";
  return `receipt is ${why}: '${path}'`;
}

/** Cross-receipt failures already carry a reason; only the generic throw needs framing. */
export function compileReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason === "invalid product context" ? `invalid receipts: ${reason}` : reason;
}

export function compileErrorCode(error: unknown): string {
  if (error instanceof ProductContextError) {
    if (error.name === "ProductIdMismatch") return "PRODUCT_ID_MISMATCH";
    if (error.name === "OmittedOverflow") return "PRODUCT_CONTEXT_OMITTED_COUNT_OVERFLOW";
  }
  return "BAD_PRODUCT_CONTEXT";
}

/** Both replay defects are expected input errors, and both answer to BAD_PRODUCT_ATLAS. */
export function isAtlasReplayFailure(error: unknown): boolean {
  return error instanceof Error
    && (error.message === "BAD_PRODUCT_ATLAS" || error.message === "ATLAS_NOT_CANONICAL");
}
