/**
 * `ui designmd` dispatcher — routes designmd subcommands to their impls.
 *
 * Subcommands:
 *   extract-tokens   Grep hex/font/custom-property tokens from raw HTML + CSS
 *   snapshot         Strip scripts, inline CSS, sanitise reveal-state styles
 *   audit            Run the 5 audit families on a per-project folder
 */
import { errJson, errText } from "../core/output.js";
import { runExtractTokens } from "./designmd-extract-tokens-impl.js";
import { runSnapshot } from "./designmd-snapshot-impl.js";
import { runAudit } from "./designmd-audit-impl.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd";

export const DESIGNMD_HELP = `ui designmd — DESIGN.md (Google Labs alpha + Stitch v1.0) toolchain

Usage:
  ui designmd extract-tokens [<html-path>] [--project <dir>] [--css <path>...] [--out <path>] [--json]
  ui designmd snapshot       <html-path> [--origin <url>] [--css <path>...] [--out <path>] [--inline-assets] [--base-dir <dir>] [--max-asset-bytes <n>] [--unlock-scroll] [--render] [--browser <path>] [--viewport <WxH>] [--wait-ms <n>] [--inline-canvas] [--flatten-iframes] [--json]
  ui designmd audit          <folder-path> [--dialect auto|alpha|stitch] [--json]

Subcommands:
  extract-tokens   Emit frequency-ranked source tokens (colours, fonts, custom-props) from HTML/CSS or --project <dir>
  snapshot         Produce a self-contained preview HTML (CSS/local assets inlined, scripts/overlays stripped, optional --render CDP capture)
  audit            Run the 5 audit families on DESIGN.md or .stitch/DESIGN.md (auto, alpha, or stitch dialect)

--css accepts multiple files as one comma-separated flag: --css a.css,b.css
Passing --css more than once is rejected (REPEATED_FLAG) rather than silently
dropping every value but the last.

Options:
  --project <dir>        Auto-discover framework stylesheets and token sources in <dir>
  --dialect <d>          Audit dialect: auto (default) | alpha | stitch
  --inline-assets        Inline local image/font/CSS url() assets as base64 data URIs
  --base-dir <dir>       Base directory for resolving --inline-assets
  --max-asset-bytes <n>  Max bytes per local asset for --inline-assets (default: 5242880)
  --unlock-scroll        Unlock 100vh / overflow:hidden scroll traps
  --render               Capture live DOM, CSSOM, <canvas>, and same-origin <iframe> via local browser CDP
  --browser <path>       Browser executable path for --render
  --viewport <WxH>       Viewport for --render (default: 1280x800)
  --wait-ms <n>          Settle delay in ms for --render (default: 700)
  --inline-canvas        Inline readable <canvas> elements as PNG <img> in --render
  --flatten-iframes      Flatten same-origin / srcdoc <iframe> elements in --render
  --json                 Emit a JSON envelope
  -h, --help             Show this help

Audit exit codes:
  0     all families PASS
  1     one or more FAIL rows (workflow MUST stop)
  2     WARN-only (workflow asks user)

Error codes (subcommand-specific):
  BAD_ARG             Missing/invalid argument
  FILE_NOT_FOUND      Required file or project source does not exist
  READ_ERROR          File exists but cannot be read
  WRITE_ERROR         Cannot write to the target path
  FOLDER_MISSING      Audit folder is missing DESIGN.md (and .stitch/DESIGN.md)
  REPEATED_FLAG       --css was passed more than once (extract-tokens) — combine with a comma instead
  RENDER_UNAVAILABLE  --render requested but local browser or CDP WebSocket runtime is unavailable
`;

export const designmdCommand = {
  name: CMD,
  summary: "Extract tokens, snapshot, and audit DESIGN.md folders",
  hasSubcommands: true,
  help: DESIGNMD_HELP,
  run(parsed: ParsedArgs): CommandResult | Promise<CommandResult> {
    switch (parsed.subcommand) {
      case "extract-tokens": return runExtractTokens(parsed);
      case "snapshot":       return runSnapshot(parsed);
      case "audit":          return runAudit(parsed);
      case undefined: {
        const msg = "ui designmd requires a subcommand. Run 'ui designmd --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui designmd --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
