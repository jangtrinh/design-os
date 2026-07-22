#!/usr/bin/env python3
"""Build the OG version of a Higgsfield-style app cover from full-bleed art.

Takes the full-bleed artwork (which is itself the plain marketplace cover)
and produces the OG image: solid color frame + the art masked into a
geometrically perfect stadium (pill) capsule + small corner dots.
The stadium's end caps are perfect semicircles (radius = half height) —
image models can't draw this reliably, so it is done in code, on the exact
same pixels as the plain cover.

Usage:
  python3 compose_cover.py --art plain_cover.png --out cover_og.png \
      --frame-color "#D9FF2E" --dot-color "#1A1A1A"

Modes:
  default        — the art is full-bleed: it is masked into the capsule.
  --detect       — the art already contains a model-drawn frame+capsule:
                   the capsule is auto-detected and its geometry perfected.
"""
import argparse
from PIL import Image, ImageDraw, ImageFilter
import numpy as np


def hex_rgb(s):
    c = s.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def sample_frame_color(im):
    w, h = im.size
    pts = [(int(w * 0.01), int(h * 0.5)), (int(w * 0.99), int(h * 0.5)),
           (int(w * 0.5), int(h * 0.015)), (int(w * 0.5), int(h * 0.985))]
    px = np.array([im.getpixel(p) for p in pts])
    return tuple(int(v) for v in np.median(px, axis=0))


def detect_capsule(im, frame_rgb, tol=60, frac=0.12):
    a = np.asarray(im.convert("RGB"), dtype=np.int16)
    diff = np.abs(a - np.array(frame_rgb, dtype=np.int16)).sum(axis=2)
    m = diff > tol
    cols, rows = m.mean(axis=0), m.mean(axis=1)
    xs, ys = np.where(cols > frac)[0], np.where(rows > frac)[0]
    if len(xs) == 0 or len(ys) == 0:
        raise SystemExit("could not detect capsule — check the art or use default mode")
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def stadium_mask(size, box, ss=4):
    W, H = size
    big = Image.new("L", (W * ss, H * ss), 0)
    r = (box[3] - box[1]) // 2
    ImageDraw.Draw(big).rounded_rectangle([v * ss for v in box], radius=r * ss, fill=255)
    return big.resize((W, H), Image.LANCZOS)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--art", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--frame-color", default="#D9FF2E",
                   help="frame hex (default mode). In --detect mode default is auto-sampled")
    p.add_argument("--dot-color", default="#1A1A1A")
    p.add_argument("--detect", action="store_true",
                   help="art already has a model-drawn frame: detect & perfect it")
    p.add_argument("--margin-x", type=float, default=0.045,
                   help="capsule inset, fraction of width (default mode)")
    p.add_argument("--margin-y", type=float, default=0.055,
                   help="capsule inset, fraction of height (default mode)")
    p.add_argument("--inset", type=float, default=0.006,
                   help="inset inside detected capsule (--detect mode)")
    p.add_argument("--no-dots", action="store_true")
    p.add_argument("--shrink", type=float, default=1.0,
                   help="scale the art down inside the capsule (e.g. 0.92) when text "
                        "sits too close to an edge; gap is filled with a blurred extension")
    p.add_argument("--offset-x", type=int, default=0,
                   help="shift the art horizontally (px, negative = left) to pull "
                        "edge-hugging content away from the mask")
    p.add_argument("--offset-y", type=int, default=0)
    a = p.parse_args()

    im = Image.open(a.art).convert("RGB")
    W, H = im.size

    if a.shrink != 1.0 or a.offset_x or a.offset_y:
        # Blurred cover-scaled copy fills whatever the shifted/shrunk art reveals.
        base = im.resize((int(W * 1.1), int(H * 1.1)), Image.LANCZOS) \
                 .filter(ImageFilter.GaussianBlur(40)) \
                 .crop((int(W * 0.05), int(H * 0.05), int(W * 1.05), int(H * 1.05)))
        art = im if a.shrink == 1.0 else im.resize(
            (int(W * a.shrink), int(H * a.shrink)), Image.LANCZOS)
        base.paste(art, ((W - art.width) // 2 + a.offset_x,
                         (H - art.height) // 2 + a.offset_y))
        im = base

    if a.detect:
        frame_rgb = sample_frame_color(im)
        fc = "#%02X%02X%02X" % frame_rgb
        x0, y0, x1, y1 = detect_capsule(im, frame_rgb)
        ins = int(W * a.inset)
        box = (x0 + ins, y0 + ins, x1 - ins, y1 - ins)
    else:
        fc = a.frame_color
        mx, my = int(W * a.margin_x), int(H * a.margin_y)
        box = (mx, my, W - mx, H - my)

    mask = stadium_mask((W, H), box)
    out = Image.composite(im, Image.new("RGB", (W, H), fc), mask)

    if not a.no_dots:
        dr = int(W * 0.008)
        ox, oy = int(W * 0.028), int(H * 0.045)
        d = ImageDraw.Draw(out)
        for cx in (ox, W - ox):
            for cy in (oy, H - oy):
                d.ellipse((cx - dr, cy - dr, cx + dr, cy + dr), fill=a.dot_color)

    out.save(a.out)
    print(f"saved {a.out} {W}x{H} frame={fc} capsule={box}")


if __name__ == "__main__":
    main()
