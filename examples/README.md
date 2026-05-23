# Examples

This directory has two kinds of content:

1. **`synthetic/`** — a deterministic walkthrough that drives the `ui` binary
   end-to-end **without a host AI model**. Run `synthetic/run.sh` to regenerate
   it. This is the only thing that exists today and it proves the non-LLM
   surface works as a single pipeline. See `synthetic/README.md`.

2. **Live dogfood — pending.** Everything else listed below lands here once a
   host AI model (Claude Code, Antigravity CLI, Codex CLI) runs the `/ui:*`
   workflows against this repo. That session is **not** part of this commit and
   has not happened yet.

## What live dogfood will add

When a host model runs the workflows end-to-end against an installed
ease-design, these artifacts will land here:

| Path | Source workflow | What it shows |
|---|---|---|
| `generated/<intent-slug>/variant-{1,2,3}.html` | `/ui:generate` | Three persona-diverse HTML variants from a single intent. Each variant is a self-contained file. |
| `generated/<intent-slug>/critique.json` | critique gate inside `/ui:generate` | Per-axis 0-10 scores against the 7-axis taste rubric, pass/fail decision, and refinement notes. |
| `iterated/<intent-slug>/before.html` + `after.html` | `/ui:iterate` | A diff between the initial generation and the refined version after natural-language feedback ("make it warmer", "tighter spacing"). |
| `iterated/<intent-slug>/refine-log.md` | `/ui:iterate` | The plain-English refinement transcript. |
| `extracted/<source-name>/design/` | `/ui:extract` | A full DS — tokens, registry, manifest — extracted from an existing HTML/screenshot. |
| `from-ref/<ref-name>/{replicate,enhance,adapt}.html` | `/ui:from-ref` | The same reference treated by all three prompt modes side-by-side. |
| `slides/<deck-slug>/` | `/ui:slides` | A multi-slide deck generated from a single intent + persona. |

The goal of the live dogfood pass is two-fold:

- **Validate the taste rubric thresholds.** The critique gate's pass thresholds
  (the 0-10 cutoffs per axis) are currently chosen *a priori*. Real outputs let
  us tune the thresholds so the gate actually catches bad designs without
  rejecting good ones.
- **Surface the non-designer happy path.** Someone with no design vocabulary
  should be able to type an intent, get three variants back, pick one by eye,
  and refine in plain words. The dogfood pass either confirms that flow or
  exposes where it breaks.

## How to run live dogfood (when you have a host model)

```sh
# from a host CLI session inside this repo
ui init --runtime claude          # wire up the slash-commands
/ui:generate landing page for a new gym
/ui:iterate make the hero warmer, tighten the headline
/ui:extract path/to/some-existing-design.html
```

The host model writes the resulting HTML and critique JSON; commit those into
`examples/generated/`, `examples/iterated/`, etc. once outputs settle.

## What's NOT pending

The deterministic surface — adapter generation, DS compilation, token mutation,
color math, token compilation, layout autofix, validation — is fully covered by
`synthetic/run.sh` and by 619 unit tests. None of that needs a host model.
