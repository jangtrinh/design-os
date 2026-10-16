/**
 * `ui ds guidelines export --target figma [--out <dir>] [--pack <dir>] [--budget <n>kb]`
 *
 * Writes `<out>/figma-guidelines/` (the bundle) and `<out>/UPLOAD.md` beside it. The pack must pass
 * `check` first and carry no open slot. Nothing is trimmed unless --budget asks for it; over
 * Figma's hard cap the export is refused with per-file bytes. Existing files in the bundle folder
 * that this export does not produce are never deleted: they would be uploaded by mistake, so the
 * export stops instead. The bundle itself is built in src/core/ds-guidelines-figma-*.ts.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJsonWithData, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { buildFigmaBundle } from "../core/ds-guidelines-figma-export.js";
import { parseBudgetFlag, validateBundle } from "../core/ds-guidelines-figma-profile.js";
import { renderUpload } from "../core/ds-guidelines-figma-upload.js";
import { collectCheck } from "./ds-guidelines-check-collect.js";
import { listFilesIn } from "./ds-guidelines-inputs.js";
import { loadProject } from "./ds-guidelines-load.js";
import { writeBundleStaged } from "./ds-guidelines-write.js";
import type { Err } from "./ds-guidelines-load.js";

const CMD = "ds guidelines";
const thousands = (n: number): string => n.toLocaleString("en-US");
const BUNDLE_FOLDER = "figma-guidelines";

/** A refusal: JSON mode carries the structured data, text mode prints the message. */
function refuse(json: boolean, code: string, message: string, data: unknown): CommandResult {
  return json ? errJsonWithData(CMD, code, message, data) : errText(`ui: ${message}\n`);
}

export function runExport(parsed: ParsedArgs, err: Err): CommandResult {
  if (parsed.flags["target"] !== "figma") return err("BAD_ARG", "export needs --target figma (the only supported target)");
  const budget = parseBudgetFlag(parsed.flags["budget"]);
  if (typeof budget === "object") return err("BAD_ARG", budget.error);
  if (parsed.flags["out"] === true) return err("BAD_ARG", "--out needs a path");

  const loaded = loadProject(parsed, err, "pack");
  if ("exitCode" in loaded) return loaded;
  const collected = collectCheck(loaded.ds, loaded.src, loaded.packDir, loaded.inputs);
  if ("code" in collected) return err(collected.code, collected.message);

  const open = collected.findings.filter((f) => f.code === "OPEN_QUESTION" || f.code === "SCENARIO_INCOMPLETE");
  if (collected.openQuestions > 0) {
    const slots = open.map((f) => ({ file: f.file, line: f.line, id: /slot '([^']+)'/.exec(f.message)?.[1] ?? "?" }));
    const message = `OPEN_QUESTIONS (${collected.openQuestions}) — answer every slot with Do, Don't and Why lines, then export again:\n` +
      slots.slice(0, 10).map((s) => `  ${s.file}:${s.line} ${s.id}`).join("\n") + (slots.length > 10 ? `\n  … and ${slots.length - 10} more` : "");
    return refuse(parsed.json, "OPEN_QUESTIONS", message, { openQuestions: collected.openQuestions, slots });
  }
  const errors = collected.findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    const message = `PACK_INVALID (${errors.length}) — fix these with 'ui ds guidelines check' first: ` +
      errors.slice(0, 3).map((f) => `${f.file}:${f.line} [${f.code}]`).join(", ");
    return refuse(parsed.json, "PACK_INVALID", message, { errors: errors.slice(0, 20) });
  }

  const manifest = JSON.parse(collected.manifestText ?? "{}") as {
    generatedAt?: string; designSystem?: { name?: string }; seal?: { status?: string; drifted?: { file: string }[] };
  };
  let bundle;
  try {
    bundle = buildFigmaBundle(collected.files, typeof budget === "number" ? budget : undefined);
  } catch (e) {
    return err("EXPORT_FAILED", `could not assemble the bundle: ${e instanceof Error ? e.message : String(e)}`);
  }
  const infos = bundle.files.map((f) => ({ path: f.path, bytes: f.bytes, text: f.content }));
  const limits = validateBundle(infos);
  const totalBytes = infos.reduce((n, f) => n + f.bytes, 0);
  const perFile = bundle.files.map((f) => ({ path: f.path, bytes: f.bytes }));
  const limitError = limits.find((x) => x.severity === "error");
  if (limitError !== undefined) return refuse(parsed.json, limitError.code, limitError.message, { files: perFile, totalBytes });
  const warnings = limits.filter((f) => f.severity === "warning").map((f) => f.message);
  if (typeof budget === "number" && bundle.budgetReached === false) {
    warnings.push(`could not reach the ${thousands(budget)}-byte budget: nothing left to trim, bundle is ${thousands(totalBytes)} bytes`);
  }

  const out = typeof parsed.flags["out"] === "string" ? resolve(parsed.flags["out"]) : join(loaded.ds.paths.dir, "figma-export");
  const bundleDir = join(out, BUNDLE_FOLDER);
  const foreign = existsSync(bundleDir) ? listFilesIn(bundleDir).filter((p) => !bundle.files.some((f) => f.path === p)) : [];
  if (foreign.length > 0) {
    return refuse(parsed.json, "BUNDLE_DIR_NOT_CLEAN",
      `BUNDLE_DIR_NOT_CLEAN — '${bundleDir}' holds files this export does not produce (${foreign.join(", ")}); remove them or pick another --out, they would be uploaded by mistake`,
      { foreign });
  }

  const unverified = new Set([
    ...(manifest.seal?.drifted ?? []).map((d) => d.file),
    ...(loaded.ds.unsealedDrift ?? []).map((d) => (d.file === "tokens" ? loaded.src.tokens : loaded.src.registry)),
  ]);
  if (manifest.seal?.status === "unverified" && unverified.size === 0) unverified.add("the design system store");
  const uploadFile = join(out, "UPLOAD.md");
  const upload = renderUpload({
    designSystem: manifest.designSystem?.name ?? "design system", generatedOn: (manifest.generatedAt ?? "").slice(0, 10),
    folder: BUNDLE_FOLDER, files: perFile, warnings, trimmed: bundle.trimmed, unverifiedSources: [...unverified].sort(),
  });
  try {
    // Staged: the folder and UPLOAD.md land together or not at all (the previous bundle is put back on failure).
    warnings.push(...writeBundleStaged(out, BUNDLE_FOLDER, bundle.files, "UPLOAD.md", upload));
  } catch (e) {
    return err("WRITE_ERROR", `cannot write the bundle to '${out}' (nothing was changed): ${e instanceof Error ? e.message : String(e)}`);
  }

  if (parsed.json) {
    return okJson(CMD, {
      out, bundleDir, uploadFile, files: perFile, totalBytes, warnings, trimmed: bundle.trimmed,
      ...(typeof budget === "number" ? { budget, budgetReached: bundle.budgetReached } : {}),
    });
  }
  return ok([
    `ds guidelines export: wrote ${bundle.files.length} file(s), ${thousands(totalBytes)} bytes → ${bundleDir}`,
    ...perFile.map((f) => `  ${f.path}  ${thousands(f.bytes)} B`),
    ...warnings.map((w) => `warning: ${w}`),
    ...bundle.trimmed.map((t) => `trimmed ${t.file}: dropped ${t.rulesDropped} rule(s), saved ${thousands(t.bytesSaved)} bytes — ${t.ids.join(", ")}`),
    `UPLOAD.md → ${uploadFile}`,
  ].join("\n") + "\n");
}
