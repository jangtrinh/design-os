# Phase 1 — Onboarding first-run (execution spec)

**Implementer:** Sonnet 5, verbatim. Deterministic `ui` (Node/TS) only — pure transforms, no
network, no install, no model. Match surrounding code style. Every file < 200 lines. If an edit
spec conflicts with the actual code, STOP and report — do not guess.

Read first: `src/commands/init.ts`, `src/commands/doctor.ts` (template/knowledge resolver +
`✓/!/✗` marks + `--json` envelope pattern), `src/commands/guide.ts`, `src/cli.ts` (command
registry), `src/adapters/wrapper-shapes.ts`, `templates/journeys/onboard.md`. Also see how
commands return `{stdout, exitCode}` and how `--json` is emitted, and how `templates/` is resolved
on disk (init.ts / doctor.ts do this).

## 1. Brand wordmark asset — ALREADY WRITTEN

`templates/brand/wordmark.txt` exists (slant figlet "DESIGN:OS", pure ASCII). Do not regenerate.

## 2. Shared style-A renderer — NEW `src/core/report-style.ts`

Pure string builders, no color, ASCII-safe, no deps. Export:

- `const GLYPH = { done: '✓', warn: '!', fail: '✗', pending: '·' } as const`
- `renderBanner(templatesDir: string, tagline = 'the design engine that learns in the work'): string`
  — read `templates/brand/wordmark.txt` from the resolved templates dir, append a blank line, then
  `  ${tagline}` and a trailing newline. If the asset is missing, fall back to the plain string
  `DESIGN:OS` + tagline (never throw).
- `ruleHeader(title: string, verdict = '', width = 64): string` — the style-A signature line:
  `title ` + `─` fill + ` verdict` so the whole line is `width` cols (verdict right-aligned). If
  `title + verdict` already ≥ width-2, use a single space separator instead of a rule. Return one line.
- `checkItem(state: 'done'|'pending'|'warn', label: string, hint?: string): string` — a STATIC
  checklist row (never an in-place spinner): `  [✓] label`, `  [ ] label`, or `  [!] label`, and
  if `hint` and state !== 'done', append `\n        → ${hint}`. (`[✓]` done, `[ ]` pending, `[!]` warn.)
- `kv(key: string, value: string, keyWidth = 8): string` — `  ${key.padEnd(keyWidth)} ${value}`.
- Keep it a small module (< 120 lines). No box-drawing except the single `─` rule in `ruleHeader`.

