# ShaderGradient reference ledger

**Canonical location.** This directory — `knowledge/shader-gradient/` — is the single
canonical ShaderGradient roster: tracked in this repository and packaged in the npm tarball
(`knowledge` is one of `package.json.files`'s entries).

**No upstream source is stored here.** This directory holds slugs, display names, the three
mechanically-derived preset axes (`mesh`, `light`, `grain`), the surface matrix, and
provenance — never GLSL, parameter values, API tables, code, or upstream prose beyond the
display name. The **numeric preset values deliberately do not live here**; they live in
`design-os-figma-plugin`'s `shared/shader-gradient-presets.ts`, which carries MIT attribution
and a `THIRD-PARTY.md` entry. A preset's prop set is a parameter list, and a parameter list is
exactly what this ledger refuses to carry.

## Provenance

- **Upstream:** https://github.com/ruucm/shadergradient
- **Fork (ours, upstream-tracked):** https://github.com/jangtrinh/shadergradient
- **Pinned revision:** `974a230b1e6c3ec375fbe17a8ea1c89edbc48019` (committed 2026-06-12)
- **Captured:** 2026-06 (`202606`)
- **Package:** `@shadergradient/react` v2.4.24
- **Roster:** 10 presets · 12 surfaces. Confirmed at the pinned revision.

### License record — read this before citing it

**MIT © [ruucm](https://github.com/ruucm), [stone-skipper](https://github.com/stone-skipper).**

There is **no root `LICENSE` file** in the upstream repository at the pinned revision. GitHub's
own API therefore reports `license: null` for the repo, and any tooling that reads that field
will conclude the project is unlicensed. It is not. MIT is declared in exactly two places:

1. `packages/shadergradient/package.json` → `"license": "MIT"`
2. `README.md` → `# License` section, naming both authors

**Cite those two locations, never a `LICENSE` path** — it does not exist and a reader who goes
looking will find nothing and reasonably doubt the claim. Our fork pins a copy of both files, so
the claim stays checkable even if upstream restructures.

MIT permits use, modification, and redistribution with attribution. That is why the *values* may
live in the plugin repo under attribution while this ledger stays source-free — the split is a
DESIGN:OS ledger rule, not a licensing requirement.

## `presets` derivation (mechanical, reproducible)

The 10 rows come from upstream's `packages/shadergradient/src/presets.ts` — the object literal
`export const presets`. Each row's four ledger fields map to that file as:

| Ledger field | Upstream source | Transform |
|---|---|---|
| `slug` | the preset's object key | camelCase → kebab-case (`nightyNight` → `nighty-night`) |
| `name` | `.title` | verbatim |
| `mesh` | `.props.type` | verbatim (`plane` \| `sphere` \| `waterPlane`) |
| `light` | `.props.lightType` | verbatim (`3d` \| `env`) |
| `grain` | `.props.grain` | `'on'` → `true`, `'off'` → `false` |

**To reproduce at a refresh:** evaluate the `presets` object literal at the new revision and read
those five keys per entry. Do not hand-transcribe — the roster was derived by evaluating the
literal precisely because a 10×5 hand transcription is where a ledger silently goes wrong.

**Measured distribution at the pin** (kept so a refresh can diff against it, not as a claim about
future revisions): mesh — `waterPlane` 5, `sphere` 4, `plane` 1. light — `3d` 9, `env` 1
(`interstella` alone). grain — `true` 4 (halo, pensive, interstella, nighty-night), `false` 6.

**Two invariants held by all 10 rows at the pin**, both load-bearing for
`knowledge/shader-gradient-direction.md`:

- **Every preset is `shader: 'defaults'`.** Zero presets use `positionMix`, `cosmic`, or
  `glass`. The other three families are reachable by hand-config only. This is why the ledger
  carries a second array (`surfaces`) instead of folding shader choice into the preset rows —
  a single flat list would hide three quarters of the vocabulary behind a field that never varies.
- **Every preset is `animate: 'on'`.** No preset ships a static default, which is why the
  direction file's reduced-motion floor is mandatory rather than a per-preset concern.

**Falsification condition, kept live:** if a refresh finds a preset using a non-`defaults` shader,
or shipping `animate: 'off'`, both statements above lose their "all 10" form and the direction
file's reasoning that depends on them must be re-derived — never silently absorbed.

## `surfaces` derivation (mechanical, reproducible)

`surfaces` is the set of valid `shader` × `mesh` pairs — the real vocabulary a hand-configured
field can select from.

Upstream resolves a shader program with a **two-level index**:
`packages/shadergradient/src/ShaderGradient/Mesh/Mesh.tsx:38` reads

```
shaders[shader][type]
```

where `shaders` is the namespace re-exported by `src/shaders/index.ts` (`defaults`,
`positionMix`, `cosmic`, `glass`) and `type` is `typeT` from `src/types.ts`
(`plane` \| `sphere` \| `waterPlane`). The valid set is therefore the Cartesian product,
**bounded by which pairs actually exist on disk** — an index lookup into a missing module is a
runtime failure, not a supported surface.

**To reproduce at a refresh:** enumerate `src/shaders/*/` for the family list and `typeT` for the
mesh list, then confirm each pair resolves to a directory containing both `vertex.glsl` and
`fragment.glsl`. At the pinned revision **all 12 pairs exist and each carries both files** —
verified per-pair, not inferred from the product. A pair that cannot be confirmed this way is
**not** assumed present because its siblings are: drop it and record the gap here.

## Staleness

`captured` is `202606`. `ui knowledge check` warns past 6 months. A refresh re-derives both
arrays by the recipes above against a new pin, and updates the `revision` / `captured` /
`packageVersion` fields together — a partial bump is worse than none, because it makes the
ledger claim currency it does not have.
