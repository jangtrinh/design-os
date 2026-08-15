"""draw.io container decoding: raw XML, deflate+base64, PNG tEXt/zTXt/iTXt, SVG.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery).
Ported verbatim except for the module split the ~200-line rule (Art IX) requires;
every safety limit and parser body is unchanged.

The trust boundary lives here: DTD/ENTITY declarations are refused, the input file is
capped at 32 MiB, and every inflate is bounded at 64 MiB so a small payload cannot
expand without limit.
"""

from __future__ import annotations

import base64
import html
import re
import struct
import sys
import zlib
from pathlib import Path
from typing import NoReturn
from urllib.parse import unquote


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
MAX_INPUT_BYTES = 32 * 1024 * 1024
MAX_XML_BYTES = 64 * 1024 * 1024


class PayloadTooLarge(ValueError):
    """Raised when compressed metadata expands beyond the supported limit."""


def _fail(msg: str) -> NoReturn:
    print(f"drawio_extract: {msg}", file=sys.stderr)
    raise SystemExit(2)


def _reject_unsafe_xml(xml: str, source: str) -> None:
    """Reject declarations that can make XML parsing expand external data."""
    upper = xml.upper()
    if "<!DOCTYPE" in upper or "<!ENTITY" in upper:
        _fail(f"{source}: DTD and entity declarations are not supported")


def _decompress_limited(data: bytes, wbits: int, limit: int = MAX_XML_BYTES) -> bytes:
    """Decompress without allowing a small payload to expand without bound."""
    decompressor = zlib.decompressobj(wbits)
    output = bytearray()
    chunk = data
    while chunk:
        remaining = limit + 1 - len(output)
        if remaining <= 0:
            raise PayloadTooLarge(f"decoded payload exceeds {limit} bytes")
        output.extend(decompressor.decompress(chunk, remaining))
        if len(output) > limit:
            raise PayloadTooLarge(f"decoded payload exceeds {limit} bytes")
        chunk = decompressor.unconsumed_tail
    if not decompressor.eof:
        raise zlib.error("incomplete compressed payload")
    remaining = limit + 1 - len(output)
    if remaining <= 0:
        raise PayloadTooLarge(f"decoded payload exceeds {limit} bytes")
    output.extend(decompressor.flush(remaining))
    if len(output) > limit:
        raise PayloadTooLarge(f"decoded payload exceeds {limit} bytes")
    return bytes(output)


def _inflate(payload: str) -> str | None:
    """Undo draw.io's base64 + raw-deflate + URL-encoding pipeline."""
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        return None
    for wbits in (-15, 15, 47):
        try:
            text = _decompress_limited(raw, wbits).decode("utf-8", "replace")
        except PayloadTooLarge:
            _fail(
                f"decoded diagram exceeds the {MAX_XML_BYTES // (1024 * 1024)} MiB limit"
            )
        except Exception:
            continue
        # draw.io URL-encodes before deflating; unquote is a no-op if it didn't.
        return unquote(text)
    return None


def _png_embedded_xml(data: bytes) -> str | None:
    """Pull the ``mxfile`` tEXt/zTXt chunk out of a draw.io-exported PNG."""
    pos = len(PNG_MAGIC)
    while pos + 8 <= len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        body_end = pos + 8 + length
        chunk_end = body_end + 4
        if chunk_end > len(data):
            _fail("PNG has a truncated metadata chunk")
        body = data[pos + 8 : body_end]
        pos = chunk_end
        if ctype not in (b"tEXt", b"zTXt", b"iTXt"):
            if ctype == b"IEND":
                break
            continue
        key, _, rest = body.partition(b"\x00")
        if key.lower() != b"mxfile":
            continue
        try:
            if ctype == b"tEXt":
                value = rest
            elif ctype == b"zTXt":
                value = _decompress_limited(rest[1:], 15)
            else:  # iTXt: compression flag, method, lang, translated key, text
                flag = rest[0:1]
                tail = rest[2:].split(b"\x00", 2)[-1]
                value = _decompress_limited(tail, 15) if flag == b"\x01" else tail
        except PayloadTooLarge:
            _fail(
                f"embedded PNG diagram exceeds the "
                f"{MAX_XML_BYTES // (1024 * 1024)} MiB limit"
            )
        except (IndexError, ValueError, zlib.error):
            _fail("PNG has invalid compressed draw.io metadata")
        return unquote(value.decode("utf-8", "replace"))
    return None


def _svg_embedded_xml(text: str) -> str | None:
    for match in re.finditer(
        r"\bcontent\s*=\s*([\"'])(.*?)\1", text, flags=re.IGNORECASE | re.DOTALL
    ):
        candidate = html.unescape(match.group(2))
        if "<mxfile" in candidate or "<mxGraphModel" in candidate:
            return candidate
    return None


def load_mxfile(path: Path) -> str:
    """Return the ``<mxfile>`` (or bare ``<mxGraphModel>``) XML for any input."""
    size = path.stat().st_size
    if size > MAX_INPUT_BYTES:
        _fail(
            f"{path.name}: input is {size} bytes; maximum is "
            f"{MAX_INPUT_BYTES // (1024 * 1024)} MiB"
        )
    data = path.read_bytes()
    if data.startswith(PNG_MAGIC):
        xml = _png_embedded_xml(data)
        if not xml:
            _fail(f"{path.name}: PNG has no embedded draw.io diagram")
        return xml
    text = data.decode("utf-8", "replace").lstrip("﻿").strip()
    if "<mxfile" in text or "<mxGraphModel" in text:
        return text
    if "<svg" in text[:2000]:
        xml = _svg_embedded_xml(text)
        if not xml:
            _fail(f"{path.name}: SVG has no embedded draw.io diagram")
        return xml
    inflated = _inflate(text)
    if inflated and "<mxGraphModel" in inflated:
        return inflated
    _fail(f"{path.name}: not a draw.io file (no mxfile, mxGraphModel, or payload)")
