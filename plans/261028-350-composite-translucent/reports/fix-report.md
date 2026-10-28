# Fix report: `mode-invisible-surface` composites over the real parent background (issue #350)

Branch: `worktree-agent-a7acf21b1a57829e9`. Files: `src/core/taste-checks-invisible-surface.ts` (rewritten), `tests/taste-checks-web-craft.test.ts` (tests added, none edited or removed). `taste-checks-shared.ts` untouched.

## 1. What could NOT be verified (read first)

- **Composite correctness on real data is evidenced by unit tests plus corpus tallies, not by an independent oracle.** On the pre-fix studio films (the field case), the old 96 findings became 0 because the new checker BAILS (var()/gradient/unresolvable parent), not because it measured a visible composite. A zero from a bail is not proof of "visible".
- **No browser ground truth.** The resolver is pure text: no cascade/specificity simulation, no UA stylesheet backgrounds, no `color-scheme`, no sibling-positioned media layers (e.g. a `<video>` or absolutely positioned image behind a pill is not seen). Where rules disagree, the token is skipped, never guessed.
- **Design choice B vs A not validated by the owner** (see section 3 and Unresolved questions).
- **Visual-evidence mandate:** this is a text linter with no rendered output; the visual proof is the terminal captures of RED/GREEN and gate tails below. No browser screenshot was taken.
- **The `Skill` tool was not available in this runtime**; the fable-thinking `SKILL.md` was applied from the brief's preamble, not loaded.
- A fresh worktree has no `dist/`; built-binary tests fail until `npm run build` has run once (not caused by this change).
- Final file is 578 lines, above the 200-line guidance. Not split because the allowed-file list forbids a new module (follow-up F1).

## 2. Diagnosis (original code, `git show HEAD:src/core/taste-checks-invisible-surface.ts`)

The check asked "what mode is the whole document?" and judged every translucent token against that one answer, instead of asking "what is directly behind this token?".

- L74-77 `bgLuminance`: `.exec` takes the FIRST colour match only.
- L88-98 `hasDarkSurface`: proxy for "page has a dark surface", reading the first hex in the CSS blob (L96); an rgb()/hsl()/Tailwind card, or a dark colour that is not the first hex, is invisible to it.
- L139-145: the bail is document-global (any dark surface anywhere returns `[]`), so detection and suppression both depend on the proxy.
- L151-180: both sources (utilities and CSS declarations) are judged against the global `mode`, never against the token's ancestor chain.

Effect: a white pill on a dark card on a light page was flagged (issue), and the same page with a dark section elsewhere silenced real findings.

## 3. Approach and why

For each translucent white/black token, find the nearest ancestor chain's backgrounds from the markup, composite them in sRGB luma (blend is linear in luma), and flag only when the token's own polarity matches the backdrop AND |composite - backdrop| < 0.03 (ALPHA_FLOOR 0.15 retained). Pure string/regex, no new deps or DOM:

