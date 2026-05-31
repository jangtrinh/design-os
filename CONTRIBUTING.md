# Contributing to ease-design

Thanks for your interest. ease-design is a runtime-neutral design-cli; the rules below
keep it deterministic, dependency-free, and trustworthy.

## Setup

```sh
git clone <repo-url> ease-design && cd ease-design
npm install
npm run build
ui doctor        # confirms your dev install is healthy
```

Requires Node.js ≥ 20.

## The four gates (must all pass)

CI and `prepublishOnly` run exactly these — run them before opening a PR:

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src tests
npm run build       # tsup → dist/cli.js
npm test            # vitest (766+ tests)
```

## Hard rules (non-negotiable)

- **Zero runtime dependencies.** Use only Node built-ins (`node:*`). New entries under
  `dependencies` are rejected — a test enforces this. devDependencies only.
- **The `ui` binary stays deterministic.** Pure transforms: no network, no model/LLM calls,
  no `Date.now()`/`Math.random()` leaking into output. Same inputs → same bytes.
- **Two sources of truth.** `knowledge/` (Markdown the host model reads) and the `ui` binary.
  Never duplicate knowledge into code, or logic into knowledge.
- **CLI-native, no GUI.** Both designers and developers drive ease-design through `/ui:*`
  commands in an agent CLI. There is no separate GUI surface.
- **Keep files < 200 lines**; kebab-case, descriptive names.

## Adding a `ui` command

Mirror an existing command (e.g. `src/commands/taste-lint.ts`): a command object with
`name`/`summary`/`hasSubcommands`/`help`/`run`, registered in `src/cli.ts`. Pure logic goes in
`src/core/`. Support `--json` (structured envelope) alongside human-readable output. Add tests
in `tests/`.

## Changing the quality bar

The taste rubric (`knowledge/taste-rubric.md`) and the deterministic floor (`ui taste-lint`)
define "production-grade." Changes there affect every generation — include rationale and tests,
and keep the two in sync (the rubric describes; `taste-lint` enforces the machine-checkable subset).

## Releasing (maintainers)

```sh
npm version patch|minor|major   # bumps package.json + git tag
git push --follow-tags          # triggers the gated release workflow
```

The release workflow re-runs the four gates, verifies the tag matches `package.json`, and
publishes with provenance. Keep `CHANGELOG.md` updated under `[Unreleased]` as you go.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Keep commits
focused; no secrets.
