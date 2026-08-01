# Forest spirit hero — 12-layer motion proof

This is an approved rough-mask prototype, not final art. Nine local 960×540 derivatives represent 12 semantic layers in seven promoted compositor planes: far world, rear atmosphere, focus group (mid-world plus shrine-grounded), spirit carrier (core plus light), near atmosphere, canopy arch, and near sill.

Serve `site/` on `127.0.0.1:4312` with any static server:

```sh
python3 -m http.server 4312 --bind 127.0.0.1 --directory site
```

Run the narrow checks:

```sh
node site/validate.mjs
node --check site/hero.js
```

The desktop proof is a 300svh scroll section with a 100svh sticky camera centered on the shrine ground contact. The shrine remains nested in its terrain focus group; only the spirit carrier follows the independent `38/43 → 48/34 → 58/48` arc. `?debug=1` exposes progress, shrine drift, layer labels, and the authored path. `?progress=0`, `0.25`, `0.5`, `0.75`, or `1` renders a deterministic checkpoint without animation listeners or frames.

Reduced motion selects the existing responsive static fallback immediately and creates no animation loop or listeners. The validation gate checks the nine-request/eight-plane ceiling, nested shrine invariant, one RAF, one screen blend, sticky camera, deterministic checkpoint support, and the 1.5 MB rough-asset budget.
