# Dogfood — Hermes Agent onboarding (2026-07-24)

**Product:** `ease-design` / DESIGN:OS.
**Attempted:** make DESIGN:OS available as native Hermes Agent project guidance and reusable skills.
**Hermes contract checked:** `AGENTS.md` is loaded from the working directory; skills are agentskills-compatible `SKILL.md` files; external skill roots are configured with `skills.external_dirs`.

## Outcome

A manual onboarding works: Hermes learned the project into a local `design-os-craft` skill, and `hermes skills list` reports it enabled. The shipped `ui init` path is not native yet.

```sh
ui init --runtime hermes --json
```

```json
{
  "ok": false,
  "command": "init",
  "error": {
    "code": "BAD_ARG",
    "message": "unknown runtime 'hermes'; must be one of: claude, antigravity, codex, agents-md"
  }
}
```

## F1 · GAP — no first-class Hermes runtime

`agents-md` is a useful partial bridge because Hermes reads `AGENTS.md` from the project cwd:

```sh
ui init --runtime agents-md --cwd <project> --json
```

The probe succeeded and wrote:

```text
AGENTS.md
AGENTS.ease-design.json
design-os-model.sh
```

However it emits no project-local skill tree, so Hermes cannot discover DESIGN:OS craft and journey skills through its normal progressive-disclosure index.

## F2 · CONTRADICTION — the generic model wrapper is Codex-specific

The generated `design-os-model.sh` says `agents-md` but executes Codex:

```sh
#!/usr/bin/env sh
# design:os model adapter (agents-md) — spec 013. Packet on stdin → host model on stdout.
exec codex exec
```

That makes `agents-md` portable for project instructions but not for DESIGN:OS harvest/reflect model calls under Hermes.

## F3 · GAP — Hermes skill discovery needs an explicit source-linked path

Hermes can scan shared skill roots without copying them into `~/.hermes/skills/`:

```yaml
skills:
  external_dirs:
    - <project>/.agents/skills
```

This is the best ownership model for DESIGN:OS: generated skills stay project-local and update in place when `ui init --runtime hermes --force` reruns. Copying generated skills into `~/.hermes/skills/` would create stale duplicates, project-name collisions, and unclear ownership. The adapter must not edit global Hermes config silently; it should print the exact opt-in and let the user approve it.

## F4 · GAP — the mandatory Fable reasoning gate is not part of onboarding

DESIGN:OS already uses Fable as the direction/audit tier, but runtime onboarding does not make the Fable Loop a discoverable, required dependency. A Hermes adapter should emit an agentskills-compatible `es-fable-thinking` skill and require it before every non-trivial DESIGN:OS workflow:

```text
FRAME → MODEL → DECIDE → EXECUTE → VERIFY → REPORT
```

The generated `AGENTS.md` block must say to load Fable Thinking plus the task-matched DESIGN:OS skill. Every delegated design task must receive the Fable delegation preamble, including the original success test, constraints, and reversibility. This makes epistemic tiers, falsification-first checks, prediction discipline, tripwires, and NOT-verified reporting part of the runtime contract rather than optional model style.

## Recommended native onboarding

Add `ui init --runtime hermes` as a first-class adapter with this contract:

1. **Project context:** upsert the existing compact DESIGN:OS sentinel block into `AGENTS.md`. Hermes already loads this from the cwd; do not add `.hermes.md`, which would win first-match discovery and unintentionally shadow a project’s portable `AGENTS.md`.
2. **Project-local skills:** emit agentskills-compatible wrappers under `.agents/skills/design-os-*/SKILL.md`. Preserve progressive disclosure: short routing descriptions, full procedure only on load, references read on demand.
3. **Mandatory Fable gate:** emit `es-fable-thinking`, declare it as a related/required skill for every DESIGN:OS journey, and instruct Hermes to load it before non-trivial design work. Preserve the canonical delegation preamble in a linked reference.
4. **Hermes tool vocabulary:** wrappers should name `read_file`, `search_files`, `terminal`, `patch`, `vision_analyze`, `browser_navigate`, `image_generate`, `clarify`, and `delegate_task` instead of assuming Claude-only tool names.
5. **Explicit opt-in:** after generation, print the `skills.external_dirs` YAML needed for `<project>/.agents/skills`; never mutate `~/.hermes/config.yaml` without approval.
6. **Native model adapter:** generate and live-probe a Hermes-backed model wrapper rather than inheriting `exec codex exec`. Record its verified invocation in the manifest like the existing runtimes.
7. **Doctor coverage:** `ui doctor --cwd <project> --json` should verify the AGENTS sentinel, skill-wrapper hashes, configured external root, Fable dependency, Hermes skill discovery, and model-wrapper smoke result.
8. **Reload handoff:** tell an active Hermes session to run `/reload-skills` or start a new session after onboarding.

## Minimal user journey

```text
ui init --runtime hermes
→ approve adding <project>/.agents/skills to Hermes external_dirs
→ /reload-skills
→ /es-fable-thinking
→ /design-os-onboard
→ ui doctor --cwd . --json
→ design-os doctor --versions --json
```

## What worked

- The runtime-neutral templates are already suitable source material.
- The `agents-md` AGENTS block is concise, hash-tracked, and gives Hermes enough context to locate workflows and knowledge.
- Hermes’ external skill directories avoid copying and keep DESIGN:OS as the source of truth.
- Manual `/learn` proved that a consolidated DESIGN:OS methodology can be represented and discovered as a native Hermes skill.

## Acceptance check

A clean temporary project should pass this sequence without manual file copying:

```text
ui init --runtime hermes --cwd <tmp> --json
fresh Hermes session in <tmp>
hermes skills list includes design-os-onboard, design-os-daily, and design-os-deliver
/es-fable-thinking resolves and is required by the generated AGENTS contract
/design-os-onboard resolves the generated skill
delegated DESIGN:OS work receives the Fable preamble with filled success test and reversibility
DESIGN:OS harvest/reflect invokes Hermes, not Codex
ui doctor --cwd <tmp> --json reports no adapter or skill drift
```
