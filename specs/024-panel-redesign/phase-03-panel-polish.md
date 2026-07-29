# Phase 03 — polish to benchmark grade (Linear / Raycast / Vercel dark surfaces)

Base: the **current working tree** — phase 01 (skin) + phase 02 (IA v2) + the judge fixes + Sonnet's
left-bar removal, all landed (verified: `panel.html` is 760 lines, no `inset 2px 0 0` rule survives;
the gate is 331 lines). Anchors below were read in that tree.
Estimated 5h incl. preview + judge re-pass. Gate: repo-root
`npx vitest run tests/figma-plugin-panel.test.ts` **and** `cd figma-agent && npm run typecheck &&
npm run build && npm test`.

**Baseline to beat, measured before this phase starts** (record both again after — a count that
*drops* means an assertion was deleted rather than satisfied): repo-root panel gate **31/31**,
workspace suite **522/522**, and `--fga-accent` has **exactly one** remaining use
(`.inline-link:focus-visible`, `panel.html:640`) — §6 retires it, so that count goes to zero and
Gate C enforces it.

**Hard constraints carried forward, unchanged:** one font family, exactly three sizes, zero text
glyphs, **no left accent bars in any variant (owner VETO — do not reintroduce `inset Npx 0 0`,
`border-left`, or a pseudo-element bar)**, fluid 240→640px+, contrast floors (text 4.5:1,
indicators 3:1), single `--font-family-body`.

**Two shared-linter facts that shape this phase** (checked in `src/core/`, not assumed):
- `checkOffGridSpacing` (`taste-checks.ts:160-178`) only matches **Tailwind utility classes**
  (`p-[13px]`), never CSS declarations — so the repo linter cannot see our spacing. The 4px-grid rule
  in §1 must therefore ship **its own** assertion in the panel gate, or it is unenforced.
- `checkLinearOrAllTransition` (`taste-checks-motion.ts:19-42`) matches `transition…: … linear` only
  — **`animation: … linear` is not flagged**, which is why the existing spinner
  (`panel.html:587`) passes and may keep its linear rotation (§4).

---

## §1 — Spatial rhythm: one 4px scale, one icon grid

**Audit of the current chrome** (every off-scale value, with its correction):

| Anchor | Current | Becomes | Why |
|---|---|---|---|
| `.detail-cell` (`padding: 6px 8px`) | `6px` | `var(--space-1)` = 8px vertical, 8px horizontal → `padding: 8px` | 6 is off-grid |
| `.activity-row` (`padding: 6px 8px`) | `6px` | `padding: 8px` | same |
| `.sync-btn` (`padding: 4px var(--space-1)`) | 4/8 | keep — 4 and 8 are on-grid | — |
| `code` chip (`padding: 1px var(--space-1)`) | `1px` | `padding: 2px var(--space-1)` | 1px is a hairline nudge; 2 keeps the chip optically centred on a 4-grid line box |
| `.section-label` (`margin: 0 0 4px`) | 4px | keep | on-grid |
| `.log-icon-wrap` (`margin-top: 3px`) | `3px` | **delete** — replaced by the optical-centering rule below | 3 is an eyeball nudge |
| `.status-meta` (`margin-top: 6px`) | — | **n/a — the selector no longer exists** (phase 02 folded the meta line into the status sentence); if it is still in the file, delete the rule with it | — |
| `.identity-row` (`gap: 3px`) | `3px` | `gap: var(--space-hair)` (4px) | off-grid |
| **`.inline-link` (`gap: 3px`, `panel.html:628`)** | `3px` | `gap: var(--space-hair)` | off-grid — **missed in the first audit pass; Gate A fails without it** |
| `--fga-divider-gap: 12px` | 12 | keep | on-grid |

Re-grep before declaring the audit complete — `grep -nE "(padding|margin|gap)[^;:]*:\s*[^;]*[0-9]+px" panel.html` — and add any survivor to this table rather than to a whitelist.

The scale itself already exists in the compiled DS block (`--space-1: 8px` … `--space-6: 48px`,
`panel.html:163-174`) plus the panel-only `--space-hair: 4px`. **No new spacing token.** Every
padding/gap/margin in the chrome must resolve to one of `0`, `var(--space-hair)` (4), `var(--space-1)`
(8), `var(--space-2)` (16), `var(--space-3)` (24), or `var(--fga-divider-gap)` (12).

