#!/usr/bin/env python3
"""cover-lint — the deterministic safe-zone check that pairs with compose_cover.py.

The Higgsfield cover skill DRAWS the pill/frame/dots in code but then TRUSTS a prose
"keep everything inside the safe zone" instruction with no verifier — an emitter
without a linter (constitution Article II). This is that missing linter: it measures
whether the full-bleed art keeps its corners empty and its salient content (title,
subject) inside the central band that the stadium mask will NOT crop.

Findings-linter contract (Article II):
  finding = {checkId, severity, message}
  output  = {findings, errorCount, warningCount}   (JSON on stdout)
  exit 1 when errorCount > 0, else 0.

Pure measurement over pixels — no model, no network. Prototype proven in-session
2026-07-22 on the DESIGN:OS cover (the ":OS" title measured INSIDE the band; three
corners empty, the fourth held only the key-light shaft).

Usage:
  python3 cover_lint.py --art cover.png [--band 0.10] [--corner-max 0.02] [--json]
"""
import argparse
import json
import sys
import numpy as np
from PIL import Image


def content_mask(im):
    """A pixel is 'content' if it is bright (text/highlight) OR strongly saturated
    (a vivid subject) — i.e. not empty background."""
    a = np.asarray(im.convert("RGB"), dtype=np.int16)
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    return (lum > 95) | (sat > 75)


def lint(path, band=0.10, corner_max=0.02, edge_max=0.35):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    m = content_mask(im)
    bw, bh = int(W * band), int(H * band)
    findings = []

    corners = {
        "top-left": m[:bh, :bw], "top-right": m[:bh, -bw:],
        "bottom-left": m[-bh:, :bw], "bottom-right": m[-bh:, -bw:],
    }
    for name, box in corners.items():
        cov = float(box.mean())
        if cov > corner_max:
            findings.append({
                "checkId": "cover-corner-not-empty",
                "severity": "error",
                "message": (f"{name} corner is {cov*100:.1f}% content (max {corner_max*100:.0f}%) "
                            f"— the stadium mask crops corners hardest; keep them background-only"),
            })

    # A heavy content bleed along a full edge risks the title/subject being clipped
    # by the mask's rounded ends. Warn (the subject may legitimately bleed; text must not).
    edges = {
        "top": m[:bh, bw:-bw], "bottom": m[-bh:, bw:-bw],
        "left": m[bh:-bh, :bw], "right": m[bh:-bh, -bw:],
    }
    for name, strip in edges.items():
        cov = float(strip.mean())
        if cov > edge_max:
            findings.append({
                "checkId": "cover-edge-content-heavy",
                "severity": "warning",
                "message": (f"{name} edge band is {cov*100:.1f}% content (>{edge_max*100:.0f}%) "
                            f"— ensure no title/CTA text sits here; the mask may clip it"),
            })

    errs = sum(1 for f in findings if f["severity"] == "error")
    warns = sum(1 for f in findings if f["severity"] == "warning")
    return {"findings": findings, "errorCount": errs, "warningCount": warns,
            "canvas": f"{W}x{H}", "band": band}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--art", required=True)
    p.add_argument("--band", type=float, default=0.10, help="safe-zone inset fraction (default 0.10)")
    p.add_argument("--corner-max", type=float, default=0.02)
    p.add_argument("--edge-max", type=float, default=0.35)
    p.add_argument("--json", action="store_true", help="emit the findings envelope as JSON")
    a = p.parse_args()
    res = lint(a.art, a.band, a.corner_max, a.edge_max)
    if a.json:
        print(json.dumps(res))
    else:
        for f in res["findings"]:
            print(f"  [{f['severity']}] {f['checkId']}: {f['message']}")
        print(f"{res['errorCount']} error(s), {res['warningCount']} warning(s) "
              f"— {res['canvas']}, safe-zone {int(a.band*100)}%")
    sys.exit(1 if res["errorCount"] > 0 else 0)


if __name__ == "__main__":
    main()
