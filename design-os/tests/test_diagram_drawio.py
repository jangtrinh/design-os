"""`design_os.diagram.drawio_*` — the vendored draw.io structural extractor.

Two things are under test: the IR itself (node/edge digest + JSON) and the trust
boundary the port must not relax — the DTD/ENTITY refusal, the 32 MiB input cap, and the
64 MiB bounded inflate. Every assertion is about *intermediate data*; the extractor may
never emit markup, so the no-markup check is a test, not a comment.
"""

from __future__ import annotations

import base64
import json
import struct
import zlib
from pathlib import Path
from urllib.parse import quote

import pytest

from design_os.diagram import drawio_load
from design_os.diagram.drawio_extract import main
from design_os.diagram.drawio_load import (
    MAX_INPUT_BYTES,
    MAX_XML_BYTES,
    PayloadTooLarge,
    _decompress_limited,
)

_MODEL = """<mxGraphModel dx="800" dy="600">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="api" value="API" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="0" y="0" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="db" value="Postgres" style="shape=cylinder3;" vertex="1" parent="1">
          <mxGeometry x="0" y="160" width="120" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="e1" value="reads" edge="1" parent="1" source="api" target="db">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>"""

_MXFILE = f"""<mxfile host="app.diagrams.net">
  <diagram id="p1" name="Flow">
    {_MODEL}
  </diagram>
</mxfile>
"""


def _deflate(xml: str) -> str:
    """draw.io's own pipeline: URL-encode, raw-deflate, base64."""
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    raw = compressor.compress(quote(xml, safe="").encode()) + compressor.flush()
    return base64.b64encode(raw).decode()


def _png_chunk(ctype: bytes, body: bytes) -> bytes:
    crc = zlib.crc32(ctype + body) & 0xFFFFFFFF
    return struct.pack(">I", len(body)) + ctype + body + struct.pack(">I", crc)


def _png_with_mxfile(payload: str) -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0))
        + _png_chunk(b"tEXt", b"mxfile\x00" + payload.encode())
        + _png_chunk(b"IEND", b"")
    )


def _write(tmp_path: Path, name: str, text: str) -> Path:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


# ─── the IR ──────────────────────────────────────────────────────────────────────────

def test_a_minimal_drawio_file_digests_to_the_expected_nodes_and_edges(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(_write(tmp_path, "min.drawio", _MXFILE))]) == 0

    out = capsys.readouterr().out
    assert "1 page(s): [0] Flow (2n/1e)" in out
    # geometry, shape family, and in/out degree all ride on this row
    assert "| api | API | rect | 0 | 1 | 0/1 | 0,0 120×60 |" in out
    assert "| db | Postgres | cylinder | 0 | 1 | 1/0 | 0,160 120×80 |" in out
    assert "| API | Postgres | reads | - |" in out
    assert "- edges: 1 (1 labeled, 0 dangling), cycle: False" in out


def test_the_json_ir_carries_every_node_and_edge(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([str(_write(tmp_path, "min.drawio", _MXFILE)), "--json"]) == 0

    page = json.loads(capsys.readouterr().out)["pages"][0]
    assert [node["id"] for node in page["nodes"]] == ["api", "db"]
    assert [(edge["source"], edge["target"]) for edge in page["edges"]] == [("api", "db")]
    assert page["analysis"]["shapes"] == {"rect": 1, "cylinder": 1}


def test_the_extractor_emits_intermediate_data_and_never_markup(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _write(tmp_path, "min.drawio", _MXFILE)
    main([str(source)])
    main([str(source), "--json"])

    emitted = capsys.readouterr().out.lower()
    for markup in ("<svg", "<html", "<mxcell", "<mxgraphmodel", "<div"):
        assert markup not in emitted


def test_a_deflated_page_payload_is_inflated(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    packed = f'<mxfile><diagram id="p1" name="Zip">{_deflate(_MODEL)}</diagram></mxfile>'

    assert main([str(_write(tmp_path, "packed.drawio", packed))]) == 0
    assert "| api | API | rect | 0 | 1 | 0/1 | 0,0 120×60 |" in capsys.readouterr().out


def test_an_mxfile_in_a_png_text_chunk_is_decoded(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    inner = f'<mxfile><diagram id="p1" name="Shot">{_MODEL}</diagram></mxfile>'
    path = tmp_path / "shot.drawio.png"
    path.write_bytes(_png_with_mxfile(quote(inner, safe="")))

    assert main([str(path)]) == 0
    assert "1 page(s): [0] Shot (2n/1e)" in capsys.readouterr().out


# ─── the trust boundary ──────────────────────────────────────────────────────────────

def test_a_dtd_bearing_file_is_rejected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    hostile = (
        '<?xml version="1.0"?>\n'
        '<!DOCTYPE mxfile [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>\n'
        f'<mxfile><diagram id="p1" name="X">{_MODEL}</diagram></mxfile>'
    )

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "xxe.drawio", hostile))])

    assert exit_info.value.code == 2
    captured = capsys.readouterr()
    assert "DTD and entity declarations are not supported" in captured.err
    assert captured.out == ""  # nothing partially parsed


def test_an_entity_hidden_inside_a_compressed_page_is_rejected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The outer mxfile is clean; the guard has to fire again after inflating the page.
    hostile = '<!DOCTYPE m [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + _MODEL
    packed = f'<mxfile><diagram id="p1" name="X">{_deflate(hostile)}</diagram></mxfile>'

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "packed-xxe.drawio", packed))])

    assert exit_info.value.code == 2
    assert "DTD and entity declarations are not supported" in capsys.readouterr().err


def test_a_decompression_bomb_hits_the_cap_instead_of_expanding(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # ~80 MiB of one repeated byte deflates to a few KiB — the classic zip bomb shape.
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    bomb = compressor.compress(b"A" * (80 * 1024 * 1024)) + compressor.flush()
    payload = base64.b64encode(bomb).decode()
    assert len(payload) < 1024 * 1024, "the fixture must stay small to be a bomb at all"

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "bomb.drawio", payload))])

    assert exit_info.value.code == 2
    assert "decoded diagram exceeds the 64 MiB limit" in capsys.readouterr().err


def test_the_bounded_inflater_refuses_to_grow_past_its_limit() -> None:
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    bomb = compressor.compress(b"B" * (1024 * 1024)) + compressor.flush()

    with pytest.raises(PayloadTooLarge):
        _decompress_limited(bomb, -15, limit=4096)

    # the same payload under a limit that fits comes back whole — the cap is a cap,
    # not a blanket refusal
    assert _decompress_limited(bomb, -15, limit=2 * 1024 * 1024) == b"B" * (1024 * 1024)


def test_an_oversized_input_file_is_refused_before_it_is_parsed(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    # The real ceiling is 32 MiB; shrink it so the guard is exercised without a 32 MiB
    # fixture, then assert the shipped constants separately.
    monkeypatch.setattr(drawio_load, "MAX_INPUT_BYTES", 16)

    with pytest.raises(SystemExit) as exit_info:
        main([str(_write(tmp_path, "big.drawio", _MXFILE))])

    assert exit_info.value.code == 2
    assert "input is" in capsys.readouterr().err


def test_the_shipped_size_caps_are_the_vendored_ones() -> None:
    assert MAX_INPUT_BYTES == 32 * 1024 * 1024
    assert MAX_XML_BYTES == 64 * 1024 * 1024