**Optical alignment of icon + text rows.** `.fga-icon` / `.fga-row` **do not exist in the tree** —
the current selectors are `.status-dot`, `.log-icon-wrap`/`.log-icon`, `.identity-dot`,
`.status-row`, `.activity-row`. Writing new class rules alone produces dead CSS, so **add the class
in the markup** and let one rule govern all of them:

- Markup: add `class="fga-icon"` to the activity SVG wrapper (`.log-icon-wrap`) and to any other
  inline SVG that survives; add `class="fga-row"` to `.status-row` and `.activity-row`.
- **Two size families, not one.** SVG icons ride the 14px grid; the two CSS-drawn dots
  (`.status-dot` 8px, `.identity-dot` 6px) are dots, not icons — unify them at **8px** so there is
  one dot size and one icon size, and no third.

```css
.fga-icon { width: 14px; height: 14px; flex: 0 0 auto; }
.status-dot, .identity-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }

/* Optical centring on the FIRST line box rather than the flex box: a 14px icon beside a
   13px/1.5 line sits high if you centre on the box. Derived, not eyeballed — line box is
   13 × 1.5 = 19.5px, so (19.5 − 14)/2 = 2.75px — and it stays correct if the size token moves. */
.fga-row { display: flex; align-items: flex-start; gap: var(--space-1); }
.fga-row > .fga-icon { margin-top: calc((1.5em - 14px) / 2); }
```
This replaces the hand-tuned `.log-icon-wrap { margin-top: 3px }`.

**Paired gate assertion** (the repo linter cannot see CSS spacing — §Gate A).

---

## §2 — Surface depth: light logic, not outlines

Replace flat grey hairlines with **low-alpha white** so tiers read as light falling on surfaces. The
pixel-sampled base colours stay exactly as they are; alpha layers on top of them.

```css
:root {
  /* Depth layer — alphas, not new greys. Sampled bases stay authoritative. */
  --fga-hairline: rgba(255, 255, 255, 0.08);   /* raised-card border */
  --fga-hairline-soft: rgba(255, 255, 255, 0.06); /* nested/secondary edges */
  --fga-topedge: rgba(255, 255, 255, 0.03);    /* 1px inner highlight on the top edge */
}
```

### The inset-shadow collision — RESOLVED as option (b), non-inset technique

`tests/figma-plugin-panel.test.ts:267-273` bans **every** `box-shadow: inset` in the chrome; it
encodes the owner's veto of the left-bar treatment. The lead offered two exits:

- **(a) narrow the ban** to horizontal-offset insets (`inset Npx 0 …`) so a top-edge
  `inset 0 1px …` is legal;
- **(b) get the highlight without an inset.**

**Chosen: (b).** Reasons, in order: the gate is a *taste ruling*, and loosening a taste ruling so a
decorative effect can fit inverts the relationship — the effect should bend, not the veto. A narrowed
regex also leaves a live hole: `inset 0 1px` and `inset 0 -1px` differ by one character, and the
second is a bottom bar, which is the same treatment the owner rejected, flipped. And the non-inset
spelling is not a workaround but the standard one — a lighter top border is exactly how a raised dark
surface is drawn in the benchmark set.

**Paired gate change: none to the veto** (`:267-273` stays byte-identical, blanket ban intact).
Instead the new Gate D *requires* the replacement to exist, so the highlight cannot silently vanish
in a later pass: `expect(chrome).toMatch(/border-top-color:\s*var\(--fga-topedge\)/)`.

Express the highlight as a **border-top colour** — same optical read, no inset anywhere:

