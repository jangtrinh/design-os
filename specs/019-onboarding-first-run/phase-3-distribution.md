# Phase 3 — Distribution prep (execution spec)

**Implementer:** Sonnet 5, verbatim. Deterministic. **No registry publish is executed** — `npm publish`
/ PyPI upload require the owner's tokens and are outward-facing. This phase makes publishing
**one-owner-action-away** and closes the two-CLI coupling blind spot. STOP-and-report on conflict.

## 1. `ui`↔`design-os` version-gate (closes the coupling blind spot)

Today `design-os` finds `ui` by bare `shutil.which("ui")` with NO version check (`kernel.py:44-50`);
publishing one CLI without the other would break silently. Add a soft floor:

- Define `MIN_UI_VERSION` (e.g. the current `ui` version, read the real value from `package.json` at
  spec time) as a constant in `design-os/src/design_os/kernel.py`.
- Add `ui_version() -> str | None` in kernel.py: run `ui --version` via the resolved bin, parse the
  semver, return it (None on failure). Deterministic subprocess of a local bin — allowed (not network).
- `design-os/src/design_os/commands/doctor.py`: in the `ui` kernel check, show the resolved version and
  whether it meets `MIN_UI_VERSION`. Below floor → a `MISS`/warn line `ui vX.Y.Z — below floor A.B.C,
  run \`design-os update\``; at/above → `OK ui vX.Y.Z`. **Soft gate**: this is a warning in doctor, it
  does NOT hard-fail existing dev setups. Update the doctor pytest to cover both branches with a mocked
  `ui --version`.
- Confirm `ui --version` actually prints the package.json version (it should via the CLI framework);
  if not, add a `--version` flag to `src/cli.ts` that prints `package.json` version and nothing else.

## 2. README clone-URL fix (real doc bug)

`README.md:308` clone command says `.../design-os.git` but `package.json` `repository.url` is
`.../ease-design.git`. Fix the README to `ease-design.git` so a fresh clone works. (Verify the actual
line before editing — grep `design-os.git` in README.md.)

## 3. `design-os` PyPI metadata (publish-ready, not published)

Add to `design-os/pyproject.toml` `[project]`: `license`, `readme` (point to a design-os README or the
root README), `authors`, `classifiers` (Python versions, License :: OSI Approved :: MIT, Topic), and
`[project.urls]` (Homepage/Repository → the GitHub repo). Do NOT change name/version/scripts/deps. Do
NOT add a PyPI publish workflow and do NOT upload. This only removes the "bare listing / missing license"
warnings so a future `twine upload` is clean.

**Do NOT** attempt to fix the `design-os-figma` plugin's `workspace = true` dependency — that plugin↔core
distribution decision is the owner's (bundle vs separate PyPI package). Document it as the remaining PyPI
blocker in the runbook (§4), do not change it.

## 4. npm-publish runbook — NEW `specs/019-onboarding-first-run/npm-publish-runbook.md`

A short doc capturing the grounded state so the owner can flip the switch in minutes:
- **Single blocker:** add an `NPM_TOKEN` repo secret (npm automation token), then push a `vX.Y.Z` tag
  (or re-run the existing `.github/workflows/release.yml`). The 2026-07-08 dry run reached a valid
  tarball and failed only at `ENEEDAUTH`. Name `ease-design` is unclaimed on npm.
- **What ships:** `ui` core kernel + `knowledge/`+`schemas/`+`templates/` only. The `figma-agent`,
  `recall`, `a11y` hands are `private:true` and excluded from `files` — a global `npm i -g ease-design`
  gives the kernel, not the optional hands. State this as the current (owner-confirmable) scope.
- **Version-gate:** note that `design-os doctor` now warns when `ui` is below `MIN_UI_VERSION`, so a
  future skew between a published `ui` and a repo-linked `design-os` is now visible.
- **PyPI status:** `design-os` metadata is now publish-ready EXCEPT the figma-plugin `workspace=true`
  dependency, which must be resolved (bundle into core, or publish the plugin separately and switch its
  dep off `workspace`) before `pip install design-os` works standalone. No PyPI workflow yet.
- **`design-os update`:** still rebuilds a local clone only; a registry-update path (`npm i -g`/`uv tool
  upgrade`) is future work once published. Flag, do not implement.

## 5. Changelog

Distribution-prep is developer-facing more than user-facing; add a brief CHANGELOG dated entry
("distribution: version-gate + PyPI metadata + publish runbook; no publish executed"). No README
marketing-body or recent-wave change (nothing a user runs changed). Branch only.

## Gates
Python: `design-os/.venv/bin/python -m pytest -q` (version-gate branches covered). TS: full four gates
if `src/cli.ts` `--version` was touched. Paste `design-os doctor --versions` real output showing the
`ui vX.Y.Z` line.

## Acceptance
1. `design-os doctor` reports the resolved `ui` version and warns (soft) when below `MIN_UI_VERSION`.
2. README clone URL fixed. `design-os` pyproject has full PyPI metadata (still unpublished).
3. Runbook documents the single owner action to publish npm and the remaining PyPI blocker.
4. NO registry publish executed. All gates green.
