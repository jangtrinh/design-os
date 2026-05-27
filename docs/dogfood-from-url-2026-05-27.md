# Dogfood Pass — `/ui:from-url` — 2026-05-27

End-to-end exercise of the new `/ui:from-url` workflow against three URL
classes (SSR marketing, static documentation, JS-rendered SPA). All three
cases emit a `DESIGN.md` that passes the closure self-check (8 sections in
order, no duplicate headings, all `{ref}` resolve, all hex `"#RRGGBB"`).

Artifacts are checked into `plans/260527-from-url-designmd/artifacts/` for
reproducibility.

## Intent

Validate that the workflow lands cleanly end-to-end after Phases 1 + 2:
the binary registers `/ui:from-url` for every runtime, the workflow
markdown reads sensibly to the host model, the host CLI fetch tools
return enough signal to emit a valid DESIGN.md, and the closure
self-check catches what it claims to catch.

## Per-case table

| URL | Fetch path | Tokens (colours / typography / components) | Sections present | Closure self-check | Verdict |
|---|---|---|---|---|---|
| `https://stripe.com` (SSR marketing) | WebFetch | 6 / 5 / 6 | 8/8 in order | YES — 13 refs resolve, all hex `#RRGGBB` | ✅ pass |
| `https://nextjs.org/docs` (static docs) | WebFetch | 9 / 6 / 7 | 8/8 in order | YES — 17 refs resolve, all hex `#RRGGBB` | ✅ pass |
| `https://vercel.com` (JS-rendered marketing / SPA) | WebFetch | 7 / 6 / 7 | 8/8 in order | YES — 14 refs resolve, all hex `#RRGGBB` | ✅ pass |

## Observations

- **WebFetch carried all three cases.** Even the Vercel page — flagged
  explicitly as "JS-rendered SPA" by the fetcher's content-type readback —
  returned enough rendered HTML for the host model to extract a usable
  token set. The bb-browser MCP rung of the fallback chain was not
  triggered. The chain still mattered as a *contract*: the workflow
  prose tells the user which rung succeeded, and "WebFetch" is recorded
  in all three artifacts.

- **System-font heuristics dominate.** All three pages render with a
  system-font stack with light brand-specific opinions (Stripe → generic
  system; Next.js → Inter; Vercel → Geist). The DESIGN.md `typography`
  family strings record both the brand-preferred face and the system
  fallback chain so downstream consumers can reproduce either.

- **Three brand voices, three palettes, one shape language.** Stripe
  carries the loudest palette (`#635bff` purple, one accent). Next.js
  and Vercel both lean monochrome with `#0070f3` blue or pure black as
  the single non-neutral colour. The Do's and Don'ts sections converge
  on the same advice — *hold the colour scarcity, let whitespace and
  weight carry hierarchy*. That convergence reads as a real signal
  about modern developer-tool marketing, not a workflow bug.

- **No format drift observed.** Every emitted YAML used `"#RRGGBB"` hex,
  `<n>px|em|rem` dimensions, `"{group.name}"` references — exactly what
  `knowledge/designmd-format.md` documents. Headings match the spec
  text precisely (`Do's and Don'ts`, not `Dos and Donts`).

- **The closure self-check is the right gate at the right time.** The
  brief considered scoring rendered HTML against the taste rubric;
  rejected for the same reason `/ui:extract` rejects it (the workflow
  produces a spec document, not pixels). The format self-check is
  format-bounded — YAML parses, sections ordered, references resolve,
  hex/dimension shapes valid — and that gate is sufficient for what
  the workflow promises.

## Follow-ups

Candidate v1.y work, surfaced by this dogfood but **not in scope** for
v1.x:

1. **`ui designmd validate <file>`** — deterministic linter that runs
   the closure self-check externally. Would let CI / pre-commit assert
   spec conformance without the host model in the loop. ~150 lines of
   new code, ~10 tests.
2. **`ui designmd export <file> --target dtcg|tailwind`** — bridge from
   the open `DESIGN.md` to ease-design's internal `design/*.json` SSOT
   (or to a Tailwind config). Would close the loop so `/ui:generate`
   can consume `DESIGN.md` directly. Format-translation is fragile
   (composite tokens, alias graphs); estimate 300–500 lines + 25 tests.
3. **bb-browser MCP fallback exercise.** None of the three dogfood
   cases needed it. A genuinely JS-only target (a dashboard behind
   auth, a Vue/Svelte SPA that ships an empty shell to bots) would
   exercise the second rung. v1.y can add a synthetic test fixture
   for this rather than waiting for a real-world failure.
4. **Confirmation prompt on overwrite.** The workflow prose tells the
   host model to confirm before overwriting an existing `DESIGN.md`.
   The dogfood ran in scratch dirs so this path is not yet observed
   live; covered by reading the workflow rather than running it.

## Audit snapshot

| Gate | Status | Notes |
|---|---|---|
| `npm run typecheck` | ✅ exit 0 | TS compiles clean across `src/` and `tests/`. |
| `npm run lint` | ✅ exit 0 | ESLint clean. |
| `npm run build` | ✅ exit 0 | `dist/cli.js` rebuilds at 171.14 KB ESM. |
| `npm test` | ✅ exit 0 | **627 tests across 43 files** (+2 from 625 baseline — two new positive presence assertions). |
| Plan-reference leakage scan | ✅ zero matches | `grep -rE "Phase [0-9]\|OD-[0-9]\|finding [A-Z]" src/ tests/ schemas/ scripts/ templates/workflows/ knowledge/taste-rubric.md knowledge/designmd-format.md templates/skills/designmd-emit.md` returns nothing. |

## Verdict

`/ui:from-url` is **shipped**. The three dogfood artifacts prove the
workflow lands cleanly on real public URLs and emits spec-valid
DESIGN.md without manual intervention. Follow-ups above are the
v1.y conversation, not blockers for v1.x.