| Rule | Current | Becomes |
|---|---|---|
| `.detail-cell` | `border: 1px solid var(--fga-border-control)` | `border: 1px solid var(--fga-hairline); border-top-color: var(--fga-topedge);` |
| `.sync-prompt` | **`border-top: 1px dotted var(--fga-divider)` only** (`panel.html:411`) — it has no solid border | `border: 1px solid var(--fga-hairline); border-top: 1px dotted var(--fga-divider);` — shorthand FIRST, then the dotted rule restored, or the shorthand erases the divider |
| `.activity-row` | flat | `border: 1px solid transparent;` at rest → hover fills it with `--fga-hairline-soft` (§6) |
| `.onboarding` | `1px solid var(--fga-border)` | `border: 1px solid var(--fga-hairline); border-top-color: var(--fga-topedge);` |
| dotted section rules | `1px dotted var(--fga-divider)` | **unchanged** — the reference's signature stays. Any rule that gains a `border` shorthand must re-declare its dotted edge on the next line |

Constraints:
- **No `box-shadow: inset` at all** — not for the top edge, not anywhere (existing gate, owner veto,
  unchanged by this phase). A bottom-edge variant (`inset 0 -1px`) is equally out: it is the vetoed
  treatment rotated.
- **Alpha goes on borders, never on `background`.** Note the honest limit: taste-lint's
  `mode-invisible-surface` does **not** resolve custom properties
  (`src/core/taste-checks-invisible-surface.ts`), so `background: var(--fga-hairline)` would slip
  past it — **our** Gate D is the only enforcement, and it therefore checks alpha tokens by name as
  well as literal `rgba(` (§Gate D).
- **Contrast unaffected**: borders are decorative delineation. Re-run the contrast one-liner after §5
  regardless.

---

## §3 — Type micro-craft

Per-size tracking and line-height, declared once beside the size tokens:

```css
:root {
  --fga-font-title: 14px;    --fga-track-title: -0.01em;   --fga-lh-title: 1.35;
  --fga-font-body: 13px;     --fga-track-body: 0;          --fga-lh-body: 1.5;
  --fga-font-caption: 11px;  --fga-track-caption: 0.015em; --fga-lh-caption: 1.45;
}
```
- Status sentence (title): `font-size: var(--fga-font-title); letter-spacing: var(--fga-track-title);
  line-height: var(--fga-lh-title);` — tight, because it is one short line.
- Sentences that wrap (activity rows, onboarding, hint copy): `line-height: 1.5` (`--fga-lh-body`),
  inside the 1.45–1.55 band.
- Captions (labels above values, timestamps, build id): `+0.015em` — small text needs the air.
- **`font-variant-numeric: tabular-nums` ONLY where numbers align in a column.** Audited in the tree:
  `.detail-grid dd` (`panel.html:511-515`) carries it, but those values are File / Page / Selection —
  **prose, not a numeric column** → remove it there. `.log-meta` (the column of relative ages) keeps
  it. `.status-meta` no longer exists (phase 02).
- `-webkit-font-smoothing: antialiased` is **already on `body`** (`panel.html:312`) — verify, do not
  duplicate.

---

## §4 — Motion

```css
:root { --fga-motion: 140ms; --fga-ease: cubic-bezier(0.2, 0, 0, 1); }  /* ease-out */
```
| What | Declaration |
|---|---|
| activity row appear | `@keyframes fga-row-in { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }` + `.activity-row { animation: fga-row-in var(--fga-motion) var(--fga-ease); }` |
| sync prompt show/hide | `transition: opacity var(--fga-motion) var(--fga-ease);` (never `height` — layout props are a taste-lint error) |
| status tone change | `.status-dot, .status-sentence { transition: color var(--fga-motion) var(--fga-ease), background-color var(--fga-motion) var(--fga-ease); }` |
| row hover | `transition: background-color var(--fga-motion) var(--fga-ease), border-color var(--fga-motion) var(--fga-ease);` |
| spinner | keep `animation: fga-spin 1s linear infinite` — a continuous rotation is the one place linear is correct, and `checkLinearOrAllTransition` only inspects `transition:` (verified above), so it stays green |

**Never `transition: all`** (taste-lint error) — name every property. **Every new animation and
transition goes inside the existing guard** (`panel.html:687-692`), extending it:
```css
@media (prefers-reduced-motion: reduce) {
  .status-dot.is-pulsing::after, .log-icon-wrap[data-state="running"] .log-icon,
  .activity-row { animation: none; }
  .inline-link, .sync-prompt, .status-dot, .status-sentence, .activity-row { transition: none; }
}
```

---

## §5 — Colour tuning

