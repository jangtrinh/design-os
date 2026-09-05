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
  // Two different defects, and telling them apart decides which repair to reach for.
  // Non-canonical bytes are checked FIRST: a pretty-printed or hand-edited file also
  // fails the replay comparison, so testing replay first would blame the receipts for
  // whitespace. Both surface as BAD_PRODUCT_ATLAS; only the message differs.
  if (!Buffer.from(canonicalStringify(atlas), "utf8").equals(supplied)) {
    throw new Error("ATLAS_NOT_CANONICAL");
  }
  if (!rebuilt.atlasBytes.equals(supplied)) {
    throw new Error("BAD_PRODUCT_ATLAS");
  }
  return rebuilt;
}
