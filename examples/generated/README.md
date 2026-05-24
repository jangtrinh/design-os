# Host-Model Dogfood — 2026-05-24

Live end-to-end execution of every `/ui:*` workflow against the v1 binary,
running inside a Claude Code session (the host model the workflows target).
Not a synthetic walkthrough — the model read each `templates/workflows/*.md`,
followed its steps literally, and produced real HTML output.

**Intent (held constant across all workflows):** _"landing page for a vegan
meal prep service"_

## Workflows exercised

| Workflow | Output | Result |
|---|---|---|
| `/ui:generate` | 3 variants (modular-system-layout, spatial-bento-geometry, kinetic-swiss-punk) | All 3 PASS: autofix 0 fixes, validate-layout 0 errors / 0 warnings, 100% DS-token consistency |
| `/ui:iterate` | text swap on variant-1 hero CTA via ln_diff strategy | classify→ln_diff, 1 chunk applied; gates green post-edit |
| `/ui:refine` | responsive polish fix on variant-3 footer divider | pass-1 fix (`border-r` → `md:border-r`); pass-2 audit clean |
| `/ui:redesign` | contra-persona swap from product-marketing → material-surface (liquid-glass) | IA preserved (6 regions, 4 meal cards, 3 pricing tiers); axes replaced (22 hard borders → 0, 0 backdrop-blur → 28); gates green |
| `/ui:extract` | (a) component registration from variant-3 (b) fresh DS init from a hand-coded source HTML | 2 swiss-punk components registered; cyan-primary DS compiled at gen 1 with 125 tokens |

## Files

- `variant-1-modular-system-layout.html` — generated, then iterated (hero CTA text)
- `variant-2-spatial-bento-geometry.html` — generated
- `variant-3-kinetic-swiss-punk.html` — generated, then refined (footer divider)
- `variant-1-redesign-liquid-glass.html` — redesign of variant-1 into a different family
- `design/` — project DS (vegan-prep-landing, modular-system-layout persona)
- `extract-demo/` — separate project showing extract from a hand-coded source HTML

## Defects found (in this pass)

### Minor — ln-diff cosmetic indentation drift

`ui edit-strategy apply` shaved one leading space from the patched line on
variant-1 (`'          Order'` became `'         Order'`). The structural
content is correct and gates still pass; the loss is purely cosmetic. Logged
for future cleanup; not blocking v1.

## Findings consistent with v1 spec

- Critique gate (full taste loop) was approximated by deterministic gates
  + manual axis review. The workflow's `templates/workflows/critique.md`
  pass-budget logic was not exhausted because all 3 variants passed
  deterministic gates and were token-consistent on first try. A more
  adversarial generation set (e.g. with weak personas + low Tailwind
  fluency) would force more critique iterations.
- Persona selection algorithm (Stage 1-4) was executed by hand against
  `knowledge/persona-index.md` and matched the expected family-diverse
  top-3 for this intent.
- DS-token consistency: 100% of hex values across all 4 generated HTML
  files come from the DS semantic token set. The bug found earlier
  (`color.primary` dropping from context after `change-token`) would have
  silently regressed this run if not for the `$extensions.ease.layer`
  marker fix in commit `3fab04b`.

## Pending (still out of scope for this session)

- Browser-rendered visual review of all 4 variants — the gates score code
  correctness, not visual taste.
- Critique workflow's full multi-axis scoring with refine routing — only
  approximated here.
- Taste-rubric threshold tuning — needs a larger sample of real
  generations to calibrate.
