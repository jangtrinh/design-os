# facet-model — the composition brain (how any design job decomposes)

Read this FIRST when a designer asks to design something NEW from mixed inputs. A design is a **composition of
FACETS**, each **bound to a SOURCE**. The designer never picks a verb or mode — they describe intent and drop
whatever inputs they have (a Figma link, an image, a URL, a user-story doc, a token set, copy, data); the model
**auto-tags each input's facet role**, fills the **binding matrix**, asks only for the facets that are underbound
*and* decision-critical, **shows the matrix to confirm**, composes, and offers **single-facet regenerate**. This
transparency (input→facet→output, per-facet re-adjust) is the whole differentiator — validated independently by
NN/G *Promptframes* and HCI multimodal-scaffold research; shipping tools (v0, Figma First Draft, Galileo/Stitch,
Relume, Subframe) lack it. `workflow-experience.md` routes the intent + owns the lifecycle; THIS file is the
decomposition; `component-design.md` is the component-scope depth; `taste-rubric.md` + `curator.md` evaluate.

## The 7 FACETS — the things composed INTO a design
| Facet | What it is | Typical source |
|---|---|---|
| **INTENT / GOAL** | why · for whom · **+ success metric** (the measurable outcome the design must move) | brief / ask |
| **REQUIREMENTS** | user story / spec · **acceptance criteria** · features covered (the PM driver) | user-story doc · ask |
| **IA / FLOW** | sitemap · navigation · cross-screen sequence *(distinct from in-screen layout — bind FIRST for flow/feature jobs)* | requirements · sitemap · ask |
| **LAYOUT** | in-screen composition · hierarchy · density | DS patterns · wireframe · judgment |
| **STYLE** | visual language: tokens · components · motion-identity | project DS (C0/C7) · a Figma link · a reference image/URL · persona |
| **CONTENT** | copy · media · data-viz — **typed**, each with its own constraints (copy: word limits + tone; image: subject/style/dims; data-viz: chart/data/axes/palette) | an image · a copy doc · DATA/schema · placeholder-gen |
| **BEHAVIOR** | interactions · motion · flows | requirements · captured (from-url) · DS · judgment |

## The 5 CROSS-CUTTING LAYERS — parameterize/gate ALL facets (NOT composable facets)
- **AUDIENCE** — who it's for; reshapes tone/depth/vocabulary of every facet (a global parameter, ≠ persona-as-source).
- **TONE / VOICE** — spans STYLE (visual) + CONTENT (verbal); a shared attribute both reference.
- **CONSTRAINTS** — platform · breakpoints · tech · brand rules; filters what every facet may do.
- **ACCESSIBILITY** — WCAG contrast / ARIA / focus order / keyboard; a **deterministic gate** (the `ui` binary + curator check it, not vibes).
- **STATES & EDGE-CASES** — default/hover/focus/active/disabled/loading/error/empty + long-text/overflow/truncation/RTL/missing-media/null-data; a checklist applied across LAYOUT + CONTENT + BEHAVIOR (see `component-design.md`).

## SOURCES + precedence — where each facet binds
A facet binds to the highest-priority available source:
**explicit user instruction > a provided input tagged to that facet > the project design system (C0 registry +
C7 CONVENTIONS.md) > persona/knowledge floor (persona-index · benchmarks · ux-psychology · mode-constraints) >
DATA/schema (binds CONTENT; becomes a facet when the deliverable *is* a data-viz) > AI judgment.**
Role wins per facet: a Figma-link tagged STYLE binds STYLE; an image tagged CONTENT binds CONTENT; a user-story
binds REQUIREMENTS. When one input could serve two facets, the tag (or one cheap question) decides.

## Extract each facet CHEAPLY (cost contract, `workflow-experience.md` Part B)
- **Figma link → STYLE/IA/LAYOUT:** exec-js **distill** the frame (or C0 onboard if it's a DS) — never MCP-dump a section (`figma-agent-hand.md` §"Reading a whole section", ~85× cheaper).
- **Image → CONTENT (or STYLE-reference):** ONE vision `Read` → a compact spec (what it *says* if content-source; palette/type/mood if style-reference). Cache; never re-read.
- **URL → STYLE/STRUCTURE/CONTENT:** the `/ui:from-url` / `figma-agent capture` pipeline (headed, distilled).
- **project DS → STYLE/registry:** `ui registry` + `tokens.json` + `CONVENTIONS.md` (already onboarded, C0/C7).
- Isolate heavy extraction in subagents (return DNA, not raw dumps).

## The binding matrix (show it, then build)
Before building, state the bindings plainly so the designer can correct one line:
```
STYLE      ← your Figma link (distilled)          CONTENT   ← the image (copy extracted)
IA/FLOW    ← following the Figma link             BEHAVIOR  ← DS defaults
LAYOUT     ← DS patterns + the Figma structure    STATES    ← full checklist (component-design.md)
INTENT     ← "increase signups" (you)             AUDIENCE  ← indie makers (you) · TONE ← warm/confident
REQUIREMENTS ← (none given — designing to best practice)   ACCESSIBILITY ← WCAG gate (enforced)
```
Then compose (real DS instances Recipe 18 + conventions C7 + persona/mode/ux-psychology), SEE (the curator:
`curator.md` — taste + goal), iterate the failing facet/criterion, land. **Every design job — clone, design-from-DS,
style⊕content, blend-references, extend-component, flow/feature, data-viz — is just a different filling of this
matrix**, so the model covers cases not yet imagined.
