# Roles — pinned identities for Spec 022 (builder, curator, owner)

Three roles, three separate accountabilities. The rule this file exists to serve is
`knowledge/taste-rubric.md:391` — "the maker never grades its own work" — carried into the
protocol as D10/R2 of the architecture: the builder that generates arms must never be the model
that scores them, and the owner (the sole taste endpoint) must never see curator scores before
votes freeze.

## Prose summary

- **The owner** (`trinhnguyengiang`) is the sole taste endpoint. Every Phase-A ordinary/duplicate
  pair and every Phase-B pair is decided by the owner's forced blind preference; confidence is
  diagnostic only and never weights or filters the endpoint. The owner also votes on Phase-A
  contradiction pairs, but those votes are diagnostic only and never count toward the
  three-ordinary-wins endpoint (see `spec.md` §"Duplicate self-consistency and owner-voting
  scope").
- **The builder never votes.** The builder is the single pinned generation model for all 104 arms,
  run single-shot (D6): one completion per arm, fresh context, no agentic multi-turn build, no
  sibling-arm memory. It receives only the assembled per-arm prompt (`arm-prompt-template.md` +
  the **P7 arm-visible projection** of the brief — never the raw brief JSON, which would hand the
  arm its own candidate label and, on a probe brief, the leak definition itself +, treatment only,
  one patch file) and, where a repair is legal, the frozen `repair-prompt.md` triple. It never receives an owner vote, a curator score, or a sibling arm.
- **The curator receives no source, patch, assignment, maker transcript, or owner vote.** It
  receives only judging bundles: the codename-renamed artifact, its screenshots, and
  codename-neutral brief facts (`runs/judging/<presentation_id>/`). Its scores are diagnostic
  except for the predeclared veto (any critical regression on a treatment artifact, or any
  treatment axis ≥2 points below its pair's control) computed at reveal — this never substitutes
  for owner preference.
- **The owner receives no curator scores before votes are frozen.** The freeze-order mechanism
  (architecture §L) makes this structural, not just procedural: votes complete → `votes/
  FREEZE.json` + commit → curator scores complete → `curator/FREEZE.json` + commit → only then
  does `runs/reveal/` exist, joining scores to arms. The owner's votes are committed and hashed
  before any curator score file can be read against them.

## Directory boundaries (architecture §L)

- Builder-model output lands only in `runs/phase-*/`.
- The owner receives ONLY `runs/judging/` bundles (codename space; no manifests, no patches, no
  gates).
- The curator receives ONLY judging bundles + screenshots + brief facts (same bundles as the
  owner, same codename space).
- `runs/votes/` is writable only in the owner's session; `runs/curator/` only in the curator's
  session.
- The secret randomization map lives outside the repository entirely (`~/.design-os/prereg-022/`)
  until reveal.

## Machine-readable roster

`PR-009` (`patch-clean`) reads the provider/model token list from the `banned_identity_tokens`
array below to scan every patch, `arm-prompt-template.md`, and both brief files for identity
leakage. The block below is the sole source of truth for that scan.

<!-- prereg-roles: machine-readable -->
```json
{
  "builder": {
    "role": "builder",
    "runtime": "Claude Code CLI 2.1.220, non-interactive print mode, no tools, no session persistence",
    "provider": "Anthropic",
    "model_id": "claude-sonnet-5",
    "identity_source": "runtime-stated model ID read from the executing Sonnet 5 agent session's own environment block, 2026-07-26 (\"You are powered by the model named Sonnet 5. The exact model ID is claude-sonnet-5.\")",
    "params": {
      "mode": "single-shot",
      "turns": 1,
      "temperature": 1,
      "temperature_control": "Claude Code streaming default; no temperatureOverride",
      "token_ceiling": 32000,
      "token_ceiling_control": "CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000",
      "invocation": "CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000 claude -p --model claude-sonnet-5 --tools '' --disable-slash-commands --no-session-persistence --output-format text"
    }
  },
  "curator": {
    "role": "curator",
    "runtime": "codex exec, non-interactive",
    "provider": "OpenAI",
    "model_id": "gpt-5.6-sol",
    "identity_source": "Codex CLI runtime session header (codex-cli 0.144.6), probed 2026-07-26, session 019f9c13-aad2-7c03-aee2-9f20809fb81d; the same identity is recorded in reconciliation/mengto-codex-crosscheck.md for the Stage-5 run",
    "lineage_note": "Different model family from the builder (OpenAI GPT-5 line vs. Anthropic Claude Sonnet 5 line), satisfying \"the maker never grades its own work\" (D10/R2) — the curator does not share lineage with the builder. Honest discrepancy recorded rather than resolved: when asked to state its own model slug in that same probe, the model replied 'gpt-5.4', disagreeing with the harness-reported 'gpt-5.6-sol'. The harness header (codex-cli session header) is the recorded authority for this project; the self-report disagreement is preserved here, not silently reconciled."
  },
  "owner": {
    "role": "owner",
    "identity": "trinhnguyengiang"
  },
  "banned_identity_tokens": [
    "anthropic",
    "claude",
    "opus",
    "sonnet",
    "haiku",
    "openai",
    "codex",
    "gpt",
    "gpt-5",
    "gpt-5.6-sol",
    "gpt-5.4",
    "chatgpt",
    "gemini",
    "llama",
    "mistral"
  ]
}
```

## Generation pins

The owner pins the builder to Claude Code CLI `2.1.220`, model `claude-sonnet-5`, one
non-interactive completion with no tools and no persisted session, temperature `1` (the Claude
Code streaming default, with no `temperatureOverride`), and output-token ceiling `32000` enforced
by `CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000`. The exact invocation is recorded in the machine-readable
roster above. Every arm must use that same command and a fresh process; changing the runtime,
model, temperature behavior, ceiling, tool availability, or session policy invalidates the run.
This closes the `identical_across_arms` pin before generation begins.