### Temperature — MEASURED, and it contradicts the brief
The lead's vector says "pick cool, ~2-3% blue shift like the reference's `#17171A` family … re-sample
the reference and **follow IT**". Re-sampled (box-averaged over six flat regions of
`references/Reference.png`):

| Region | Mean | R−B | G−B |
|---|---|---|---|
| content pane | `#171717` | 0.00 | 0.00 |
| sidebar | `#262626` | 0.00 | 0.00 |
| active row | `#3C3C3C` | 0.00 | −0.00 |
| lower content / lower sidebar / input interior | `#171717` / `#262626` / `#323232` | 0.00 | ≈0 |

**The reference is perfectly neutral — zero blue shift.** `#17171A` was the pre-sampling estimate in
brief §5, not the file. Following the instruction's own tie-breaker ("follow IT"), the neutral greys
**stay**, and no blue shift is introduced. Flagged in §Conflicts so the owner can overrule with a
deliberate "cooler than the reference" call if that is what was actually wanted.

### Status hues — desaturated to sit in a dark field
Current values are bright-web colours. Pull saturation down and lightness slightly, keeping every
pair above its floor (recomputed on `--fga-body #171717`, `--fga-surface #262626`, `--fga-row-active
#333333`):

| Token | Current | Tuned | Rationale |
|---|---|---|---|
| `--fga-tone-success` | `#52AC6D` | `#5BA46F` | the reference's own green, ~8% less saturated |
| `--fga-tone-warning` | `#E3B341` | `#C9A356` | web-amber → ochre; stops shouting next to the greys |
| `--fga-tone-info` | `#79C0FF` | `#8FB4D9` | desaturated steel, not "link blue" |
| `--fga-tone-danger` | `#F2777A` | `#D98A8A` | muted terracotta |
| `--fga-tone-muted` | `#9A9A9A` | `#9B9B9B` | already neutral; align with `--fga-text-muted` |

**Recompute before shipping** (the same one-liner phase 01 used, all three backgrounds):
```bash
node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const R=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return((x+.05)/(y+.05)).toFixed(2)};for(const bg of ["#171717","#262626","#333333"])for(const t of ["#5BA46F","#C9A356","#8FB4D9","#D98A8A","#9B9B9B"])console.log(bg,t,R(t,bg));'
```
Any pair under **4.5** where the token renders text, or under **3.0** where it is only an indicator,
gets lightened one step at a time until it clears — and the departure is recorded in the token
comment, exactly as phase 01 did. Contrast outranks the aesthetic (`DECISIONS.md`).

---

## §6 — Finish details

```css
/* Focus — the two interactive controls only (Sync now, Later). */
.sync-btn:focus-visible, .inline-link:focus-visible {
  outline: 2px solid var(--fga-focus);
  outline-offset: 2px;
}
:root { --fga-focus: #8FB4D9; }   /* the tuned info hue: visible on all three surfaces (≥3:1) */

/* Scrollbar — thin, quiet, thumb from the border family. */
.panel { scrollbar-width: thin; scrollbar-color: var(--fga-border-control) transparent; }
.panel::-webkit-scrollbar { width: 8px; }
.panel::-webkit-scrollbar-track { background: transparent; }
.panel::-webkit-scrollbar-thumb {
  background: var(--fga-border-control);
  border-radius: var(--fga-radius-sm);
}

/* Selection — the panel is read, not edited; keep it subtle.
   ::selection is the ONE exempt alpha background (a highlight over text, not a surface tint);
   Gate D exempts this selector by name. */
::selection { background: rgba(143, 180, 217, 0.28); color: var(--fga-text); }

/* Activity row hover. "Lift by lightening" was MEASURED and rejected: the newest row already sits
   on --fga-row-active #333333, where muted text is 4.55:1 — a hover step to #3A3A3A drops it to
   4.09 and to #3C3C3C to 3.97, i.e. under the AA floor, and lightening the newest row would also
   make it recede relative to itself. So hover moves the BORDER, and only stale rows (which sit on
   the body) also take the row-active fill — every text pair keeps its phase-01 contrast. */
.activity-row:hover { border-color: var(--fga-hairline-soft); }
.activity-row.is-stale:hover { background: var(--fga-row-active); }

/* Empty state — quiet typography, no box, no icon. */
.activity-empty {
  color: var(--fga-text-dim);
  font-size: var(--fga-font-caption);
  letter-spacing: var(--fga-track-caption);
  padding: var(--space-1) 0;
}
```
`--fga-accent` (`panel.html:268`) has exactly one surviving use — the old focus outline at
`panel.html:640`. Once `--fga-focus` lands, **delete the token and that reference together**: it was
the left bar's colour, and the veto makes it dead weight. Gate C fails on any survivor.

