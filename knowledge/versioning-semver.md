# Versioning — semver for a design system

`ui ds diff <base-dir> <head-dir>` classifies the change between two design-system states and
recommends a semver bump. The binary emits the **class**; this file is how the host model
**narrates the why** and decides the release. Two dirs, each holding `design.tokens.json`
(+ optional `component-registry.json`); the host materialises them from git refs, e.g.

```bash
mkdir -p /tmp/base && git show HEAD~1:design/design.tokens.json > /tmp/base/design.tokens.json
git show HEAD~1:design/component-registry.json > /tmp/base/component-registry.json 2>/dev/null || true
ui ds diff /tmp/base design --base-version "$(node -p "require('./design/ds.manifest.json').version || '0.1.0'")"
```

## The rule: semver, but "breaking" includes VISUAL breaking

Most teams version only the API and eyeball the visuals ([EightShapes: Visual Breaking Change]).
ease-design's tokens are text with computable colour math, so visual breakage becomes **measured**,
not argued. The DS bump = the **maximum severity** across every token and component change.

### Token changes
| Change | Class | Why |
|---|---|---|
| token added | **additive** (minor) | existing refs still resolve; consumers gain capability |
| token removed | **breaking** (major) | any `tokensUsed` ref or adapter output now dangles |
| `$type` changed | **breaking** | downstream unit/emit transforms (CSS, Tailwind `@theme`, Figma vars) break |
| colour value, **ΔEOK ≤ 0.02** | **patch** | perceptually identical nudge (OKLab JND); corrects toward intent |
| colour value, **ΔEOK > 0.02** | **breaking** | a visible colour shift — on text/on-surface roles it can also flip contrast |
| colour value, non-hex | **breaking** | cannot measure ⇒ assume the worst |
| dimension delta **≤ 5%** | **patch** | sub-threshold; no layout shift |
| dimension delta **> 5%**, or a unit change | **breaking** | wraps text, truncates, shifts layout |
| fontWeight / fontFamily / duration / number value change | **breaking** | a contract change even if it "looks small" |
| `$description` / metadata only | patch → none | contract and rendering unchanged (not surfaced by the resolved diff) |

`--color-tolerance` (default 0.02 OKLab) and `--dim-tolerance` (default 5%) are the only tunables.
Ship conservative; loosen only with evidence. A **rename** is reported as *remove + add* (both
breaking) — no "safe rename" guess that could hide a break.

### Component changes (a component's API = its variant axes + states + tokensUsed)
| Change | Class |
|---|---|
| component added | **additive** |
| variant added · state added | **additive** |
| `tokensUsed` changed (internal) | **patch** |
| `markup` changed only (contract identical) | **patch** |
| component removed | **breaking** |
| variant removed / renamed · state removed | **breaking** |

### Cross-artifact integrity
A token removal is only safe once the registry agrees: if any component still lists the removed
token in `tokensUsed`, `ui ds diff` reports a **`dangling`** reference, forces **major**, and **exits 1**.
This is the payoff of tokens and components both living as text in one repo — the check is pure.

## Library-level (v1)
The manifest carries one `version`, so v1 versions the DS as a whole (library-level), not per
component ([Brad Frost: single library vs individual components]). Per-component semver is a later
option.

## What the host narrates
`ui ds diff` gives you `classification` + `recommendedBump` + `recommendedVersion` + the per-change
`reason` strings. Turn that into a human decision: confirm the recommended version, or justify a
different one — but **never downgrade a computed `breaking` to a minor** to avoid a major bump; that
is exactly the visual-breaking-change dishonesty this measurement exists to prevent. Use
`--format pr-comment` to post the summary with `gh pr comment`.

Sources: EightShapes *Visual Breaking Change in Design Systems* and *Versioning Design Systems*;
Brad Frost *Design System Versioning*; W3C Design Tokens (DTCG) 2025.10 stable format.
