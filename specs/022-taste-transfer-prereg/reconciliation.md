# Reconciliation — cross-model review chain for the MengTo/Skills → DESIGN:OS taste-transfer strategy

This file identifies and hashes the five documents the frozen protocol (`PREREGISTRATION.md`
§"Cross-model reconciliation") requires: the full Opus report, Fable's initial review, Codex's
cross-check, Fable's final review, and the corrected consolidated strategy. It preserves — never
averages — the disagreement between critics.

## The five documents

| Role | Repo copy path | SHA-256 |
|---|---|---|
| Opus full report (Stage 0, prior session) | `reconciliation/mengto-skills-opus5-report.md` | `91bc36ec0c60a7b61963155d4218c51942e80fa7d7b09bb5fa18afb9b51e9de5` |
| Fable initial review (Stage 1) | `reconciliation/mengto-fable-initial.md` | `f1dd60883fc0780972f8ecc93ce71abd0dc29f2336851ac87c07fbba4575d3c2` |
| Codex cross-check (Stage 5) | `reconciliation/mengto-codex-crosscheck.md` | `74e473d072d9e519978240216a52bad9efc02544cfab8831afb969e790fd9557` |
| Fable final review (Stage 6) | `reconciliation/mengto-fable-final.md` | `7fc3c9b88f3d38371ae97cf615b6dc686339ebc6015f7cdb8c8afef0bf52fd66` |
| Corrected consolidated strategy | `reconciliation/mengto-crossmodel-strategy.md` | `e7332db9786b8ccd324426736e485182fe17b59ef3a428a807d94729d2806412` |

(`mengto-opus-draft.md`, the intermediate Stage-2 draft that Codex blocked, appears in the
strategy's own provenance table but is **not** one of the protocol's five reconciliation
documents; it is excluded per protocol, not by oversight.)

## The Codex verdict — verbatim, and its scope

```
VERDICT: BLOCKER
```

This verdict was issued against the **intermediate Opus Stage-2 draft** (`mengto-opus-draft.md`),
**not** against the final corrected strategy. Codex's run details, from
`reconciliation/mengto-codex-crosscheck.md`:

> **Run:** `CMUX_CODEX_HOOKS_DISABLED=1 codex exec --sandbox read-only --skip-git-repo-check`
> **Model:** gpt-5.6-sol · **codex-cli** 0.144.6 · exit 0 · 119,824 tokens
> **Session:** 019f9a30-0eda-7f53-ac6a-98105c8e36ab · **Date:** 2026-07-25
> **Inputs given:** prior Opus report, Fable Stage-1, Opus Stage-2 draft, MengTo clone @21b278c, ease-design.

Two BLOCKER findings anchored the verdict:

1. **BLOCKER** — the pilot arithmetic was internally impossible as drafted: 4 tranches × 6 pairs
   requires 24 pairs / 48 renders, not the draft's claimed "12 renders"; a tranche bundling
   3–4 candidates also broke the draft's own "exactly one variable" claim, confounding any result.
2. **BLOCKER** — the draft's media architecture violated constitution Article I: it placed
   network-facing `search()`/`resolve()` provider code for Unsplash/ImageGen/stock under
   `src/adapters/`, inside the zero-network published kernel, despite §A of the same draft
   claiming all invariants held.

Both BLOCKERs were accepted as correctly called (see the Fable final review below) and fully
reconciled into the corrected strategy — the redesigned two-phase pilot (Phase A family
screening → Phase B candidate confirmation) and the provider-adapters-outside-`src/` architecture
that this preregistration builds on.

## The Fable verdict — verbatim, and its scope

```
VERDICT: APPROVE
```

This verdict is recorded at the top of `reconciliation/mengto-fable-final.md`, scoped explicitly
by Fable's own opening paragraph:

