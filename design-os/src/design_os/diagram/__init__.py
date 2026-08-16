"""Deterministic structural extractors for draw.io and Mermaid sources.

Vendored from cathrynlavery/diagram-design (MIT, (c) 2025 Cathryn Lavery); see
``THIRD_PARTY_LICENSES.md``. Read-only and stdlib-only: each extractor parses a
``.drawio`` / ``.mmd`` / Markdown-with-mermaid file and emits **intermediate data only** —
a Markdown digest of nodes, edges, and hub analysis, or the full JSON IR. Nothing here
renders, emits HTML or SVG, touches the network, or executes source content; the host
model redraws from the digest in a native grammar (``knowledge/diagram-craft.md``, the
extract-then-redraw contract).

Entry points are ``drawio_extract.main`` and ``mermaid_extract.main`` (also runnable as
``python3 -m design_os.diagram.<name>``). Nothing is re-exported here: importing the
package must not drag both parser trees in.

Upstream shipped each extractor as one long script; the ~200-line rule (constitution
Art IX) splits them into the modules beside this file. Parser bodies and every safety
limit — the 32 MiB input / 64 MiB inflate caps, the DTD/ENTITY refusal, the
supported-grammar allowlist — are unchanged.
"""
