# Spec 020 — Full-studio one-command setup

**Owner decision:** distribution model = **kernel on npm + clone for the full studio**. The
`ui` kernel ships via `npm i -g ease-design` (done, spec 019). The hands (figma-agent, recall,
a11y-audit, page-shot) and the `design-os` living-agent umbrella stay **repo-only** — they were
built as monorepo workspaces (`private:true`, generic names already taken on npm), not registry
packages. This spec makes the clone path as easy as an install: one idempotent command.

**Pipeline:** Opus spec → Sonnet implement + test → Opus + Codex review → Fable gate.
**Do NOT publish anything.** This is local dev-setup tooling only.

## The gap

There is no first-run bootstrap. `design-os update` (Python) rebuilds an *already-linked*
toolchain; a fresh clone has nothing to update. README's quick-start only covers the kernel.

## Deliverable: `setup.sh` at repo root

A single idempotent bash script: fresh clone → complete kernel + 5 hand-bins + `design-os`
python, verified. Reuse the EXACT build steps already grounded in
`design-os/src/design_os/commands/update.py` `_BUILD_STEPS` + `.github/workflows/ci.yml` — do
not invent build commands.

### Behavior (in order)

1. **Prereqs** — check `node >=22` (the recall hand's floor), `npm`, `git`, and `uv` (for the python umbrella). On a
   missing/old prereq: print the one-line install hint and exit non-zero. `python`/`uv` missing
   is only fatal if not `--skip-python`.
2. **Install** — `npm install` (root; installs the 3 workspaces too).
3. **Build** — in order (a11y last, it emits two bins):
   - `npm run build` (→ `dist/cli.js` = `ui`)
   - `npm run build --workspace=figma-agent`
   - `npm run build --workspace=recall`
   - `npm run build --workspace=a11y`
4. **Link** — put all 5 bins on PATH: `npm link` at root (→ `ui`), then `(cd figma-agent && npm
   link)`, `(cd recall && npm link)`, `(cd a11y && npm link)` (→ `figma-agent`, `recall`,
   `a11y-audit`, `page-shot`). Use the subshell-cd form so a failure can't strand the cwd.
5. **Python umbrella** (unless `--skip-python`): `uv tool install --force -e ./design-os
   --with-editable ./design-os/plugins/figma` (the `--with-editable` on the figma plugin matches
   update.py's reinstall hint; `--force` makes it idempotent).
6. **Verify** — run `ui doctor` and, unless `--skip-python`, `design-os doctor`. Surface their
   pass/fail; a failed doctor makes setup exit non-zero.
7. **Report** — a style-A success block (rule-line header + `[✓]` rows) listing what is now
   available: the 5 hand-bins + `ui` + `design-os`, and the one next step (`ui onboard` in a
   project). Plain ASCII, no color (match the kernel's house style; hand-write the rule line in
   bash, this script can't import report-style.ts).

### Flags
- `--check` — prereqs + a "what's linked now" report only; **no install/build/link/mutation**.
- `--skip-python` — kernel + hands only, skip the `uv`/`design-os` steps.
- `-h/--help`.

### Constraints
- `set -euo pipefail`; every external command failure must stop with a clear message naming the
  failing step (not a raw stack).
- **Idempotent** — safe to re-run on an already-set-up machine (re-link/re-build/`--force` install
  are no-ops-ish). This is how it gets tested here.
- No network beyond what npm/uv already do; no publish; no writes outside the repo except the
  global bin links + the `uv tool` install (both are the point).
- Keep it readable; bash script (exempt from the 200-line rule) but stay lean.

## README

- Replace the dev note added in spec 019 (`> Working on DESIGN:OS itself?...`) with a **"Full
  studio (clone)"** subsection: `git clone https://github.com/jangtrinh/design-os.git && cd
  design-os && ./setup.sh`, then a one-line list of what the full studio adds over the npm kernel
  (Figma 1:1 mirror, semantic recall, the living-agent evolution/heartbeat/harvest loop, rendered
  a11y). Keep the `npm i -g ease-design` quick-start as the primary/simple path.
- CHANGELOG dated entry + recent-wave row (user-facing: full-studio setup).

## Gates / test (Sonnet runs on this machine — the toolchain is already linked, so a real run is
an idempotent no-op that proves the commands)
- `bash setup.sh --check` → paste output (prereqs + linked state).
- `bash setup.sh` → real idempotent run; paste the tail (build/link/verify + the style-A report).
  Confirm `ui doctor` and `design-os doctor` still pass afterward (nothing got unlinked).
- `shellcheck setup.sh` if available (clean or justify).

## Acceptance
1. `setup.sh` takes a fresh clone to a working full studio (5 bins + design-os) in one command,
   idempotent, fail-clear.
2. `--check` mutates nothing; `--skip-python` skips the uv steps.
3. Reuses the grounded build/link/install commands (no invented ones).
4. README + CHANGELOG updated. No publish. Gates green.
