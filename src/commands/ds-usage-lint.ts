/**
 * `ui ds-usage-lint <file|dir> [--dir <project>] [--tokens <file>] [--json]` — the ENFORCEMENT
 * gate: does a generated page (or a source tree) actually use the project's design-system
 * tokens? Checks `ds context`'s ENFORCEMENT clause ("style exclusively with the semantic tokens
 * below — never hardcode colour when a token covers it") plus the closed font-family allowlist,
 * which none of the four existing floors (taste-lint, validate-layout, content-lint, a11y-lint)
 * verify. Read-only, pure string/regex — see ds-usage-lint.ts for the algorithm and its honesty floor.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { parseTokenFile } from "../core/token-model.js";
import { resolveTokens } from "../core/token-resolve.js";
import { declaredCssVarNames } from "../core/token-emit.js";
import { lintDsUsageOnMarkup } from "../core/ds-usage-lint.js";
import type { DsUsageLintResult, DsUsageFinding, DsUsageLintOptions } from "../core/ds-usage-lint.js";
import { fontTokenModel } from "../core/ds-usage-font-check.js";
import { inlineLinkedCss } from "../core/html-css-loader.js";
import { uiSourceExtension } from "../core/polyglot-ui-extractor.js";
import { formatDirectoryReport, lintDirectory } from "./ds-usage-lint-directory.js";

const CMD = "ds-usage-lint";

export const DS_USAGE_LINT_HELP = `ui ds-usage-lint — ENFORCEMENT gate: does the page use the DS's own tokens?

Usage:
  ui ds-usage-lint <file|dir> [--dir <project>] [--tokens <file>] [--json]

<file> is any of .html .svelte .vue .jsx .tsx .js .ts. A <dir> is walked in sorted order and every
such file is linted; node_modules/ dist/ build/ .git/ fixtures/ __fixtures__/ are skipped, and the
report prints "scanned N of M files" plus every skip reason.

Checks (colour and font-family; hardcoded spacing/radius is a deliberate deferral —
literals like 1px borders / 50% radii are legitimate and lower-signal):
  undeclared-token   (error)    var(--x) declared nowhere — not a DS token, not
                                on the page's own :root/@theme/[data-theme]/.dark.
                                A broken/ghost reference.
  off-system-token   (warning)  var(--x) the page declares itself but the DS
                                does not — visible, never build-breaking.
  hardcoded-color    (error)    hex/rgb()/hsl() literal in a colour-bearing
                                property (color, background(-color),
                                border(-color), outline-color, fill, stroke,
                                box-shadow, text-shadow) outside a token block.
  off-system-font    (error)    a font-family whose FIRST family is not the
                                first family of any fontFamily token, or a
                                Tailwind font-mono/font-serif/font-sans no
                                fontFamily token backs. "Inter", sans-serif
                                passes when a token starts with Inter. Values
                                built at build time (\${...}) are counted as
                                NOT EVALUATED, never passed silently.

Token-declaration blocks (:root / @theme / html / body / [data-theme="..."] / .dark) and @font-face
bodies are not checked — they hold the literal values that ARE the token definitions.

This proves token usage in the files' OWN CSS and class lists only — never rendered/computed
colour or font, gradients, or inline-SVG fills it did not parse. Not a conformance claim.

Options:
  --dir <path>      Project directory holding design/ (default: cwd)
  --tokens <file>   Use this DTCG token file instead of <dir>/design/design.tokens.json
  --json            Emit a JSON envelope
  -h, --help        Show this help

Exit codes:
  0  No error-severity findings (off-system-token warnings never fail the build)
  1  One or more error-severity findings, or a user/file error

Error codes:
  BAD_ARG        Missing <file|dir> argument
  FILE_NOT_FOUND Input file or directory does not exist
  READ_ERROR     Input file exists but cannot be read
  NO_UI_FILES    A directory holds no UI source file outside the skipped directories
  DS_NOT_FOUND   No design.tokens.json under '<dir>/design' (or at --tokens) — run 'ui ds init' first
  BAD_JSON       Token file is not valid JSON / fails DTCG validation
`;

/** A findings list that may also carry a shared `linked-css-unreadable` error
 * (PR-FU3-r2 A10 — from html-css-loader.ts, whose `line` is optional, unlike
 * every DsUsageFinding's). */