Unit test `src/core/report-style.test.ts` (or the repo's test location — mirror a sibling test):
ruleHeader pads to width & right-aligns verdict; checkItem emits correct bracket per state + hint
line only when not done; renderBanner falls back without throwing when given a bad dir.

## 3. `ui onboard` command — NEW `src/commands/onboard.ts` + register in `src/cli.ts`

Deterministic readiness inspector over a project dir. Signature mirrors `doctor`/`init`:
`onboard({ cwd = '.', json = false, banner = true })` returning `{ stdout, exitCode: 0 }`
(informational — always exit 0, like `design-os evolution`).

**Steps to detect** (read the filesystem only; never mutate):

| id | detected by | state logic | pending hint |
|---|---|---|---|
| `adapters` | any of `.claude/ease-design.json`, `.agent/ease-design.json`, `AGENTS.ease-design.json` in cwd | exists → done | `run \`ui init\` to install the runtime adapters` |
| `git` | `.git` dir exists | exists → done else warn | `run \`git init\` — DESIGN:OS needs version control` |
| `ds` | `design/ds.manifest.json` | exists → done | `run \`ui ds init\` (new) or \`ui ds import\` (existing) to set up the design system` |
| `soul` | `design/soul.md` | missing → pending; exists but not `status: ratified` → warn; ratified → done | `run \`ui ds soul\` to declare your design stance` |
| `heartbeat` | `design/heartbeat.json` | exists → done else pending | `wired automatically by \`ui ds init\`/\`ui ds import\`` |
| `agents` | any `.claude/agents/*.md` | exists → done else pending (OPTIONAL) | `run \`ui agents init\` for soul-bound project agents (Claude Code)` |
| `figma` | env `FIGMA_AGENT_FILE` set, OR `design/ds.manifest.json` contains a figma file/node ref | set → done else pending (OPTIONAL) | capability-aware: `figma-agent` on PATH → `open the Figma Design Agent plugin, then \`figma-agent status\``; absent (npm-install norm) → `optional Figma track — clone the ease-design repo and run \`./setup.sh\` to enable it` |

`ready` = all of {adapters, git, ds, soul(done|warn), heartbeat} are non-pending. agents/figma are
optional and never block `ready`.

**Text output** (style-A, via the renderer):
```
<banner (unless --no-banner or json)>
<ruleHeader('onboarding', ready ? 'READY' : 'SETUP')>

  [✓] runtime adapters installed
  [✓] git initialized
  [ ] design system
        → run `ui ds init` (new) or `ui ds import` (existing) ...
  [ ] design soul
        → run `ui ds soul` ...
  [ ] learning loop (soul · heartbeat · harvest)
  [ ] project agents           (optional)
  [ ] figma design agent       (optional)

  next: <the first pending non-optional step's hint, or `ui generate` if ready>
  explore what DESIGN:OS can do → `ui guide`
```
Collapse `soul` + `heartbeat` into a single **"learning loop"** display line only if you prefer;
otherwise show them as separate rows — either is fine, but keep the `→ hint` on the first pending
core step in the `next:` line. Do NOT put a marker on rows that carry no state.

**JSON output** (`--json`): `ok_env`-style envelope `{ command: 'onboard', steps: [{ id, state,
optional }], ready }` — match the existing `--json` envelope shape used by other `ui` commands.

Register `onboard` in `src/cli.ts` next to `doctor`/`guide` with a one-line help:
`"Show this project's setup checklist and what to do next"`.

Tests `src/commands/onboard.test.ts`: (a) empty tmp dir → every core step pending, `ready:false`,
json shape correct; (b) a fixture dir with `.claude/ease-design.json` + `.git` + `design/ds.manifest.json`
+ `design/soul.md` (ratified) + `design/heartbeat.json` → those five done, `ready:true`; (c) `--no-banner`
omits the wordmark; (d) exit code always 0.

## 4. `src/commands/init.ts` — chain to onboarding

- Prepend `renderBanner(...)` to the success stdout (text mode only, not `--json`).
- After the existing `manifest written` / `adapters written` / `model adapter` lines, replace the
  ad-hoc `next:` hint block with these two explicit lines (keep the scan-based hint too if present):
  ```
  next: run `ui onboard` — your setup checklist and what to do next
        run `ui guide`   — see what DESIGN:OS can do
  ```
- Do not change init's write/rollback logic, flags, or `--json` output shape.

## 5. `src/adapters/wrapper-shapes.ts` — init wrapper instructs the host

Update the `/ui:init` wrapper body so that AFTER running `ui init`, the host agent is told to:
1. run `ui onboard` and walk the checklist WITH the user;
2. for any pending step, **ask the user for approval before running the suggested setup/install
   command** (never install silently) — the CLI only reports; the host acts;
3. surface `ui guide` so the user sees what is possible;
4. defer to the `onboard` journey skill for the full sequence.
Keep the wrapper concise; it is host-agent instruction text, not code.

## 6. `templates/journeys/onboard.md` — reference the new command

Add a short subsection near the top: "Run `ui onboard` first — it prints the project's setup
checklist and the exact next command for each gap." State the approval-before-install discipline
explicitly (host asks the user before running any install/setup command). Point to `ui guide` for
the capability showcase. Do not rewrite the existing journey content; add the pointer.

## 7. Changelog + README (dogfood the post-merge doc protocol)

This is user-visible → add a `CHANGELOG.md` dated entry (newest first) and a top row to the README
`## Changelog` recent-wave table. Do NOT touch the README marketing body (this is not a proof/claim
change). Commit is on the branch; do not merge/push.

## Gates (run ALL, report exact numbers)
`npm run typecheck` · `npm run lint` · `npm run build` · `npm test` (TS) and, if any Python touched
(should be none this phase), `design-os/.venv/bin/python -m pytest -q`. Also run `ui onboard` against
the ease-design repo root and paste its real stdout in the report.

## Acceptance
1. Fresh dir: `ui onboard` shows all core steps pending, `ready:false`, honest hints.
2. init prints the wordmark + chains to `ui onboard` and `ui guide`.
3. No color/Rich/ANSI added; ASCII-safe; each new file < 200 lines.
4. `ui` stays deterministic (no install, no network) — onboard only reports.
5. All gates green; new tests cover empty + set-up + `--no-banner` + json.
