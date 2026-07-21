# Spec 019 — Onboarding & first-run experience

**Goal (owner directive):** what is good for DESIGN:OS *users*. Make a fresh user's first
five minutes clear, confidence-building, and honest.

**Pipeline:** Opus plans → Sonnet implements → Opus + Codex 5.6 sol review → Fable 5 audit.
Runs autonomously overnight on branch `feat/019-onboarding-first-run`; **not merged, not pushed**
(owner reviews). **No registry publish** happens autonomously (owner-token-gated, outward-facing).

## Grounded reality (from 4 research agents + external TUI research)

- DESIGN:OS is a **one-shot CLI**, invoked BY a host agent (Claude Code / Codex / Antigravity).
  Its stdout is **channel B** (raw tool-output pane; ANSI stripped on Claude Code). The host
  re-states a summary in **channel A** (its markdown chat bubble). Design for channel B + a
  host-agent relay instruction.
- **"never Rich" is correct** (`envelope.py:8`): plain print only. Reports are disciplined
  plain-ASCII, monochrome-safe, single-border max, ASCII fallback, 80-col floor. Confirmed by
  `gfargo/tui-design-skill` + host capability matrix.
- **Report house style = "A / rule-line minimal"** (owner pick): rule lines + bold labels +
  glyph status; no boxes-in-boxes, no marker on every row, no color reliance.
- **Links:** bare `file://` path / bare `https://` URL (host wraps in OSC 8); never `[label](url)`
  (Claude Code discards the label). Figma links live OUTSIDE the `ui` kernel (Art I no-network).
- **Installs are host-mediated:** the `ui` CLI never installs anything; it reports what's missing
  and the command to fix it. The host agent asks the user before running any install.

## Decisions locked

1. Report aesthetic: **A (rule-line minimal)** — shared renderer, house style.
2. Distribution: **publish npm `ui` first + a `ui`↔`design-os` version-gate**; PyPI deferred.
   `npm publish` itself is an owner action (needs `NPM_TOKEN`) — prepared, not executed.
3. Sequence: **onboarding first**, then report renderer + preview links, then distribution prep.

## Phases

- **Phase 1 — Onboarding first-run** (`phase-1-onboarding.md`): brand wordmark, `ui onboard`
  readiness checklist, init chaining, capability showcase wiring, adapter + journey updates.
- **Phase 2 — Report renderer + preview links** (`phase-2-report-renderer.md`): shared style-A
  renderer adopted by the key user-facing commands; OSC-8-safe preview-link convention.
- **Phase 3 — Distribution prep** (`phase-3-distribution.md`): `ui`↔`design-os` version-gate,
  README clone-URL fix, `design-os` PyPI metadata, npm-publish readiness doc. No publish executed.

## The three complementary commands (triad)

- `ui doctor` / `design-os doctor` — *is the tool healthy?* (kernel + hands)
- `ui onboard` — *is THIS project set up, and what's next?* (NEW, phase 1)
- `ui guide` — *what can I do?* (capability showcase, already exists — wire it in)