---

## §Gate — the paired assertions (same commit)

Extend `tests/figma-plugin-panel.test.ts`, reusing the existing `chrome` / `rules` / `declsFor`
helpers:

```ts
describe("figma-agent panel — craft floor (phase 03)", () => {
  // A. 4px rhythm — the shared taste linter only sees Tailwind utilities, so this is OUR check.
  // NOTE the calc branch: `calc\([^)]*\)` cannot match the NESTED parens in
  // `calc((1.5em - 14px) / 2)` — the optical-centring rule this very phase introduces would be
  // reported as off-grid. Match calc() permissively instead.
  it("lands every spacing value on the 4px grid", () => {
    const ALLOWED = /^(0|var\(--space-(hair|1|2|3)\)|var\(--fga-divider-gap\)|auto|calc\(.*\))$/;
    const offenders: string[] = [];
    for (const [sel, decls] of rules) {
      for (const m of decls.matchAll(/(?:^|;)\s*(padding|margin|gap|row-gap|column-gap|padding-block|padding-inline)\s*:\s*([^;]+)/g)) {
        for (const part of m[2].trim().split(/\s+(?![^(]*\))/)) {
          if (ALLOWED.test(part)) continue;
          const px = /^(\d+)px$/.exec(part);
          if (px && Number(px[1]) % 4 === 0) continue;      // a literal multiple of 4 is fine
          offenders.push(`${sel} { ${m[1]}: ${part} }`);
        }
      }
    }
    expect(offenders, `off-grid spacing: ${offenders.join(" | ")}`).toEqual([]);
  });

  // B. Two size families and no third: icons 14px, dots 8px — asserted on the RULES, and on the
  // markup carrying the class (a rule alone would be dead CSS).
  it("sizes every icon on the 14px grid and every dot at 8px", () => {
    const sizesOf = (sel: string) => [...declsFor(sel).matchAll(/(?:width|height):\s*([^;]+)/g)]
      .map((d) => d[1].trim());
    expect([...new Set(sizesOf(".fga-icon"))]).toEqual(["14px"]);
    expect([...new Set([...sizesOf(".status-dot"), ...sizesOf(".identity-dot")])]).toEqual(["8px"]);
    expect(html, "the icon class must actually be applied").toMatch(/class="[^"]*\bfga-icon\b/);
    expect(html, "the row class must actually be applied").toMatch(/class="[^"]*\bfga-row\b/);
  });

  // C. The vetoed left bar can never come back, in any spelling. (The blanket
  // `box-shadow: inset` ban already lives at tests/figma-plugin-panel.test.ts:267 — keep it; this
  // adds the other two spellings and retires the dead token.)
  it("has no left accent bar", () => {
    expect(chrome).not.toMatch(/border-left:\s*(?!0)/);
    expect(chrome).not.toContain("--fga-accent");
  });

  // D. Depth is alpha BORDERS, never an alpha background. taste-lint's mode-invisible-surface does
  // NOT resolve custom properties, so `background: var(--fga-hairline)` would slip past it — this
  // assertion is the only enforcement, and it therefore checks the token names too.
  it("uses low-alpha white only on borders, never on a surface", () => {
    const ALPHA_TOKENS = ["--fga-hairline", "--fga-hairline-soft", "--fga-topedge"];
    const bgAlpha = rules
      .filter(([sel]) => !sel.includes("::selection"))            // a text highlight, not a surface
      .filter(([, d]) => /background(?:-color)?:\s*(rgba\(|var\((--fga-(hairline|topedge))/.test(d)
        || ALPHA_TOKENS.some((t) => new RegExp(`background(?:-color)?:\\s*var\\(${t}\\)`).test(d)))
      .map(([s]) => s);
    expect(bgAlpha, `alpha background on: ${bgAlpha.join(" | ")}`).toEqual([]);
    expect(chrome).toMatch(/border:\s*1px\s+solid\s+var\(--fga-hairline\)/);
    expect(chrome).toMatch(/border-top-color:\s*var\(--fga-topedge\)/);
  });

  // E. Focus is visible on every interactive control.
  it("gives both interactive controls a focus-visible ring", () => {
    for (const sel of [".sync-btn:focus-visible", ".inline-link:focus-visible"]) {
      expect(declsFor(sel), `${sel} needs an outline`).toMatch(/outline:\s*2px/);
      expect(declsFor(sel)).toMatch(/outline-offset:/);
    }
  });

  // F. Motion: named properties only, and everything guarded.
  it("names its transitions and guards every one under reduced-motion", () => {
    expect(chrome).not.toMatch(/transition[^;]*:\s*(?:[^;]*\s)?all\b/);
    expect(chrome).not.toMatch(/transition[^;]*:[^;]*\blinear\b/);
    const guard = /@media\s*\(prefers-reduced-motion[^{]*\{([\s\S]*?)\}\s*\}/.exec(html)?.[1] ?? "";
    for (const sel of [".activity-row", ".sync-prompt", ".status-dot"]) {
      expect(guard, `${sel} must be inside the reduced-motion guard`).toContain(sel);
    }
  });

  // G. Type micro-craft is tokenized, not sprinkled — BOTH axes. Raw line-heights currently
  // survive at panel.html:309, :343, :398, :600; they must move to the tokens too, or "deliberate
  // line-heights" is a claim with nothing enforcing it.
  it("declares tracking + line-height per size and uses neither raw", () => {
    for (const t of ["--fga-track-title", "--fga-track-body", "--fga-track-caption",
                     "--fga-lh-title", "--fga-lh-body", "--fga-lh-caption"]) {
      expect(html, `missing ${t}`).toContain(t);
    }
    const rawTrack = [...chrome.matchAll(/letter-spacing:\s*([^;]+)/g)]
      .map((m) => m[1].trim()).filter((v) => !v.startsWith("var(--fga-track-"));
    expect(rawTrack, `raw letter-spacing: ${rawTrack.join(" | ")}`).toEqual([]);
    const rawLh = [...chrome.matchAll(/(?:^|;)\s*line-height:\s*([^;]+)/g)]
      .map((m) => m[1].trim()).filter((v) => !v.startsWith("var(--fga-lh-"));
    expect(rawLh, `raw line-height: ${rawLh.join(" | ")}`).toEqual([]);
  });
});
```

