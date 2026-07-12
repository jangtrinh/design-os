"""Shared pytest fixtures: the CliRunner and a PATH-isolated fake-binary sandbox.

``fake_bin`` points PATH at a single tmp dir (deterministic: real figma-agent/recall/
pixelshot on the host can never leak in) and pre-installs default ``ui`` + ``node`` stubs.
Tests overwrite a stub via ``make_stub`` or drop one via ``remove``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from typer.testing import CliRunner

# Default `ui` stub: `--version` → 0.9.9; any `--json` → a static envelope; else echo args.
_DEFAULT_UI_BODY = """\
if [ "$1" = "--version" ]; then
  echo "0.9.9"
  exit 0
fi
for a in "$@"; do
  if [ "$a" = "--json" ]; then
    echo '{"ok": true, "command": "stub", "data": {"stub": true}}'
    exit 0
  fi
done
echo "stub ui $@"
exit 0
"""

_DEFAULT_NODE_BODY = 'echo "v20.0.0"\nexit 0\n'


@dataclass
class FakeBin:
    """Handle to the sandboxed bin dir; makes/removes executable ``#!/bin/sh`` stubs."""

    dir: Path

    def make_stub(self, name: str, script_body: str) -> Path:
        path = self.dir / name
        path.write_text("#!/bin/sh\n" + script_body)
        path.chmod(0o755)
        return path

    def remove(self, name: str) -> None:
        (self.dir / name).unlink(missing_ok=True)


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


@pytest.fixture
def fake_bin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FakeBin:
    bindir = tmp_path / "bin"
    bindir.mkdir()
    # PATH = ONLY the sandbox → deterministic resolution; no host binaries leak in.
    monkeypatch.setenv("PATH", str(bindir))
    # The env override must not shadow the sandbox `ui`.
    monkeypatch.delenv("DESIGN_OS_UI_BIN", raising=False)
    fb = FakeBin(dir=bindir)
    fb.make_stub("ui", _DEFAULT_UI_BODY)
    fb.make_stub("node", _DEFAULT_NODE_BODY)
    return fb
