# Design entry across runtimes

`ui init` gives natural-language requests an entry point before a workflow has been selected:

| Runtime | Persistent entry | Workflow / craft files |
|---|---|---|
| Claude Code | `.claude/rules/design-os-routing.md` | `.claude/commands/ui/`, `.claude/skills/` |
| Antigravity | `.agent/rules/design-os-routing.md`, `trigger: always_on` | `.agent/workflows/`, `.agent/skills/` |
| Codex | Managed block in `AGENTS.md` | Reads bundled Markdown directly |

Claude and Antigravity each generate 45 adapter artifacts: 22 workflows/commands,
22 craft/journey skills, and one routing rule. Codex generates one managed block.
The model invocation wrapper and manifest are separate artifacts.

The entry points reference the installed `knowledge/need-routing.md`; they do not
copy its routing tree. Explicit workflow requests retain authority. Pure nonvisual
work skips design workflows. Mixed tasks route the visual part through design.
Rendered UI implementation and review must load the available `es:designer` skill;
public installations without it use the bundled workflow, craft, and build loop.
Project tokens and platform specialists retain precedence.

Workflow names are not shell commands. Antigravity workflow wrappers discover real
commands through `ui schema --json`, then follow the Markdown workflow. Native
wrappers retain their typed capability activation check.

## What is verified

`ui doctor` checks the installed wrappers and template drift. Generated routing
rules require the supported two-key frontmatter format (`description`, `trigger`),
a single `always_on` trigger, no conditional scope, and existing references to the
routing/build-loop files and workflow/skill/journey directories. Older manifests
without a routing rule remain compatible; refresh them to gain this entry point.

Surfacing instructions is distinct from a model following them. Neither reading a
skill nor a green static gate proves rendered quality. The blind routing benchmark
uses prompt-only router inputs and an independent deterministic grader; see
[routing-benchmark.md](routing-benchmark.md). Invalid or duplicate decisions are
rejected, and `--require-complete` prevents a partial sample from looking complete.
Behavior on an untested model remains unverified.

## Refresh an installed project

First review and back up managed files you have customized: the runtime manifest,
command/workflow files, `design-os-*` skills, the routing rule, and the model wrapper.
Codex updates its managed block and preserves surrounding `AGENTS.md` text.
`--force` overwrites managed filenames, including user edits at those filenames;
other rule files are preserved. It is a write operation, not a preview.

After review, run the appropriate runtime in the target project:

```sh
ui init --runtime claude --force --json
# or: ui init --runtime antigravity --force --json
# or: ui init --runtime codex --force --json
ui doctor --cwd . --json
```

The JSON response lists written paths. Without `--force`, conflicts refuse the
write. Restart the host session to load new persistent instructions. Existing
installer rollback tests cover specific failure cases, not transaction guarantees
across all runtimes and filesystem failures.

## AutoHarness comparison

The pinned [AutoHarness source](https://github.com/tigerless-labs/autoharness/tree/fae35c63bc308d5987ca4212510de5dcf63290b1)
provides useful patterns: surface relevant skills before selection, separate
proposal from deterministic admission, and distinguish `use`, `view`, and `patch`.
This change applies surfacing and strict receipt admission; it adds no host hooks,
background self-editing, global skill mutation, or model/network calls to `ui`.
Knowledge promotion retains the existing librarian and human review boundary.

## Complete owner component kits

An explicit request to build the owner's full kit routes from capture to
[owner-kit onboarding](../knowledge/ds-kit-onboarding.md). The host authors actual
React components on the selected shadcn/Tailwind base; the local deterministic
`ui ds kit` family prepares content identity, validates declared evidence and adopts
only into an absent destination. Owner code can be reused, and owner vocabulary,
tokens, modes and variants stay authoritative. The scaffold's 25-component pilot
floor never caps inventory; explicitly record a smaller actual owner minimum
rather than fabricate components. Theme emission and host-write steps live in
the owner-kit guide; the CLI does not execute package scripts.

Whole-kit seals bind source, mappings, implementation, dependency/configuration
artifacts and evidence. They extend the normal DS revision without changing legacy
manifest identities. Sanctioned token/registry changes update that revision and mark
prior verification stale; unexpected artifact edits fail integrity. Complete source
scope and receipt execution remain host observations, distinct from byte validation.
Intact stale kits may load ordinary DS context; kit verify readiness and lesson
acceptance remain blocked until fresh evidence binds the current revision.

Persistent entry locations follow the primary [Claude rules documentation](https://code.claude.com/docs/en/memory)
and [Antigravity rules documentation](https://www.antigravity.google/docs/rules/).
Antigravity supports the existing `.agent/rules/` location as a legacy path.
