# Design review & handoff — the git-native flow

ease-design's artefacts are **text in git** — `design/design.tokens.json` (DTCG),
`design/component-registry.json`, `design/ds.manifest.json`, `DESIGN.md`, self-contained HTML.
So review, versioning and handoff fall out of git *for free*, using the deterministic surfaces the
binary already ships. This file is how the host model runs that flow; the binary emits the facts, the
model narrates and posts them.

## What a design "diff" is
Four diffs; three are reviewable in text and the binary computes them:
- **Token diff** — added / removed / changed, with *computed* visual-breaking-change.
- **Component-API diff** — variant axes + states + tokensUsed set changes.
- **Spec diff** — a plain Markdown diff of `DESIGN.md`.
- Visual (pixel) diff — needs a renderer; out of scope for the binary (a workspace concern).

## Review a design change (on a PR)
Materialise the two states from git refs and let `ui ds diff` classify them:

```bash
mkdir -p /tmp/base
git show origin/main:design/design.tokens.json      > /tmp/base/design.tokens.json
git show origin/main:design/component-registry.json > /tmp/base/component-registry.json 2>/dev/null || true

ui ds diff /tmp/base design \
  --base-version "$(node -p "require('./design/ds.manifest.json').version" 2>/dev/null || echo 0.1.0)" \
  --format pr-comment | gh pr comment "$PR" --body-file -
```

Read the result honestly (`knowledge/versioning-semver.md`): a **breaking** classification wants a
major bump; a **dangling** reference (a removed token still used by a component) exits 1 and blocks —
fix it before merge. **Never** talk a computed `breaking` down to a minor to dodge a major; the ΔE /
dimension measurement exists precisely to stop that dishonesty.

## Release notes
```bash
ui changelog --dir .            # Added / Changed / Decisions, newest first, provenance-tagged
```
Folds the manifest changelog + recorded `insight` decisions. Use it as the release body.

## Handoff to engineering
The artifact-gap engineers complain about ("states, edge cases, tokens the designer forgot") is
generated, not left to designer discipline:

```bash
ui ds docs --dir . --out COMPONENTS.md   # variants · states · tokensUsed (resolved) · missing-state hints
```

Then **you** add the context-gap prose that no static tool can produce — interaction behaviour,
conditional logic, animation specs, content rules — anchored to the component's declared states. The
*why* is already in the memory ledger (`/ui:why`, `ui memory context`), so cite it rather than
reinvent it.

**Code Connect note:** authoring/publishing `*.figma.tsx` templates needs a Figma **Org/Enterprise +
Full/Dev seat** (verified). On any lower seat, hand off the generated `COMPONENTS.md` + token values;
the discovery half of Code Connect (reading `*.figma.tsx` already in the repo) still works on any seat.

## What ease-design does NOT own
Realtime multiplayer, a comments UI/threads store, notifications, a hosted review portal, or true
pixel-diff rendering. Review lives in **the PR** (via `gh`); design facts are generated deterministically
and posted there. Integrate, don't reimplement Figma or GitHub.
