/**
 * `ui tenant-lint` command — deterministic Tenant-contract floor for an embeddable
 * motion section's markup.
 *
 * Runs lintTenant (src/core/tenant-lint.ts) against an HTML file and reports Tenant
 * Law violations: section-body global writes (window.scrollTo, :root, position:fixed,
 * …) and host-ancestor sticky-killers on any `.scrub` descendant. Read-only: never
 * writes to disk. Every finding is severity error — see core/tenant-lint.ts for why
 * there is no warnings tier here (unlike taste-lint).
 *
 * Exit code policy (mirrors taste-lint / validate-layout's D4): exit 1 iff any
 * finding. No subcommands — hasSubcommands: false.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import { lintTenant } from "../core/tenant-lint.js";

const CMD = "tenant-lint";

export const TENANT_LINT_HELP = `ui tenant-lint — deterministic Tenant-contract floor for an embeddable motion section

Usage:
  ui tenant-lint <file.html> [--json]

Options:
  --json        Emit a JSON envelope instead of human-readable output
  -h, --help    Show this help

Checks (knowledge/motion-craft.md § Tenant contract; every finding is an error —
no warnings tier, a Tenant Law breach is absolute):
  window-scrollto        the page/document root's scrollTo() is called from a section
  window-scrolly          window.scrollY/pageYOffset read instead of getBoundingClientRect()
  body-height-write       document.body.style.height assigned to force scroll
  scrollingelement-write  document.scrollingElement assigned
  documentelement-write   documentElement.style.setProperty(...) — state must live on the section root
  position-fixed-js       position:fixed set from JS — forbidden inside a section (host-only)
  root-css-write          a :root {} block declares a --scrub-* variable instead of scoping to .scrub
  position-fixed-css      a .scrub-scoped selector sets position:fixed in CSS
  sticky-killer-ancestor  an ancestor of a .scrub element sets overflow/transform/filter/
                          perspective/contain in its inline style, silently killing position:sticky

Local <script src> / <link rel=stylesheet href> files are resolved relative to
<file.html>'s own directory and scanned too (an absolute http(s):// or
protocol-relative // URL is external and always skipped — not ours to lint). See
core/tenant-lint.ts's honest-limitations header for the remaining regex-level
tradeoffs (bracket-notation evasion, aliasing, unquoted attributes, and the
host-ancestor sticky-killer check staying inline-style-only).

Exit codes:
  0  No violations
  1  One or more violations, or user/file error

Error codes:
  BAD_ARG        Missing <file.html> argument or unexpected extra positionals
  FILE_NOT_FOUND File does not exist (ENOENT)
  READ_ERROR     File exists but cannot be read
`;

function formatReport(filePath: string, errorCount: number, findings: ReturnType<typeof lintTenant>["findings"]): string {
  const lines: string[] = [];
  for (const f of findings) {
    lines.push(`${filePath}:${f.line}: [${f.rule}] ${f.detail}`);
  }
  lines.push(errorCount > 0 ? `TENANT-LINT: FAIL (${errorCount})` : "TENANT-LINT: PASS");
  return lines.join("\n") + "\n";
}

export const tenantLintCommand = {
  name: CMD,
  summary: "Deterministic Tenant-contract floor for an embeddable motion section's markup",
  hasSubcommands: false,
  help: TENANT_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // 1. Resolve file path from positionals[0].
    const filePath = parsed.positionals[0];
    if (filePath === undefined) {
      const msg = "ui tenant-lint requires a <file.html> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 1) {
      const msg = `ui tenant-lint takes exactly one file argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // 2. Read input HTML file.
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (e) {
      const isNotFound =
        e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      const code = isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR";
      const msg = isNotFound
        ? `file not found: '${filePath}'`
        : `cannot read file '${filePath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
    }

    // 3. Run the linter — baseDir enables local <script src>/<link href> resolution
    //    (the shipped section engine is always linked, not inlined, so this is
    //    where the real coverage lives; see core/tenant-lint.ts's module header).
    const { findings, errorCount } = lintTenant(raw, { baseDir: dirname(resolve(filePath)) });

    // 4. Exit 1 iff any finding (no warnings tier here).
    const exitCode = errorCount > 0 ? 1 : 0;

    // 5. Shape output.
    return useJson
      ? okJsonWithExit(CMD, { file: filePath, errorCount, findings }, exitCode)
      : { exitCode, stdout: formatReport(filePath, errorCount, findings) };
  },
};
