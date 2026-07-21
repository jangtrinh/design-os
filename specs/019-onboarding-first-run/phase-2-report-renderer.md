# Phase 2 — Report renderer + preview links (execution spec)

**Implementer:** Sonnet 5, verbatim. Depends on Phase 1's `src/core/report-style.ts`. Deterministic
only. Match surrounding style. Files < 200 lines. STOP-and-report on any conflict.

**Scope discipline:** adopt the house style on the **highest-traffic, user-facing** surfaces and the
**preview-emitting** commands only. Do NOT sweep all 28 ad-hoc glyph sites — that broad migration is a
documented follow-up (§5). Never change a command's semantics, exit code, or `--json` shape; only the
human text render.

## 1. Preview-link convention — NEW `src/core/preview-link.ts`

Small helper, no network. Export:
- `previewLink(absPath: string, label = 'preview'): string` → `kv(label, 'file://' + absPath)` i.e.
  a bare `file://<abs>` path on its own labelled line. Rationale (locked): bare `file://`/`https://`
  is what the host wraps in an OSC 8 clickable link; `[label](url)` is discarded by Claude Code. Never
  emit markdown link syntax. Never emit an inline image.
- `figmaNote(): string` → the one-line honest note that Figma preview links are produced by the
  figma-agent layer, not the `ui` kernel (Art I no-network) — e.g. `figma    (via figma-agent; ui does
  not construct Figma URLs)`. Used where a command would otherwise want to show a Figma link.
- Absolute-path helper: callers pass an already-resolved absolute path (use `path.resolve`).

Unit test: `previewLink` emits `file://` + absolute path, no markdown brackets; `figmaNote` stable.

## 2. Adopt style-A + preview links in the preview-emitting commands

- `src/commands/ds-preview-impl.ts` (writes `specimen.html`): replace the bare `"wrote " + out`
  text with a style-A block — `ruleHeader('ds preview', 'DONE')` + `kv('components', ...)` +
  `previewLink(resolve(out))`. Keep `--json` output identical.
- `designmd-audit-impl.ts` (already embeds the report path in a one-line summary): keep the summary,
  but render it via `ruleHeader('designmd audit', verdict)` + the PASS/WARN/FAIL `kv` lines + a
  `previewLink(resolve(auditMdPath), 'report')` line. `--json` unchanged.

## 3. Adopt style-A in `ui doctor`

`src/commands/doctor.ts` already uses `✓/!/✗`. Re-express `formatReport` through the shared
`report-style.ts` (`GLYPH`, `ruleHeader('doctor', allPassed ? 'READY' : 'CHECK')`, `checkItem`) so the
kernel-doctor matches the house style. Keep every check, message, and exit code identical. Update the
doctor snapshot/test to the new text if one exists (justify the diff in the report).

## 4. Python parity — NEW `design-os/src/design_os/report_style.py` + adopt in two renderers

Mirror the TS renderer as plain-print helpers (respect `envelope.py:8` "never Rich"): `GLYPH` dict,
`rule_header(title, verdict='', width=64)`, `check_item(state, label, hint=None)`, `kv(key, value,
key_width=8)`. Pure str-returning, ASCII-safe, `─` the only box char. < 120 lines. Then adopt in:
- `design-os/src/design_os/commands/doctor.py` `_render_text` — `rule_header('doctor', ...)` + per-hand
  `check_item`. Keep `OK`/`MISS` semantics as `done`/`fail` (or `pending` for optional-missing). Exit
  codes unchanged.
- `design-os/src/design_os/commands/evolution.py` `_render_text` — wrap the verdict line in
  `rule_header('evolution', signals['verdict'])`; keep every dimension line (Art VIII — always name
  every signal). Do not drop any line.
Update affected pytest expectations to the new text; justify each diff.

## 5. Documented follow-up (do NOT implement now)

Add a short `## Deferred` note to this file's sibling `overview.md`? No — instead leave the remaining
~24 ad-hoc glyph sites (a11y-checks, flow, ds-usage-lint, content-lint, vr-support, agents, ds-soul,
ds-specimen, figma-ds-registry, and the Python heartbeat/audit renderers) to a future migration pass.
List them in the Phase-2 report so the owner sees exactly what was and was not migrated. Rationale:
a full unsupervised sweep risks broad snapshot churn; the house style is proven on the high-traffic
surfaces here first.

## 6. Changelog + README

User-visible (nicer, consistent reports + clickable preview paths) → CHANGELOG dated entry + README
recent-wave row. No marketing-body change. Branch only.

## Gates
TS: `npm run typecheck` · `lint` · `build` · `test`. Python: `design-os/.venv/bin/python -m pytest -q`.
Paste the real before/after stdout of `ui ds preview` (or `designmd audit`) and `design-os doctor` in
the report to show the house style live.

## Acceptance
1. Preview commands emit a bare `file://` path (host-clickable), never `[label](url)`, never an image.
2. `ui doctor`, `ds preview`, `designmd audit`, `design-os doctor`, `design-os evolution` all render in
   the style-A house style; semantics/exit codes/json unchanged.
3. No color/Rich/ANSI. All gates green. Migrated-vs-deferred list included in the report.
