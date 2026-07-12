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
