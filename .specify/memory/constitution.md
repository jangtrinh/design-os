# DESIGN:OS Constitution

<!-- The governing principles every spec, plan, and implementation in this repo
     must honor. Slash commands (/speckit-*) read this file before acting. -->

## Article I — Two sources of truth

1. **`knowledge/`** is the host-model brain: plain Markdown the agent reads directly.
   Never duplicate its content into code, skills, or specs — point to it.
2. **The `ui` binary** is the deterministic kernel: pure transforms, no network, no
   model calls, zero runtime dependencies (Node builtins allowed). Same input →
   same bytes, forever.
3. The `design-os` conductor composes tools and re-emits their JSON envelopes
   **verbatim** — one source of truth per verdict, never reinterpreted.

## Article II — Every standard ships an emitter AND a linter

A rule that exists only as prose will drift. When a spec introduces a convention,
the same change ships the code that emits it and the check that fails without it —
same commit when possible. Findings-linter shape everywhere:
`{checkId, severity, message, line?}` → `{findings, errorCount, warningCount}`,
exit 1 on errors.

## Article III — Real data before "done"

Every phase budgets at least one run on real project data before it is declared
complete. A green suite on a fresh fixture validates the mechanism, not the
contract. Generated artifacts run the FULL linter set in their own tests.

## Article IV — Fix at the shared layer

When a missing-rule bug surfaces, ask "which other consumer has this blind spot"
before patching where it surfaced. Extract the helper; never patch the symptom site.

## Article V — The three-tier pipeline

Implementation of a detailed spec runs: **Sonnet implements** (stops and reports on
any spec ambiguity — never improvises) → **Opus audits** (diff-vs-spec, re-runs
gates, adjudicates concerns; reports findings, does not fix) → **final gate reviews,
decides contested findings, commits, and pushes**. Specs must be detailed enough
that the implementer never guesses: exact file paths, signatures, test names,
acceptance criteria.

## Article VI — Git discipline (multi-machine, multi-session)

1. Stage by explicit path, never `git add -A`.
2. Explicit paths stop foreign FILES, not foreign HUNKS: before every commit,
   sweep `git diff --cached` for content that belongs to another session or
   feature — shared files (`cli.ts`, `command-signatures.ts`) are collision points.
3. Check CI after every push (`gh run list`). A red run is the next task.
4. Four gates green before any commit: `typecheck`, `lint`, `build`, `test`.
5. Conventional commits; no AI references in commit messages.

## Article VII — Specs live in the repo, tasks live on GitHub

1. Feature specs live in `specs/NNN-slug/` (spec.md, plan.md, tasks.md) and are
   **committed** — any machine clones and resumes. `plans/` is the pre-spec-kit
   archive (gitignored, single-machine); new work uses `specs/`.
2. Cross-machine task state lives in **GitHub issues** (created from tasks.md via
   `/speckit-taskstoissues` or `gh`), labeled by pipeline stage:
   `stage:spec` · `stage:implement` · `stage:audit` · `stage:final-gate`.
3. A session on any machine claims work by assigning itself the issue and
   commenting its intent; it releases by checking off tasks + closing.
4. Local memory (`~/.claude/.../memory/`) is personal working notes; anything
   another machine needs to resume MUST be in `specs/` or the issue thread.
5. `.claude/` is per-machine (gitignored). New machine setup:
   `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`
   then `specify init --here --integration claude --force` — the committed
   `.specify/` supplies templates/scripts; init regenerates the local wrappers.

## Article VIII — Honesty floors

No invented metrics, testimonials, or placeholder names in anything user-visible.
Static checks never claim "accessible" or "compliant" — they say exactly what they
checked. Souls are written in English; character over cosmetics — visual facts
belong to the design system, not the soul.

## Article IX — Modularity and scope

Code files stay under ~200 lines (split before they grow past it; command-file
precedent allows more only with reason). Kebab-case, long descriptive names.
YAGNI/KISS/DRY: no speculative features; the smallest change that honors the
articles above.

## Governance

Amendments to this constitution are their own commit, named in the message.
Where a spec conflicts with the constitution, the constitution wins until amended.

**Version**: 1.0.0 | **Ratified**: 2026-07-15