type ReportFinding = DsUsageFinding | { checkId: string; severity: string; message: string; line?: number };

function formatReport(file: string, r: DsUsageLintResult): string {
  const lines = [
    `ds-usage-lint: ${file} — ${r.hardcodedColorCount} hardcoded colour(s), ` +
      `${r.offSystemTokenCount} off-system token(s), ${r.undeclaredTokenCount} undeclared reference(s), ` +
      `${r.offSystemFontCount} off-system font(s)`,
  ];
  for (const f of r.findings as ReportFinding[]) {
    const mark = f.severity === "error" ? "✗" : "!";
    const loc = f.line !== undefined ? ` line ${f.line}` : "";
    lines.push(`  ${mark} [${f.checkId}]${loc}: ${f.message}`);
  }
  if (r.unevaluatedFontCount > 0) {
    lines.push(`  NOT EVALUATED: ${r.unevaluatedFontCount} font-family value(s) built at build time (\${...}) — read them in the built output`);
  }
  lines.push("  NOTE: proves token usage in the page's own CSS only — not rendered colour; not a conformance claim.");
  return lines.join("\n") + "\n";
}

export const dsUsageLintCommand = {
  name: CMD,
  summary: "ENFORCEMENT gate — does the page use the design system's own tokens and fonts? (not a conformance claim)",
  hasSubcommands: false,
  help: DS_USAGE_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult =>
      useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

    const target = parsed.positionals[0];
    if (target === undefined) return err("BAD_ARG", "ui ds-usage-lint requires a <file|dir> argument");

    let isDirectory: boolean;
    try {
      isDirectory = statSync(target).isDirectory();
    } catch (e) {
      const isNotFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      return err(
        isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR",
        isNotFound ? `file not found: '${target}'` : `cannot read '${target}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const dirFlag = parsed.flags["dir"];
    const tokensFlag = parsed.flags["tokens"];
    const designDir = join(typeof dirFlag === "string" ? resolve(dirFlag) : process.cwd(), "design");
    const tokensPath = typeof tokensFlag === "string" ? resolve(tokensFlag) : join(designDir, "design.tokens.json");
    if (!existsSync(tokensPath)) {
      return err(
        "DS_NOT_FOUND",
        typeof tokensFlag === "string"
          ? `no token file at '${tokensPath}'`
          : `no design.tokens.json under '${designDir}' — run 'ui ds init' first`,
      );
    }

    let opts: DsUsageLintOptions;
    try {
      const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8"))));
      opts = { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) };
    } catch (e) {
      return err("BAD_JSON", `bad token file '${tokensPath}': ${e instanceof Error ? e.message : String(e)}`);
    }

    if (isDirectory) {
      const report = lintDirectory(target, opts);
      if (report.total === 0) {
        return err("NO_UI_FILES", `no .html/.svelte/.vue/.jsx/.tsx/.js/.ts file under '${target}' outside the skipped directories (${report.skipped.length} skipped)`);
      }
      const exitCode = report.errorCount > 0 ? 1 : 0;
      return useJson
        ? okJsonWithExit(CMD, report, exitCode)
        : { exitCode, stdout: formatDirectoryReport(report) };
    }

    let source: string;
    try {
      source = readFileSync(target, "utf8");
    } catch (e) {
      return err("READ_ERROR", `cannot read '${target}': ${e instanceof Error ? e.message : String(e)}`);
    }

    // A10: route through the shared loader like the six FU3 commands — judge
    // the union of inline + LOCAL linked CSS exactly as if inlined; an
    // unreadable linked stylesheet is an error finding, never silence.
    // A file whose extension is not UI source keeps the original contract: it is read as HTML.
    const isHtml = (uiSourceExtension(target) ?? ".html") === ".html";
    const loaded = isHtml ? inlineLinkedCss(target, source) : { html: source, errors: [] };
    const linted = lintDsUsageOnMarkup(loaded.html, { ...opts, file: isHtml ? "page.html" : target });
    const result: DsUsageLintResult = {
      ...linted,
      findings: [...loaded.errors, ...linted.findings] as DsUsageFinding[],
      errorCount: linted.errorCount + loaded.errors.length,
    };
    const exitCode = result.errorCount > 0 ? 1 : 0;
    return useJson
      ? okJsonWithExit(CMD, { file: target, ...result }, exitCode)
      : { exitCode, stdout: formatReport(target, result) };
  },
};
