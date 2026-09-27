---
status: ratified
---

# Fixture Principles

Intro prose that must not become an entry.

## Core principles — product philosophy

### C1 · First core idea — subtract until only the work remains
- **Statement:** Every surface serves one operator task.
- **Why:** Prose the index ignores.
- **Yields when:** it would remove a safety step (C2), or when the agent
  rather than the owner is the one simplifying.
- **Test:** a rubric criterion in the critic pass; gate `check-example` (missing).

### C2 · Second core idea
- **Yields when:** never; only an explicit owner ruling.
- **Test:** `check-second` (in `build:ci`).

## Design principles

### D1 · Familiar over novel — reuse the ladder
- **Yields when:** the ladder has no rung for the job.
- **Test:** `check-ladder`.

### D10 · Floors hold at every width
- **Yields when:** never.
- **Test:** missing: `check-floors`.

## Precedence — when principles conflict

### Worked example A — a heading that is not a principle
- **Yields when:** ignored, there is no id in the heading.
