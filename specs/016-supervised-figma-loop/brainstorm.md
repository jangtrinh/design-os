# Supervised Figma Loop — Brainstorm

## Press Release

DESIGN:OS's Figma hand now works like a supervised collaborator: it inspects before
editing, proves every visual change with a screenshot, remembers when a designer corrects
its work, and carries that evidence safely between the Figma file and project memory.

Corrections remain evidence, not truth. They enter the existing governed learning loop and
cannot silently rewrite project taste. The result is faster iteration without surrendering
provenance, reversibility, or the deterministic `ui` boundary.

## User Stories

- As a designer, I want the agent to look before and after editing so visual regressions
  cannot be declared complete without evidence.
- As a designer, I want my corrections remembered so repeated work improves.
- As a project owner, I want correction history in both Figma and the repository so it is
  available offline and reviewable in version control.
- As a Figma hand, I want safe target fallback and typed trait operations so edits stay
  small and intentional.
- As a librarian, I want corrections to enter existing promotion governance rather than
  becoming knowledge automatically.

## MoSCoW

| Priority | Item | Rationale |
|---|---|---|
| Must | Inspect artifact with screenshot contract | Prevent false visual completion |
| Must | Safe explicit/selection/recent target resolution | Natural language without unsafe ambiguity |
| Must | Agent-operation provenance and correction events | Required to distinguish feedback |
| Must | Dual-store immutable merge and bounded retention | Durable, offline-capable memory |
| Must | Typed layout, fills/variables, typography, spacing, text traits | Replace routine raw scripts |
| Must | Existing learning governance remains promotion gate | Prevent hallucinated rules |
| Should | Hash-conflict quarantine diagnostics | Corruption must be visible |
| Could | Ambient pause/cowork watcher | Valuable only after recall is trustworthy |
| Won't | Automatic knowledge promotion | Violates evidence governance |
| Won't | Implicit targets for destructive/broad operations | Wrong-node risk |
| Won't | Replace broker, mirror, or reconcile architecture | Current design is stronger |

## Appetite and No-Gos

Appetite: one feature cycle, delivered as modular slices with all repository gates green.

No-gos:

- no LLM/network calls in the deterministic `ui` binary;
- no mutable correction events or silent last-write-wins;
- no new monolithic files over 200 lines;
- no whole-file Figma scans for single-node editing;
- no visual prototype: this feature extends protocol and CLI behavior, not panel layout.

## Research Protocol

| Step | Result |
|---|---|
| Benchmark | Cast's inspect/correction/trait workflow; research pinned in `docs/research/cast-to-figma/` |
| First principles | Root problem: agents lack a trustworthy observation→action→feedback loop |
| Framework | Event sourcing + edge-cache synchronization + explicit learning promotion |
| Cross-domain | Git-style immutable objects and quarantine beat mutable last-write-wins |
| Trade-off | More artifacts and storage for stronger provenance and recovery |
| Executability | Extend existing protocol, change capture, memory ledger, and command modules |

## Approved Decisions

- Project `design/memory` is canonical; Figma shared data is an edge cache.
- Merge immutable hashed events by ID; quarantine same-ID/different-hash conflicts.
- Compact project raw events at 30 days or 1,000/file; Figma cache keeps 250 plus unresolved.
- Cover layout, fills/variables, typography, spacing, and explicit-opt-in text.
- Reuse the existing world-class learning-loop promotion governance.
