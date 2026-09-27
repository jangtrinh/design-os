/** `ui knowledge render <rulings.json> --out <dir> [--lang en,vi]` — writes rulings.<lang>.md. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { RULINGS_LANGS } from "../core/rulings-labels.js";
import type { RulingsLang } from "../core/rulings-labels.js";
import { renderBlocker, renderRulings } from "../core/rulings-render.js";

const SUB = "knowledge render";

export function runRulingsRender(parsed: ParsedArgs): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["out", "lang"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.positionals[0];
  if (file === undefined) return err("BAD_ARG", "ui knowledge render requires <rulings.json>");
  const out = parsed.flags["out"];
  if (typeof out !== "string") return err("BAD_ARG", "ui knowledge render requires --out <dir>");
  const langFlag = parsed.flags["lang"];
  if (langFlag === true) return err("BAD_ARG", "--lang requires a comma list, e.g. en,vi");
  const langs = (typeof langFlag === "string" ? langFlag : "en").split(",").map((l) => l.trim()).filter((l) => l !== "");
  const badLang = langs.find((l) => !(RULINGS_LANGS as readonly string[]).includes(l));
  if (badLang !== undefined || langs.length === 0) return err("BAD_LANG", `unsupported --lang '${badLang ?? ""}' (supported: ${RULINGS_LANGS.join(", ")})`);

  let doc: unknown;
  try { doc = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch { return err("FILE_NOT_FOUND", `cannot read '${file}' as JSON`); }
  const blocker = renderBlocker(doc);
  if (blocker !== null) return err("BAD_RULINGS", `cannot render '${file}': ${blocker} — run 'ui knowledge lint' for the full report`);

  const outDir = resolve(out);
  const written: string[] = [];
  try {
    mkdirSync(outDir, { recursive: true });
    for (const lang of new Set(langs) as Set<RulingsLang>) {
      const path = join(outDir, `rulings.${lang}.md`);
      writeFileSync(path, renderRulings(doc as { rulings: Record<string, unknown>[] }, lang), "utf8");
      written.push(path);
    }
  } catch (e) {
    return err("WRITE_ERROR", `cannot write to ${outDir}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (parsed.json) return okJson(SUB, { files: written });
  return { exitCode: 0, stdout: `${written.map((p) => `knowledge render: wrote ${p}`).join("\n")}\n` };
}
