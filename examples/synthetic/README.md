# Synthetic walkthrough

This directory exercises the **deterministic `ui` binary** end-to-end without a
host AI model. It proves the non-LLM surface — adapter generation, design-system
compilation, token mutation, color math, token-target compilation — works as a
single coherent pipeline.

> This is **not** a substitute for live dogfood. Generation quality (HTML output,
> taste scoring, refinement loops) needs a host model running `/ui:generate` and
> lives under `examples/` once that session happens. See `../README.md`.

## Re-run

```sh
npm run build           # ensures dist/cli.js is fresh
examples/synthetic/run.sh
```

`run.sh` clears `examples/synthetic/output/` (gitignored scratch dir) and
rewrites the `0N-*.txt` artifacts in this directory.

## What each artifact is

| File | Step | What it proves |
|---|---|---|
| `01-ui-init-claude.txt` | `ui init --runtime claude --cwd <tmp>` | The Claude-runtime adapter tree compiles: 15 files (9 commands + 6 skills) plus the manifest. |
| `02-ui-ds-init.txt` | `ui ds init demo --persona liquid-glass --intent "landing page for a new gym" --brand-hex "#3b82f6"` | The Design-System SSOT compiles from a persona + intent into three artifacts (`design.tokens.json`, `component-registry.json`, `ds.manifest.json`) with a sealed `compiledHash`. |
| `03-ui-ds-context.txt` | `ui ds context --strict --format markdown` | The active DS emits as a Markdown context block — semantic tokens, registered components, enforcement note — for a host model to consume. |
| `04-ui-ds-change-token.txt` | `ui ds change-token color.primary --value '{primary.600}'` | The sanctioned post-init mutation works; `generation` bumps from 1 → 2; the manifest re-seals. |
| `05-ui-color-scale.txt` | `ui color scale '#3b82f6'` | 11-stop perceptual scale generation in OKLCH with WCAG contrast columns and anchor-stop detection. |
| `06-ui-tokens-compile-tailwind.txt` | `ui tokens compile design.tokens.json --target tailwind` | A live DTCG file (the one `ds init` just produced) compiles to a Tailwind v4 `@theme { }` block. |

## Why this exists

The repo has 619 unit tests covering each command in isolation. The walkthrough
covers the *seams* — output of one command becoming input to the next, with the
DS hash-seal traveling through. If a refactor breaks the contract between
commands, the artifacts will diverge from what's checked in and `run.sh` will
fail or emit visibly different `.txt` files.

## Scope

This walkthrough is intentionally *non-aesthetic*. It does not score a
generation against the taste rubric, does not render HTML, does not invoke the
critique gate — those need a host model. It only proves the deterministic floor.