**Two edits to EXISTING gate blocks are required — without them this phase cannot go green:**

1. **Responsive `SIZE_WHITELIST`** (`tests/figma-plugin-panel.test.ts:282`) currently allows only
   `.status-dot`, `.log-icon-wrap`, `.identity-dot`. The new `.fga-icon { width: 14px }` and
   `.panel::-webkit-scrollbar { width: 8px }` are fixed widths and would be reported as offenders.
   Add `"\\.fga-icon"` and `"::-webkit-scrollbar"` to that list — both are decorative/scrollbar
   chrome, not layout.
2. Everything else in the earlier blocks (skin tokens, responsive, typography contract, IA
   structure, the `box-shadow: inset` veto) stays **untouched**.

---

## Validation

```bash
cd /Users/jang/orca/workspaces/ease-design/opah
npx vitest run tests/figma-plugin-panel.test.ts
cd figma-agent && npm run typecheck && npm run build && npm test
```
Order matters — run the gate **after §2** and again **after §5**, the two edits most likely to trip
`mode-invisible-surface` and the contrast floors.

Live plugin (rebuild, close + reopen once):
1. Hover an activity row → the border appears (and a stale row also takes the row-active fill),
   **no bar of any kind on any edge**, and the newest row does not change background.
2. Tab through: Sync now → Later — each shows a 2px offset ring; nothing else takes focus.
3. Trigger a state change (kill the broker) → the dot/sentence colour crossfades, no jump.
4. Overflow the feed → thin scrollbar, thumb visible against the body, no layout shift.
5. Select text in a sentence → the tuned selection colour, text stays legible.
6. macOS System Settings → Reduce motion ON → nothing animates; the spinner is a static ring.
7. Re-run the phase-01 width matrix (240/280/320/480/640) — polish must not reintroduce overflow.
8. Preview regenerated (same gallery: 6 states × 3 widths).

