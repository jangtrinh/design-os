<!-- sha256: 1d4b1b75abcb6e894da5de9115d25a4ba0398e0a0413c7577fae62dd3f837cdc -->
# Generated command contract

Generated from `src/core/command-signatures.ts` through `ui schema --json`. Do not edit: validate.mjs
re-renders this file from the installed `ui` and refuses an edited or stale copy. Flags not listed here do not exist.

## ui gate

Run all linter families + autofix dry-run over an HTML file; exit 1 on any error-severity finding

Usage: `ui gate <file.html> [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--tokens` | string | DS token file; enables the taste Consistency raw-hex check and grades required token-coverage against THIS file |
| `--family` | string | Persona family slug — applies its gate_policy from knowledge/personas/families.json |
| `--skip` | string | Comma-separated <family>:<reason> pairs — declared partial gating |
| `--dir` | string | Project directory to probe for tokens/DS (default: the file's folder; coverage mode: cwd) |
| `--token-coverage-floor` | string | Minimum ui token-coverage score before the gate fails (default: 0.8) |

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`, `TOKENS_NOT_READABLE`, `FAMILY_NOT_FOUND`

## ui validate-layout

Lint an HTML file; exit 1 on error-severity findings

Usage: `ui validate-layout <file.html>`

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`

## ui a11y-lint

Lint an HTML file for static a11y violations; exit 1 on error-severity findings

Usage: `ui a11y-lint <file.html>`

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`

## ui taste-lint

Check the machine-verifiable taste-rubric subset; exit 1 on violations

Usage: `ui taste-lint <file.html> [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--tokens` | string | DS token file; enables the Consistency raw-hex check |

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`

## ui tell-lint

Report design tells across HTML, and (as extractors land) JSX, Vue, Swift and Dart

Usage: `ui tell-lint [target] [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--coverage` | boolean | Print the rule x extractor matrix and exit |
| `--no-advisory` | boolean | Hide advisory findings (they never affect the exit code) |
| `--render` | boolean | Also run the 7 rendered rules, driving a browser already on this machine |
| `--browser` | string | Path to Chrome/Chromium/Edge; defaults to $CHROME_PATH then the platform's usual paths |
| `--viewport` | string | Viewport for the rendered pass, e.g. 390x844 (default 1280x800) |

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`

## ui content-lint

Lint an HTML file for content defects; exit 1 on error-severity findings

Usage: `ui content-lint <file.html>`

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`

## ui autofix

Apply the 5 deterministic HTML fix rules to a file

Usage: `ui autofix <file.html> [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--write` | boolean | Overwrite the input file (default: print to stdout) |

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`, `WRITE_ERROR`

## ui token-coverage

Score an HTML file's CSS (color/font-family/font-size/spacing/radius/shadow) against a token file; exit 1 below floor

Usage: `ui token-coverage <file.html> [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--tokens` | string | Token file to grade against (default: auto-detect via the design-dir contract, then brand/design/design.tokens.json) |
| `--floor` | string | Minimum overall coverage to exit 0 (default: 0.8) |

Error codes: `BAD_ARG`, `FILE_NOT_FOUND`, `READ_ERROR`, `TOKENS_NOT_FOUND`, `BAD_JSON`

## ui ds context

Emit the active design system as a context block for the host model

Usage: `ui ds context [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--strict` | boolean | Prepend the registered-components-only enforcement preamble |
| `--with-theme` | boolean | Also emit the compiled Tailwind v4 @theme block (full token map, immune to --max-bytes) |
| `--include` | string | Comma-separated sections: tokens,registry,naming,anti-patterns,soul (default); guidelines is opt-in: pack file index, scenario titles and tier-A rulings within --max-bytes |
| `--format` | markdown\|json | Output format (default markdown) |
| `--max-bytes` | string | Budget for the variable sections (token/registry/naming/anti-pattern tables); the soul chain and --with-theme are fixed prose outside it (default 4096) |
| `--dir` | string | Override the project directory |

Error codes: `BAD_ARG`, `UNKNOWN_FLAG`, `DS_NOT_FOUND`, `DS_TAMPERED`, `BAD_MANIFEST`

## ui registry list

List all components, optionally filtered by category

Usage: `ui registry list [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--category` | string | Filter by category |
| `--file` | string | Registry file path |

Error codes: `BAD_ARG`, `REGISTRY_NOT_FOUND`, `BAD_REGISTRY`, `READ_ERROR`

## ui registry lookup

Find a component by canonical name

Usage: `ui registry lookup <name> [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--file` | string | Registry file path |

Error codes: `BAD_ARG`, `BAD_NAME`, `NOT_FOUND`, `REGISTRY_NOT_FOUND`, `BAD_REGISTRY`, `READ_ERROR`

## ui memory context

Emit a compact memory prior for the host model

Usage: `ui memory context [flags]`

| Flag | Type | Meaning |
| --- | --- | --- |
| `--for` | generate\|critique\|why | Consumer mode (default generate) |
| `--rank-file` | string | JSON array of ranked event ids to splice into the prior (never for --for critique) |
| `--components` | string | Exact owner component names as CSV or a JSON string array |
| `--patterns` | string | Exact owner pattern names as CSV or a JSON string array |
| `--max-bytes` | string | Truncate the block, sections whole (default 2048) |
| `--now` | string | Decay clock (deterministic when fixed) |
| `--dir` | string | Project directory (default: cwd) |

Error codes: `BAD_ARG`, `UNKNOWN_FLAG`, `BAD_LEDGER`, `BAD_LESSON`, `FILE_NOT_FOUND`, `READ_ERROR`, `CONTEXT_OVERFLOW`, `DS_TAMPERED`, `BAD_MANIFEST`, `BAD_DS`
