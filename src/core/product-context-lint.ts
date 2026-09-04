import { canonicalStringify } from "./ds-manifest.js";
import { normalizeProductAtlas } from "./product-context-model.js";
import { compileProductContext } from "./product-context-compile.js";
import type { CompileResult } from "./product-context-compile.js";
export function lintProductContext(
  value: unknown,
  supplied: Buffer,
): CompileResult {
  const atlas = normalizeProductAtlas(value);
  const receipts = (atlas.receipts as Record<string, unknown>[]).map(
    (receipt) => {
      const plain = { ...receipt };
      delete plain["receiptDigest"];
      return plain;
    },
  );
  const rebuilt = compileProductContext(receipts);
  if (
    !Buffer.from(canonicalStringify(atlas), "utf8").equals(supplied) ||
    !rebuilt.atlasBytes.equals(supplied)
  )
    throw new Error("BAD_PRODUCT_ATLAS");
  return rebuilt;
}