## Judge re-pass — benchmark grade, against captures that exist

The benchmarks are **captured, not remembered** (lead, 2026-07-29, via `design-os reference add`):

| Target | Grade | Role |
|---|---|---|
| `references/Reference.png` | SOURCE | **primary** — the layout signature |
| `references/linear.app.png.tiles/` (7 tiles) | SOURCE | craft language: type rhythm, hairline borders, dark-surface treatment |
| `references/vercel.com.png.tiles/` (4 tiles) | SOURCE | craft language, same three axes |

Fresh judge — screenshots + `knowledge/taste-rubric.md` + those three sets, **never the build
transcript**:
- score the 5 excellence dimensions, **ship bar ≥90**;
- blind read: does this pass as senior+ work with no context?
- duel with **a citation per claim** — a dimension may not be failed (or passed) from memory;
- **grade the medium mismatch**: Linear and Vercel are marketing pages, not tool panels. Border
  weight, neutral temperature, type rhythm and spacing discipline transfer to a 240–640px panel;
  display type, page-scale whitespace and hero treatments do not, and their absence is not a loss.
- a clear loss on ≥2 transferable dimensions fails the pass, and each loss becomes a correction here
  rather than a note.

## Risk & rollback

| Risk | L×I | Mitigation | Detect |
|---|---|---|---|
| Alpha borders read as muddy on the `#333333` active row (alpha over a lighter base is weaker) | M×M | `--fga-hairline` at 0.08 was chosen against the lightest surface; if it disappears, raise to 0.10 for that rule only — never switch to a solid grey | live check step 1 |
| A low-alpha value lands on a `background` | M×M | **taste-lint will NOT catch it** (it does not resolve custom properties) — Gate D is the only enforcement, and it now matches token names as well as literal `rgba(` | gate after §2 |
| A `border` shorthand silently erases a dotted divider on the same element | M×H | §2 spells the shorthand-then-restore order for `.sync-prompt`; re-grep `border-top: 1px dotted` after the depth edit and confirm the count is unchanged | visual: a missing section rule |
| Desaturated hues drop under the contrast floor | M×H | recompute all 15 pairs (§5) before shipping; lighten stepwise and record the delta | contrast one-liner |
| The 14px icon grid clips a Phosphor glyph whose art needs more room | L×M | `viewBox` scales; if a glyph reads thin at 14px, adjust stroke weight in the path set, not the grid | live check |
| New transitions escape the reduced-motion guard | M×M | gate F asserts the three selectors are inside the guard | gate |
| Deleting `--fga-accent` breaks a rule that still references it | L×M | gate C fails on any surviving reference | gate |

Rollback: `git revert <sha> && npm run build`, reload. Phases 01/02 are separate commits and stay.

## Conflicts flagged (not resolved here)

1. **Colour temperature.** The vector asks for a ~2–3% blue shift "like the reference's `#17171A`
   family"; the file measures **perfectly neutral** (R−B = 0.00 across six regions). Following the
   instruction's own tie-breaker ("re-sample and follow IT"), this phase keeps the neutrals. If the
   owner wants the panel *cooler than* its reference, that is a deliberate departure and needs a
   ruling — it is a one-line token change either way.
2. **`--fga-border-control` / `--fga-border-strong` after §2.** Depth moves card edges to alpha
   hairlines, leaving those two tokens on the scrollbar thumb and the button outline only. Keeping
   both is fine; collapsing them into one is a taste call I have not taken.
3. **Benchmark artifacts.** The judge is asked to duel Linear/Raycast/Vercel, but this repo has no
   cached captures of them (`brand/`, `references/` hold ours and the settings modal). The judge will
   be duelling from memory unless someone drops captures — which is exactly the "reference must
   capture the signature" trap. Recommend capturing 2–3 benchmark screenshots before the pass.