- Tag-stack walk over the markup (quote-aware tags, void tags, optional-close `<li>`/`<p>`/etc., synthetic html/body spine).
- Selector parser/matcher (tag/#id/.class/[attr=val]/state pseudo/pseudo-element/`:root`, descendant and child combinators). Sibling combinators, `:not()`, `:nth-*` are "maybe" and never decide a background.
- Background of an element = inline style, else matching rules, else Tailwind utilities (neutral shade ramp, `bg-white|black/N`, `bg-[arbitrary]`). Nested translucent layers are composited down to the first opaque layer.
- **Bail per token** (the token is skipped, never guessed) when any ancestor background (root included) is: `var()` unresolved or defined inconsistently, gradient/url, unknown theme utility (`bg-card`), chromatic palette, rules that disagree, only "maybe" candidates, or a `dark:`/breakpoint background variant. Declarations that no element carries (detached rules) and custom properties (`--x-border`) are skipped.
- `dark:` utilities are skipped (they are not the resting state) and a dark-root page treats the unprefixed half of a `x dark:y` pair as inactive.
- Root `var()` backgrounds are resolved from global custom-property definitions if every definition agrees.

Why choice B (global bail removed, replaced by the token-level bail): the global bail was the mechanism that made the bug invisible in one direction and masked real findings in the other. Keeping it ("A") would leave the acceptance criterion ("composites over its real parent background") unmet for any page that has a dark card. Cost of B: 19 corpus files now surface findings that the global bail silenced (true positives by the definition above), which is an increase in recall on mixed pages.

Consequences of removing the bail that had to be handled in the same change: `dark:` variants, in-start-tag-only utility matching (prose/code samples), anchored `SURFACE_DECL` (`(?<![\w-])`), `@import url(...;...)` semicolons corrupting the next selector (found by the field corpus).

## 4. Evidence

### 4.1 RED: new tests against the UNMODIFIED checker (old bundle built from `HEAD`, same final test file)

```
 Test Files  1 failed (1)
      Tests  37 failed | 21 passed (58)

 FAIL  old-checker.test.ts > mode-invisible-surface — composites over the real parent background > does NOT flag a translucent white pill on a dark card whose hex is not the first one in the document
AssertionError: expected [ { …(4) } ] to have a length of +0 but got 1
 ❯ old-checker.test.ts:75:45
     75|     expect(checkModeInvisibleSurface(html)).toHaveLength(0);
```

Same run, direct-on-light-root guard: `expected [ { …(4) }, { …(4) } ] to have a length of 1 but got 2` (old code also flags the pill inside the dark card). The 21 passing are the 20 original tests (unmodified) plus one guard that old and new both satisfy. (58 = the mode-invisible-surface describes only; the full file has 70.)

### 4.2 GREEN: same tests against the new checker

`npx vitest run tests/taste-checks-web-craft.test.ts` -> 70 passed (before the final full suite).

### 4.3 Sabotage matrix (22 single-knob mutants of the new checker)

Every mutant is caught by at least one test: global bail restored (8 red), no compositing, polarity off, MIN_STEP 0 and 1, alpha floor off, own-surface edge, unknown parent as transparent, optional-close siblings, `dark:` not skipped, child combinator as descendant, `@import` junk, attribute value ignored, `:hover` as resting, prose utilities, var() off, custom-property declarations, dark-root pair, detached rules, breakpoint poisoning, pseudo-element overlay, nested layers.

### 4.4 Real data (Law 5), ~7.4k HTML files, old vs new

Old 909 findings -> new 101 flagged (6343 token composites resolved as visible). 19 files gain findings the old global bail had silenced; pre-fix studio films 96 -> 0 (via bail, see section 1). Robustness fuzz (truncations, nibbles, `>` storms, 20k-deep nesting, 20k unclosed `<li>`, 30k selectors/rules, var() cycle, 40k tokens): 491 runs, 0 throws, worst 82 ms.

### 4.5 Gate tails, run in the worktree AFTER the last edit

Command: `npm run typecheck && npm run lint && npm test && npm run build` -> exit 0.

```
> ease-design@0.6.1 typecheck   tsc --noEmit            (no output)
> ease-design@0.6.1 lint        eslint src tests         (no output)
 Test Files  345 passed (345)
      Tests  5926 passed | 12 skipped (5938)
   Start at  20:30:02
   Duration  357.01s
ESM dist/lint.js           877.00 B
ESM dist/chunk-MMNSHSEE.js 626.24 KB
ESM dist/cli.js            1.67 MB
ESM ⚡️ Build success in 91ms
catalogue check: .../schemas/template-descriptions.json
```

(Lines in the full log that read `N error(s), 2 warning(s)` are CLI-lint fixtures printed by tests, not gate output.)

## 5. Follow-ups (item 6 sibling sweep; NOT fixed)

Swept `src/core/taste-checks-*.ts` (depth, gradient, concentric-radius, nesting, consistency, radius, typography, motion*, tap-target, video-scrub, gsap, taste-checks.ts). No sibling uses a document-global mode or first-match background proxy; the blind spot class is not repeated. Items:

- F1: split `taste-checks-invisible-surface.ts` (578 lines) into resolver/markup/selector modules, e.g. `taste-checks-surface-backdrop.ts`.
- F2: `taste-checks.ts` `checkPureBlackShadow` (L255-280) judges `rgba(0,0,0,a>=0.5)` without regard to the surface; the rubric wording is about hue-tinting so this may be intended, but it is the only other colour-vs-backdrop-blind check.
- F3: `taste-checks-gradient.ts` L37 `LARGE_SURFACE` is a name/class heuristic; no backdrop reasoning (unrelated to #350, noting only).
- F4: `isPureWhite` never matches `#ffffff` with 8-digit alpha forms (hex8 white); pre-existing.
- F5: the old checker's swallow quirk for adjacent inline styles (one declaration hid the next) is gone in the rewrite. `taste-checks-consistency.ts` L54-56 also scans inline `background:` with a single regex; NOT inspected for the same quirk (unverified), worth a look.
- F6: gradient/`var()` consumers are not followed (bails); a later pass could resolve single-stop gradients.
- F7: sibling media layers (`<video>`, positioned images) behind a pill are invisible to the resolver.
- F8: `taste-checks-shared.ts` doc comment still names this checker as a consumer of `selectorSubjectIsRoot`; stale, and the root-selector test header refers to the old mechanism.
- F9: post-merge docs per ease-design `CLAUDE.md`: classify USER-VISIBLE (flags change); add a `CHANGELOG.md` entry and a README recent-wave row (`CHANGELOG.md`/README are outside the file-ownership list, so not edited here).

## 6. Unresolved questions

1. Keep design B (token-level bail; recall rises on mixed pages: 19 corpus files gain findings) or revert to the old global bail "A" plus compositing for the remaining tokens?
2. Are MIN_STEP 0.03 and the same-polarity rule the owner's threshold, or only my chosen constants (the issue gives no number)?
3. Severity of newly surfaced findings on swatch/shadow-style demos: stay `error`?
