import { canonicalStringify } from "../core/ds-manifest.js";
import { forTerminal, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { projectProductContextFlow } from "../core/product-context-flow-projection.js";
import { lintProductContext } from "../core/product-context-lint.js";
import { ProductContextError, normalizeProductAtlas } from "../core/product-context-model.js";
import {
  InvalidUtf8Error,
  MAX_ATLAS_FILE_BYTES,
  decodeUtf8,
  localProductContextArgs,
  productContextFailure,
  readBoundedFile,
} from "./product-context-io.js";

const COMMAND = "product-context project-flow";

function blockedProjectionText(findings: ReadonlyArray<Record<string, unknown>>): string {
  return findings
    .map((finding) => `${finding.severity} [${finding.checkId}] ${forTerminal(String(finding.message))}\n`)
    .join("");
}

export function runProductContextProjectFlow(parsed: ParsedArgs): CommandResult {
  const checked = localProductContextArgs(parsed, COMMAND, 1, 1);
  if (checked.bad !== undefined) return checked.bad;

  const path = parsed.positionals[0];
  if (path === undefined) return productContextFailure(COMMAND, checked.mode, "BAD_ARG");

  const read = readBoundedFile(
    path,
    MAX_ATLAS_FILE_BYTES,
    "PRODUCT_ATLAS_INPUT_TOO_LARGE",
  );
  if (!read.ok) return productContextFailure(COMMAND, checked.mode, read.code);

  let replay: ReturnType<typeof lintProductContext>;
  try {
    const raw = JSON.parse(decodeUtf8(read.bytes));
    normalizeProductAtlas(raw);
    replay = lintProductContext(raw, read.bytes);
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      error instanceof InvalidUtf8Error ||
      error instanceof ProductContextError ||
      (error instanceof Error && error.message === "BAD_PRODUCT_ATLAS")
    ) {
      return productContextFailure(COMMAND, checked.mode, "BAD_PRODUCT_ATLAS");
    }
    throw error;
  }

  const projection = projectProductContextFlow(replay, read.bytes);
  if (checked.mode === "json") {
    return okJsonWithExit(COMMAND, projection, projection.errorCount > 0 ? 1 : 0);
  }
  if (projection.status === "available") {
    return { exitCode: 0, stdout: canonicalStringify(projection.flow) };
  }
  return { exitCode: 1, stderr: blockedProjectionText(projection.findings) };
}