> **Scope of verdict:** the consolidated strategy (Opus Stage-2 draft as corrected by the Codex
> Stage-5 review and Opus's reconciliation) MAY go to the owner **only with the MUST-MODIFY items
> below applied**. This is an APPROVE of the direction and the corrected body of work, not of the
> Stage-2 draft as written — that draft, standing alone, was correctly BLOCKED.

The APPROVE is therefore conditional — bound to the corrected strategy as amended by Fable's own
enumerated M1–M8 must-modify items, not an unconditional approval of any single prior draft.

## Disputed measurements and re-runs — copied as-is from strategy §2.2 and §2.3

### §2.2 — Overturned: prior report was wrong

| # | Prior claim | Corrected |
|---|---|---|
| O1 | "79 flat style cards … **no anti-pattern lists per style**" | **61/79 (77%)** carry an explicit negative-constraint section. Unique-file counts: `Avoid` 37 · `Common pitfalls` 12 · `Taste Rules` 8 · `Guardrails` 6 · `Anti-patterns` 0 (overlapping sets; union = 61) [F] |
| O2 | "thinner, sometimes 20 lines" | 20 is the **min**. n=79, **median 72**, **p75 153**, max 617 (nearest-rank). And 20 lines is the *correct* size for a micro-device card under our own `authoring-standard.md` |
| O3 | Style cards are unstructured content | They share a repeated authoring schema: `Use When` 43 · `Workflow` 38 · `Avoid` 37 · `Tuning knobs` 30 · `Visual target` 28 · `Recommended patterns` 21 [F] |
| O4 | "style cards stack freely" | `build-awwwards-quality-sites:15` forbids "combining unrelated aesthetic systems"; `skeuomorphic-ui:121` forbids mixing glass/neu/skeuo [F] |
| O5 | Bucket A = "~60 style cards … exactly what personas own" | Four distinct kinds: **~30 micro-device cards** (device-grade — they *feed* our 9-device menu, they don't compete), ~20–25 aesthetic-system cards, **~7 page-genre playbooks**, ~8 library recipes [F] |
| O6 | Motion bands "duplicative **and** conflicting" | Bands substantially **overlap**; "section entrance 400–800" *equals* our hero band; "hero sequence 800–1600" measures a multi-beat sequence (different unit). Only stagger genuinely diverges (40–90 vs 20–60) |
| O7 | "All 17 game-development skills" | **19** (its own §2.2 table says 19) [F] |
| O8 | R4 media = "couples a deterministic binary to third-party accounts" | **Category error.** These are host-side knowledge; `generation-craft-defaults.md` already sanctions host-side external hands (Codex ImageGen 2, SVGL, Phosphor). Nothing touches the binary |
| O9 | Corpus has no generation-side originality thinking | `generate-reference-inspired-brand-worlds` was **never analyzed** and is absent from the prior report's read list [F] |

### §2.3 — Overturned: this review's own errors (self-correction)

Recorded because a strategy document that hides its own error rate cannot be trusted on its
remaining numbers.

| # | My (Opus) claim | Reality | Cause |
|---|---|---|---|
| S1 | "0 aspect-ratio hits across the entire `knowledge/` tree" | **4 hits**, all incidental (contrast ratio `1:1`, Figma node id `'123:45'`, a CSS `gap` 1:1 mapping) | **False zero.** The grep ran with the shell inside the MengTo clone — which has no `knowledge/` dir — and `2>/dev/null` swallowed the error. Reproduced and root-caused. This is the house's own recorded silent-no-op / false-zero failure class, committed by the reviewer who cites it |
| S2 | "55/79 negative-constraint cards" | **61/79** | My union regex omitted `Taste Rules` while my own parenthetical listed it; `Common pitfalls` ×10 counted heading *lines*, unique *files* = 12 |
| S3 | median 71 / p75 145 / cluster 24 | **72 / 153 / 23** | `int(NR/2)` and `int(NR*0.75)` off-by-one vs nearest-rank |
| S4 | `gsap-motion-direction.md` "has 2 numeric lines" | **15 lines contain digits**; `:71-83` carries `duration: 0.7`, `y: 28`, `scale: 0.96`, `"establish+=0.12"`, `min-width: 768px`, `ease: "power3.out"` | Over-narrow regex. **Also corrects Fable's R2**, which asserted "no concrete values at all — grep-verified" |
| S5 | Pilot: "12 renders, 1–2 days" | 4 tranches × 6 pairs = **48 renders**; honest ceiling **~68 renders / 3–5 days** | Conflated candidate count with render count |
| S6 | Media adapters under `src/adapters/` | **Art I violation** — network-facing provider code inside the zero-network published kernel | Asserted in §A that all invariants held while breaching one |
| S7 | "Cut the SSRF guards; CSP wrapper only if a preview path exists" | Guards stay; **the preview path already exists** | Confused *who triggers the fetch* with *where the fetch can reach* |

## Final dispositions

- Both Codex BLOCKERs (pilot arithmetic; Art I media-adapter placement) were accepted as
  correctly called by Fable's Stage-6 review, not disputed by Opus, and reconciled into the
  corrected strategy that this preregistration executes: a two-phase (family screening → candidate
  confirmation) pilot with `s×3×2` Phase-B arithmetic and provider adapters kept outside `src/`
  and outside the published kernel.
- The self-corrected measurement set (S1–S7) supersedes every earlier figure quoted anywhere in
  this spec dir or in prior drafts; where a number in this spec dir conflicts with the corrected
  values above, the corrected values win.
- The corrected strategy's own overturned-claims table (O1–O9) supersedes the original Opus
  Stage-0 report's negative characterizations of the corpus; the Stage-0 report's *confirmed*
  findings (§2.1 of the strategy) still stand and are not relitigated here.
- Fable's Stage-6 `VERDICT: APPROVE` is conditional on its own enumerated M1–M8 must-modify items,
  which are incorporated into `PREREGISTRATION.md` and this build (e.g., M1 = the preregistered
  pilot itself; M7 = the `external-candidate` evidence-packet/librarian-door requirement recorded
  in `spec.md` §M).

Disagreement between critics is preserved as recorded; no consensus is inferred where none
existed.

## No legal assurance

This artifact set records licence disposition and provenance. It certifies nothing legally: no
assertion of non-infringement, originality, or licence sufficiency is made or implied, and no
model's legal reasoning is counsel. Any Neuform-adjacent abstraction approaching canon requires a
human legal read first.

## Root licence and the two boundaries

The pinned corpus root (`/private/tmp/mengto-skills` @ `21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49`)
carries a root `LICENSE` file that is verbatim MIT, "Copyright (c) 2026 Meng To".

- **Neuform demo material is observe-only.** The 38 Neuform-derived demo HTML files (and any
  content referencing them) carry no copying, vendoring, redistribution, or treatment/training
  fixtures — this is a quarantine from reuse, not a prohibition on looking. `source.json` files
  name neuform.ai and third-party page URLs with no per-demo licence grant, so the root MIT notice
  cannot be assumed to cover third-party HTML, images, fonts, brands, or page copy carried inside
  those demos.
- **The personal tweet corpus is rejected from study entirely.**
  `agent-skills/codex/write-like-meng-on-x/references/tweet-corpus.jsonl` is one named
  individual's authored voice — an identity and provenance boundary, not merely a licence
  question. It is excluded from `selection-manifest.json` classification work beyond a single
  `reject-identity` / `rejected-from-study` record.
