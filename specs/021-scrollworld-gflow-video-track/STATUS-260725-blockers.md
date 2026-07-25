# 021 — status + blockers, verified 2026-07-25

**Written by:** a session on `Jangs-Mac-Studio` that does **not** own spec 021. Everything below was
verified by running the check, not by reading a report — but the checks ran **on this machine only**.
Where a finding is machine-scoped, it says so. Please re-verify on the machine that owns 021 before
acting; a "missing" here may simply mean "installed over there".

**Repo state when written:** `main` @ `be9809c`, pushed. Gate green (154 files / 2302 tests,
`ui knowledge check` 0 findings).

---

## 1. What has shipped since the spec was last updated

`SPEC.md` still reads **"Status: pilot proven, pre-integration"**. That header is now **stale for the
tenant half**, and whoever picks this up should not rebuild what already exists:

- **PR #95 (`a394230`, merged into `0a56699`) shipped the tenant contract into the kernel.**
  `ui tenant-lint` and `ui tenant-scaffold` are live — verified present in `node dist/cli.js --help`.
  This is the *embedding law*: a scrub section reads the host only via its own bounding box and
  writes only inside its own subtree; 9 rules, all severity `error`, no warnings tier.
- `knowledge/motion-craft.md` gained the contract; `knowledge/generation-craft-defaults.md` gained a
  **canvas-aspect floor** (backing-store aspect must equal display-box aspect — caught in the wild on
  a scrub canvas sized to its tall section rather than its `100dvh` stage).
- `CONTEXT.md` gained three canonical terms: **Tenant section**, **Scrub section**, **tenant-lint**.
  Note the `_Avoid_` lists — **"island" is banned** (it implies iframe/JS isolation; a tenant is
  same-DOM). Use these terms in any new work.

So Phase 3 is **partly done**: the embedding law graduated. The *asset pipeline* did not.

## 2. BLOCKER — the asset path does not run on a fresh machine

Verified on `Jangs-Mac-Studio`, 2026-07-25:

| What the docs claim | Command run | Result |
|---|---|---|
| `~/.local/bin/gflow` installed (`SPEC.md` "Two upstream repos") | `command -v gflow`, `ls ~/.local/bin` | **absent, not on PATH** |
| drivers live in "the es-gflow skill" (`README.md` § Structure) | `ls ~/.claude/skills/` | **no gflow/scroll/cinema skill installed** |
| gflow to be registered in `doctor.sh` (deferred item) | `grep -rn gflow setup.sh doctor.sh` | **no match — not registered** |

**The honest reading is a portability gap, not a false claim.** `gflow` was presumably installed on
whichever machine ran the pilot, and the spec recorded that machine's local state as if it were
global. The consequence is the part that matters:

> **Spec 021's asset pipeline is not reproducible from a fresh clone.** `site/` renders fine because
> its assets are committed, but no new frame, leg, or still can be generated on a machine that did
> not personally run the pilot.

This collides with what spec 020 promises. `setup.sh` is documented as a **one-command full-studio
bootstrap** (prereqs → build → link 5 bins → `uv tool install` → verify). It does not install or
check `gflow`, so "full studio" does not currently include the 021 track.

**Fix shape (the deferred item, now blocking):**
- envelope adapter wrapping `gflow … --json` → `{ok, command, data}` + exit codes
- register in `doctor.sh` so absence is *reported* rather than discovered mid-run
- preflight deps: pillow, ffmpeg, cwebp
- **MUST use the i2v + ffmpeg path, not `gflow video chain`** (2 dependency bugs + a download race —
  already recorded in `SPEC.md`)
- add to `setup.sh` if the 021 track counts as part of the studio

## 3. BLOCKER — the architecture contradiction was never settled

`SPEC.md` contains two directions that cannot both be followed, and nothing in the repo records which
one won:

- **`GOALS.md` Phase 1** mandates **Architecture A** — forward seed-chain, each leg's
  `--initial-frame` is the previous leg's actual last frame, **no `--end-frame`**. It states this was
  a **direct user order to follow the repo**, explicitly reversing Fable, and gives the reason: both
  endpoints anchored makes seam *velocity* discontinuous even when frames match — the "lạc quẻ".
- **`SPEC.md` § LOCKED DIRECTION (Fable 5, 260722)** says the opposite: *"Kill the last-frame
  seed-chain — it's an error integrator"*, use **keyframe-anchored** frames-to-video with both
  endpoints fixed.

The shipped pilot used **Architecture A**, and `RETRO` called its seams continuous. The LOCKED
DIRECTION block sits *below* the pipeline it claims to supersede and was never reconciled.

**This must be decided before any asset work.** Rebuilding the gflow hand against the wrong
architecture wastes the build and the video credits. It is also an owner decision, not an agent one —
the Arch A instruction is recorded as coming from the owner directly.

## 4. Deferred, still open

From the brv feature note `scrollworld-gflow-flythrough`:
- `/es-librarian run` for the remaining gflow gaps.
- Phase 3 proper: scroll-cinema as a **track under the conductor** (brief → manifest → gen → build →
  serve/export), with topic profiles for **world / product / character** — the last two are already
  researched in `docs/research/product-scroll.md` and `docs/research/character-white-bg.md`.
- The scroll-cinema *graduation* was held pending "a 3rd context pulling on it". The tenant contract
  graduated the embedding law only; that hold still stands for the **asset half**.

## 5. Recommended order

1. **Settle §3** (owner decision: Arch A vs keyframe-anchored). Cheap, and everything downstream
   depends on it.
2. **Then §2** — rebuild the asset hand against the settled architecture.
3. **Then Phase 3** — the conductor track and topic profiles.

## 6. What this session did NOT do

No file under `specs/021-*` was modified except the addition of this note. No architecture was
chosen, no `gflow` installed, no adapter written, no `SPEC.md` header corrected — the stale
"pre-integration" status is left in place deliberately, because correcting it is the owning machine's
call once §3 is settled.
