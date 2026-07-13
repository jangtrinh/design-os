# design-os

The **DESIGN-OS conductor** — a Python/[Typer](https://typer.tiangolo.com) umbrella CLI
that orchestrates the deterministic `ui` kernel (and, later, the figma-agent / recall /
pixelshot hands). The umbrella owns multi-step workflows and env checks; it **never
reimplements** a kernel check — it shells out to `ui … --json` and parses the envelope.

**Contract (see `plans/260712-design-os-cli-typer/proposal.md` §"Contract 6 điều"):** every
command emits the same envelope as `ui` (`{ok, command, data}` / `{ok:false, command,
error:{code,message}}`) with matching exit codes (0 clean · 1 findings/tool-error · 2
usage-error). `typer==0.26.8` is pinned exactly.

## Install / run

```sh
cd design-os
uv sync                          # provisions Python 3.12 + typer==0.26.8
uv run design-os doctor          # verify ui/node + optional hands
uv run design-os ui -- --version # raw passthrough to the ui kernel
uv run pytest -q                 # test suite
```

Set `DESIGN_OS_UI_BIN` to point at a specific `ui` binary; otherwise it is resolved on
`PATH`.

## Update

`design-os update` refreshes the **dev-linked toolchain**. The `ui` kernel plus the
`figma-agent` / `recall` / `a11y-audit` / `page-shot` hands are npm-linked global bins that
serve the repo's compiled TS output, so a refresh = recompile that TS with the same lines CI
runs (the root build for `ui`, then each workspace build). `design-os` itself is an editable
uv-tool install — its Python tracks source live and needs no rebuild.

```sh
uv run design-os update            # recompile every dist (ui + figma-agent/recall/a11y)
uv run design-os update --pull     # git pull --ff-only first, then recompile
uv run design-os update --check    # read-only: repo / commit / branch / dirty (no network)
```

The repo root is discovered by walking up from the installed package (markers:
`design-os/pyproject.toml` + `package.json` + `knowledge/`); override with `DESIGN_OS_REPO`.
A non-editable snapshot install has nothing local to rebuild → `update` reports `NOT_EDITABLE`
with the editable-reinstall hint. `--check` performs **no fetch** — run `git fetch` yourself
to see behind/ahead. After an update, run `design-os doctor` for the full hand check.
