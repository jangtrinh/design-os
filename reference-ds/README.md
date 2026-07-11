# reference-ds — grade-A design systems, ingested into Design-OS stores

Real, world-class design systems onboarded via `ui ingest-figma-ds` and kept as **calibration
fixtures**: something to measure our tooling and the Design-OS DS standard against. These are
*reference data*, not test fixtures — tests own their own small inputs under `tests/`.

## `shadcn-standard/`
The shadcn "shadcn - standard" Figma library, live-scanned (`figma-agent scan-design-system`:
2188 components · 802 variables · 347 styles) and ingested deterministically:
- `tokens.json` — DTCG tokens (610 primitives + 187 semantic, Light/Dark). Follows the
  `{role}` / `{role}-foreground` paired convention that is the Design-OS semantic-tier standard —
  so `ui ds a11y` runs in **paired mode** on it.
- `component-registry.json` — 718 components (icons classified out).
- `DESIGN.md` — the human+AI-readable spec (347 styles documented).

Re-generate: scan the Figma file → `ds.json`, then
`ui ingest-figma-ds ds.json --out reference-ds/shadcn-standard --name shadcn-standard`.

Why it's here: it validated the whole "learn-from-shadcn" thesis end-to-end — the paired-token
model makes `ds a11y` deterministic AND still catches real sub-AA pairs even on this DS
(attention/positive/muted foregrounds). See `plans/260711-shadcn-designos-standard/`.
