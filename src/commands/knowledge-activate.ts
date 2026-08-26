import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ParsedArgs } from "../core/cli-args.js";
import { digestText, parseCapabilityCatalog, resolveCapabilityActivation } from "../core/capability-activation.js";
import { resolvePackageRoots } from "../core/init-stub.js";
import { errJson, errJsonWithData, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";

const SUB = "knowledge activate";

export function runKnowledgeActivate(parsed: ParsedArgs): CommandResult {
  const fail = (code: string, message: string, data?: unknown): CommandResult => {
    if (parsed.json) return data === undefined ? errJson(SUB, code, message) : errJsonWithData(SUB, code, message, data);
    return errText(`ui: ${message}\n`);
  };
  const requestPath = parsed.positionals[0];
  if (requestPath === undefined) return fail("BAD_ARG", "ui knowledge activate requires <request.json>");
  const dirFlag = parsed.flags["dir"];
  if (dirFlag === true) return fail("BAD_ARG", "--dir requires a repo root");
  const knowledgeRoot = typeof dirFlag === "string"
    ? join(resolve(dirFlag), "knowledge")
    : resolvePackageRoots(dirname(fileURLToPath(import.meta.url))).knowledgeRoot;
  if (knowledgeRoot === null) return fail("NO_CATALOG", "cannot locate the packaged knowledge core");

  let requestRaw: string; let catalogRaw: string;
  try { requestRaw = readFileSync(resolve(requestPath), "utf8"); }
  catch { return fail("FILE_NOT_FOUND", `cannot read activation request '${requestPath}'`); }
  try { catalogRaw = readFileSync(join(knowledgeRoot, "capability-profiles.json"), "utf8"); }
  catch { return fail("NO_CATALOG", `cannot read '${join(knowledgeRoot, "capability-profiles.json")}'`); }

  let request: unknown;
  try { request = JSON.parse(requestRaw); }
  catch { return fail("BAD_ACTIVATION", "activation request is not valid JSON"); }
  const catalog = parseCapabilityCatalog(catalogRaw);
  if (!catalog.ok) return fail("BAD_CATALOG", catalog.message);
  const result = resolveCapabilityActivation(request, catalog.catalog, digestText(catalogRaw));
  if (!result.ok) {
    const data = result.receipt ?? result.data;
    return fail(result.code, result.message, data);
  }
  if (parsed.json) return okJson(SUB, result.receipt);
  return { exitCode: 0, stdout: `knowledge activate: ${result.receipt.requestedSurface} -> ${result.receipt.route}\n` };
}
