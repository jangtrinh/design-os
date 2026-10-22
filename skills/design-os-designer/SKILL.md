---
name: design-os-designer
description: "Use when shaping, implementing, critiquing, polishing, hardening or auditing rendered UI, then proving it with the ui gate and a three-width look."
metadata:
  author: DESIGN:OS
---

# DESIGN:OS Designer

One workflow: Concept → Build → Check → Hand over → Adjust. It ships inside the ease-design package,
so it needs no separate install. The scripts are Node 20 or newer, built-ins only, and run offline;
the `ui` binary does all deterministic checking and this skill never grades taste by script.

## 1. Concept

Read [concepts.md](concepts.md) and write the one-sentence concept (surface, primary action, shape,
mode, data, states, widths). Pick a verb from its table and read only that knowledge file, end to end.
Read the numbered [rules.md](rules.md) before writing markup. [contract.md](contract.md) lists every
`ui` command and flag this skill uses; call nothing that is not there.

| Need | Verb | Read |
| --- | --- | --- |
| Fuzzy brief, structure first | shape | [page-structures.md](../../knowledge/page-structures.md) |
| A design or mock is supplied | implement | [build-loop.md](../../knowledge/build-loop.md) |
| Review or score | critique | [taste-rubric.md](../../knowledge/taste-rubric.md) |
| Final pass before shipping | polish | [design-tells.md](../../knowledge/design-tells.md) |
| Empty, error, loading, long data | harden | [content-design.md](../../knowledge/content-design.md) |
| Accessibility, layout, responsive | audit | `ui a11y-lint`, `ui validate-layout` |

When NOT to use: native macOS/iOS/iPadOS, Figma canvas, chart or diagram work (use their craft skills,
then check the render here), and changes that alter no rendered output.

## 2. Build

Write the page as one HTML file or one folder. Sample data lives in one place and is labelled. Start
from [pricing-page.html](examples/pricing-page.html) (a Persuade page) or
[incident-board.html](examples/incident-board.html) (an Operate screen) when a known-good shape helps.
Then, from your project directory, assemble the evidence folder; `<skill>` is this folder's absolute path.

```sh
node <skill>/build.mjs --target <page.html|folder> [--out <new folder>]
```

[build.mjs](build.mjs) copies the page and its local assets, records sha256 hashes, the contract hash and
the project design system, prints the folder path, and refuses an existing destination or any inside the
skill. Helpers: [shared.mjs](shared.mjs), [refs.mjs](refs.mjs), [contract-render.mjs](contract-render.mjs),
[validate-checks.mjs](validate-checks.mjs), [look-shots.mjs](look-shots.mjs), [look-probe.mjs](look-probe.mjs).

## 3. Check

Run validate, read [look.md](look.md), then run look.

```sh
node <skill>/validate.mjs --evidence <folder> [--tokens <file>] [--family <slug>]
node <skill>/look.mjs --evidence <folder> --sheet <folder>/look-sheet.png
```

[validate.mjs](validate.mjs) runs `ui gate` against the project design system plus the file checks and
prints one `<check>: <fix>` line per failure, or `ok`. [look.mjs](look.mjs) writes one sheet PNG at 375, 768 and 1440 px and measures
`L1`-`L5`. Both exit 0 checked, 1 rejected, 2 could not run. Neither downloads or installs anything.
Open the sheet and judge `L6`-`L10` yourself, or give a fresh-context critic the rubric and the sheet.
Machine checks do not grade clarity, taste or conformance to WCAG.

## 4. Hand over

Use these fields, keeping failures and missing checks visible:

```text
EVIDENCE: <absolute folder, sheet path>
BUILD: <command and exit>
VALIDATE: <exit and the actual lines, or ok>
LOOK: <exit and the L1-L5 lines, or the SKIPPED line>
EYE_ITEMS: <L6-L10: what you saw, per width, or NOT CHECKED>
CRITIC: <which separate subagent or session scored it, or NOT CHECKED>
NOT_VERIFIED: <screen readers, real devices, states not built, anything skipped>
```

Without a browser, write exactly the SKIPPED line from [look.md](look.md) under LOOK and list `L1`-`L5`
as NOT_VERIFIED. Never write "should work" or "looks right".

## 5. Adjust

Fix from the number, keeping the structure; shorten copy before changing structure, and log any
structural change with the measurement that forced it. Rebuild into a new folder, rerun validate and
look after the last edit. At most two fix rounds after the first full inspection, then hand over
what remains. Never edit inside `site/` or the generated [contract.md](contract.md).

| What goes wrong | Do this instead |
| --- | --- |
| `contract` or `manifest` line | Rebuild with this skill version; rules 1, 2 |
| `artifact-hashes` line | Edit the source and rebuild, never `site/`; rule 3 |
| `size` line | Build one page at a time; rule 4 |
| `external-request` line | Copy the asset into the folder; rule 5 |
| `gate` line | Read the finding, fix at its source; add `--tokens` for a project; rule 6 |
| `L1` or `L2` fails | Fix the layout, not the measurement; rules 7, 8 |
| `L3`-`L5` fails | Fix the load error or asset path; rule 9 |
| Same page for every brief | Name a different macrostructure first; rule 10 |
| Numbers or logos you cannot source | Mark as to confirm or cut; rule 11 |
| Data view with one state | Build empty, loading, error; rule 12 |
| Looks like a template | Change shape and focal placement, not colour; rule 13 |
| You scored your own page | Hand the sheet to a fresh context; rule 14 |
| No Playwright or browser | Print the SKIPPED line, capture by hand, report it |

## Roles on your runtime

Three roles, always filled by the runtime you are in; no model or vendor is named by this skill. The
critic is never the builder. A runtime with no second model uses a fresh subagent or session of itself.

| Runtime | Builder | Critic (fresh context) | Scout (read-only) |
| --- | --- | --- | --- |
| Claude Code | the main session | a subagent, named in the prompt | a subagent limited to read tools |
| Codex | the main session | a subagent you ask for explicitly | the `explorer` role |
| Gemini CLI | the main session | a custom subagent, `@name` | the `codebase_investigator` subagent |
| Antigravity | the main agent | a subagent the parent invokes | a subagent limited to read tools |
| Anything else | your session | a fresh session of your runtime | the same |

[rules.md](rules.md) rule 14 holds the critic's duties; [ATTRIBUTION.md](ATTRIBUTION.md) lists the sources and
licences and dates the host checks.
