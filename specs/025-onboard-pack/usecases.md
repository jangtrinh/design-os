# Use cases — Spec 025: The consumable pack

**Stage**: spec · **Prereq**: `direction.md` (owner-locked 2026-07-30), `spec.md` (this dir)
**Scope**: Phase 1 (emitters) + Phase 2 (instrument) + Phase 3 (consumption gate).
Claude-Design-compatible output and starting points are out — see `spec.md` §Non-goals.
**Dependency**: spec 009 Phases 1–4 are **merged** (#77–#80, 2026-07-17; `tasks.md` checkboxes are
stale). Phase 1 of this spec is unblocked now.
**Owner decisions folded in (2026-07-30)**: manifest-derived slug + `--name` override · install by
**copy** · gate on **dana-desktop** with a fresh **Claude Code** session · tokens copied only from
a `GENERATED`-headered source · starting points out · the gate screen stays out of the pack.

> **Naming**: **Must/Should/Could** = priority. **Phase 1 / Phase 2 / Phase 3** = delivery order.
> Never `P1`/`P2` — that shorthand already means a spec phase in this repo.

---

## 1. Use cases

### UC-01: Emit a pack from a sealed design system — Phase 1 · Must

**Actor:** studio designer who has finished the 009 code road on a real repo
**Precondition:** `ui ds status` exits 0; the registry holds ≥1 component

**Happy path**
1. `ui ds pack --dir <project>` reads the sealed store (tokens + registry + manifest) and
   `DESIGN.md`.
2. It writes the kernel half: `SKILL.md`, `_pack_manifest.json`, `_adherence.rules.json`,
   `guidelines/*.card.html`.
3. It writes an authoring **scaffold** for every model-authored file that does not yet exist —
   `readme.md` with its seven required section headers empty, one
   `components/<Name>.prompt.md` per registry record carrying the frontmatter stub
   (name, category, `tokensUsed`, variants, **repo path of the real implementation**).
4. Re-running the command changes nothing on disk (Art I: same input → same bytes).

**Edge cases**
- **The scaffold must never overwrite prose.** Second run over an authored `readme.md` leaves it
  untouched. A kernel that clobbers the bible destroys the only part it cannot regenerate.
- 0-component registry → `EMPTY_REGISTRY`. A pack over an empty registry would be an empty claim.
- A registry record whose `sourcePath` no longer exists in the repo → recorded in
  `_pack_manifest.json` as a broken pointer **and** surfaced; the pack points at code, so a dead
  pointer is the pack's own failure mode.
- PCP's manifest lists 36 "components" of which **3 are constant exports** (`RAIL_APPS`,
  `APP_TITLES`, `SUB_SIDEBAR_NAV` from `AppShell.jsx`) and have no `prompt.md` — 33 of 36. A
  non-component export must not silently become a component card.

---

### UC-02: Refuse to pack a store that is not sealed — Phase 1 · Must

**Actor:** the same designer, one `registry register` after 009 Phase 1 has *not* landed
**Precondition:** `ui ds status` exits non-zero (`DS_TAMPERED`)

**Happy path**
1. `ui ds pack` exits non-zero with `DS_TAMPERED` and writes **nothing**.
2. The message names the sanctioned repair; it never offers to heal the store (spec 009 owns that).

**Edge cases**
- A pack emitted from a tampered store would carry hashes of files the manifest no longer
  vouches for — a deliverable that certifies unverified content (Art VIII).
- Partial write: the emitters commit as a set or not at all. A half-written pack whose manifest
  indexes files that were never written is worse than no pack.

---

### UC-03: The pack's adherence rules come from the contracts, not from prose — Phase 1 · Must

**Actor:** `ui ds pack`, adherence emitter
**Precondition:** registry records carry variants/props and `tokensUsed`

**Happy path**
1. `_adherence.rules.json` is emitted with four rule kinds: `token-ban` (raw hex, raw px,
   `font-family` outside the DS families), `prop-allowlist`, `enum-allowlist`, `import-path`.
2. Every rule carries the registry record or token path it derives from.
3. `ui ds-usage-lint <file.html> --pack <dir>` consumes the file and reports in the standard
   findings shape, exit 1 on errors.

**Edge cases**
- **Measured overlap with what we already have is 1 rule of 54** — `ds-usage-lint.ts:29-40` is
  colour-only, HTML-only, and never loads the registry. The prop/enum half (49 of PCP's 54 rules)
  has no existing engine; it is new surface, not a reuse.
- A JSX/TSX repo cannot run the neutral file → `--lint-adapter oxlint` (Should) emits
  `_adherence.oxlintrc.json` in PCP's proven selector shape.
- A rule with no traceable source must fail the build, not ship as a warning. An invented lint rule
  is the most expensive kind of invention: it teaches the next reader a law nobody wrote.

---

### UC-04: Read a codebase with the instrument — Phase 2 · Must

**Actor:** the host model running `/ui:learn` on a code project
**Precondition:** `ui scan` reported `componentDirs` (009 Phase 2 BFS router)

**Happy path**
1. The instrument issues R1's seven entry points **in one parallel batch**: `package.json`,
   app layout, token CSS, shell component, routes manifest, representative pages, fixture data.
2. R2 applies: a file carrying `GENERATED — do not edit` is transcribed verbatim, unrounded.
3. R3 applies: usage per component is **counted** across screens; the team-built tier outranks
   library presence.
4. R4–R5 apply: divergences become named props; every value carries its reason.
5. R6's checklist is answered in full; "none" is recorded as an answer.
6. R7's guardrails hold: the source inventory is the component list, and everything unbuilt is
   named in "Not built".

**Edge cases**
- **The counted case that motivated R3** — PCP: **0 of 32 screens** used the shadcn `Card`;
  the team-built `CardShell` is the real card. A ranking by library presence gets this backwards.
- **The generated-file case that motivated R2** — PCP's `ds-tokens.css` is generated by
  `pnpm tokens:sync` from the Figma kit; the codebase marks measured values `FACT` and the pack
  carries them unrounded (`readme.md:11-13`). Rounding 5px to 4px silently rewrites the brand.
- A mid-run read failure must **STOP and report read/unread**. A partial read that continues
  produces a bible whose gaps are invisible — the failure mode R7 exists to prevent.
- R1 supersedes `learn.md:188-198` §3a's 3–5-file sampling **on this road only**; §3a's audit
  rule (state sampled and skipped) survives.
- A dimension with no source (PCP: no logo, no imagery, no font binaries — `readme.md:15`) is
  recorded as absent. **No logo in source → no logo drawn.**

---

### UC-05: A component's usage law survives the session — Phase 2 · Must

**Actor:** the host model authoring `components/<Name>.prompt.md` into the kernel scaffold
**Precondition:** UC-01 wrote the scaffold; UC-04 supplied the evidence

**Happy path**
1. Each `prompt.md` states the component's role in one line, shows one real usage example, and
   lists its "never"s **with their reasons** (R5).
2. The frontmatter stub's repo path is untouched — a reader can open the real implementation.
3. `ui ds pack --check` passes: every registry component has a `prompt.md`, and every `prompt.md`
   names a component the registry carries.

**Edge cases**
- PCP's own laws are 3–10 lines, not documentation: *"Never add vertical column rules"*,
  *"Never wrap a table in a card that uses a real CSS `border`"* — each with its reason attached.
  A `prompt.md` that restates the props table duplicates `ds docs` and teaches nothing.
- A component with no observed usage site: the law is "not used in the source" — recorded, not
  invented.

---

### UC-06: A stranger designs with the pack — Phase 3 · Must (the gate)

**Actor:** a **fresh Claude Code session on this machine**, given only the pack (owner D3)
**Precondition:** UC-01→UC-05 complete on **dana-desktop** (owner D3 — also 009's own gate repo)

**Happy path**
1. The session discovers `SKILL.md`, reads `readme.md`, and designs one screen.
2. The screen passes the pack-emitted adherence lint.
3. The screen passes `ui ds-usage-lint --pack`.
4. A reviewer's DS-fidelity check against `readme.md` passes.

**Edge cases**
- **Consumption is the acceptance test, not emission** (owner). A pack that emits cleanly and
  cannot be used is a failed pack, and the emission gate would have called it green.
- The session must be given **only** the pack — no repo tour, no `ds context`, no operator hints.
  A gate that leaks context measures the operator, not the pack.
- A repo where the pack fails is a **finding, reported**, not a quiet omission (Art III, and the
  same rule 009's UC-06 uses).
- **The screen is evidence, not cargo** (owner D6): it is filed under
  `specs/025-onboard-pack/reports/` and never ships inside the pack.
- A second runtime (Antigravity) is **deferred** (owner D3). The gate write-up must say so; an
  untested runtime that goes unmentioned reads as a tested one.

---

### UC-07: The pack goes stale after a registry write — Phase 1 · Should

**Actor:** designer who registers a new component after packing
**Precondition:** a pack exists; `registry register` reseals (009 Phase 1)

**Happy path**
1. `ui ds status` reports the pack block as stale, naming the generation it was built from.
2. Nothing is rebuilt automatically. The designer re-runs `ui ds pack`.

**Edge cases**
- An auto-rebuild would silently regenerate the kernel half against prose written for an older
  registry — the freshness signal exists precisely because the two halves drift apart.
- Installed copies (`.claude/skills/…`) go stale independently of `design/pack/`. `ds status`
  reports both, or says it did not check the installed copy — never implies it did.

---

## 2. Acceptance criteria (Gherkin) — Must use cases

```gherkin
# UC-01
Scenario: A pack is a pure function of the sealed store
  Given a sealed design system with at least one registered component
  When I run "ui ds pack --dir <p>"
  Then "design/pack/_pack_manifest.json" exists
   And "design/pack/SKILL.md" exists
   And "design/pack/_adherence.rules.json" exists
   And every registry component has a "design/pack/components/<Name>.prompt.md"
  When I run "ui ds pack --dir <p>" a second time
  Then no file under "design/pack" changes

Scenario: The scaffold never overwrites authored prose
  Given a pack whose "readme.md" has been authored by the host model
  When I run "ui ds pack --dir <p>"
  Then "design/pack/readme.md" is byte-identical to before
   And "design/pack/_pack_manifest.json" is regenerated

Scenario: A component pointer that no longer resolves is reported
  Given a registry record whose sourcePath does not exist in the repo
  When I run "ui ds pack --dir <p>"
  Then "_pack_manifest.json" marks that component's pointer as broken
   And the command reports it
  # The pack points at code; an unchecked pointer is the pack's own failure mode

# UC-02
Scenario: An unsealed store cannot be packed
  Given a design system where "ui ds status" exits non-zero
  When I run "ui ds pack --dir <p>"
  Then the command fails with DS_TAMPERED
   And no file under "design/pack" is created or modified

Scenario: An empty registry cannot be packed
  Given a sealed design system with zero registered components
  When I run "ui ds pack --dir <p>"
  Then the command fails with EMPTY_REGISTRY

# UC-03
Scenario: Every adherence rule traces to a contract
  Given a registry record "Control/Button" with variants "Variant=Primary,Variant=Ghost"
  When I run "ui ds pack --dir <p>"
  Then "_adherence.rules.json" contains an enum-allowlist rule for Variant on Control/Button
   And that rule names "Control/Button" as its source
   And no rule in the file lacks a source

Scenario: The pack's own linter runs without a third-party dependency
  Given a pack with "_adherence.rules.json"
    And an HTML file using a raw hex colour in a colour-bearing property
  When I run "ui ds-usage-lint page.html --pack design/pack --json"
  Then the envelope reports a finding with severity "error"
   And the command exits 1

# UC-04
Scenario: A generated source is transcribed, never rounded
  Given a token file whose header says "GENERATED — do not edit"
    And it declares "--radius-lg: 14px"
  When the instrument compiles the vocabulary
  Then the emitted token value is "14px"
  # Not 12px, not 16px, not "lg" — 5px means 5px

Scenario: Usage count outranks library presence
  Given a source with a library "Card" imported by 0 of 32 screens
    And a team-built "CardShell" imported by at least one screen
  When the instrument ranks components
  Then "CardShell" is ranked above "Card"
   And the summary carries the measured usage count for each
  # The counts are measured per repo — the only fixed fact is the ordering rule

Scenario: An absent dimension is recorded as absent, not invented
  Given a source containing no image, icon-font or logo file
  When the instrument answers the ICONOGRAPHY checklist
  Then "readme.md" records that no brand mark exists in the source
   And no logo, wordmark or illustration is drawn into the pack

Scenario: A mid-run read failure stops the run
  Given the instrument has read 4 of 9 planned entry points
   And the 5th read fails
  When the instrument continues
  Then it stops and reports which files were read and which were not
   And no pack is authored from the partial read

# UC-05
Scenario: The pack check catches a component with no usage law
  Given a registry with 12 components
    And "design/pack/components" holding 11 prompt.md files
  When I run "ui ds pack --check --dir <p>"
  Then the command fails
   And the message names the component whose prompt.md is missing

Scenario: The pack check catches a missing required section
  Given a "readme.md" with no "Not built" section
  When I run "ui ds pack --check --dir <p>"
  Then the command fails
   And the message names the missing section
  # Art II: the required-section convention ships with the check that fails without it

# UC-06 — the gate
Scenario: A fresh session designs correctly from the pack alone
  Given a pack emitted from the dana-desktop repo on this machine
    And a fresh Claude Code session given only that pack
  When the session produces one screen
  Then the pack-emitted adherence lint reports zero errors
   And "ui ds-usage-lint <screen> --pack design/pack" exits 0
   And a reviewer's DS-fidelity check against readme.md passes
  # Consumption is the acceptance test, not emission
```

---

## 3. Error states

| Condition | Behaviour | User-facing message |
|---|---|---|
| Store unsealed / tampered | `DS_TAMPERED`, exit 1, nothing written | reuse 009's wording; never offer to heal (009 Phase 1 owns it) |
| Registry has 0 components | `EMPTY_REGISTRY`, exit 1 | "no registered components — run the code road before packing" |
| `readme.md` missing a required section | `--check` exit 1 | "pack readme is missing required section '<name>'" |
| Registry component with no `prompt.md` | `--check` exit 1 | "component '<Name>' has no usage law — author `components/<Name>.prompt.md`" |
| `prompt.md` for a component not in the registry | `--check` exit 1 | "'<Name>.prompt.md' names a component the registry does not carry" |
| `sourcePath` pointer does not resolve | recorded in manifest + reported, pack still emits | "component '<Name>' points at '<path>', which does not exist" |
| Pack older than the registry generation | `ds status` reports stale, exit unchanged | "pack built from generation N; registry is at N+2 — re-run `ui ds pack`" |
| `--install <runtime>` with an unknown runtime | `BAD_ARG`, exit 1 | "unknown runtime '<x>' — expected claude \| antigravity" |
| Adherence rule with no traceable source | build failure (test), never shipped | internal — an invented lint rule teaches a law nobody wrote |

---

## 4. UX decisions

| Decision | Principle | Rationale |
|---|---|---|
| Canonical pack at `design/pack/`, installed **by copy** into the runtime skills dir | **Recognition over recall** + Art VII | `.claude/` is per-machine and gitignored (`.gitignore:52-56`); a deliverable that lives only there dies on `git clone`. The pack is a function of the DS, so it lives next to it and is committed. Installation is adapter output, exactly as `ui init` already treats `.claude/skills/design-os-*` (`src/adapters/claude.ts:44`). Owner D2 chose copy over symlink — deterministic bytes are what the manifest hashes; the cost is a second freshness surface (UC-07). |
| Kernel scaffolds, model authors, kernel never overwrites | **Error prevention** (Nielsen #5) + Art I | The prose is the only part no re-run can regenerate. A scaffold that clobbers it converts a re-run into data loss. |
| Freshness reported, never auto-rebuilt | **Visibility of system status** (Nielsen #1) + Art VIII | An auto-rebuild silently pairs new kernel output with prose written for an older registry. The drift is the signal; hiding it is the defect. |
| The pack points at repo code; nothing is copied | — (the architectural insight) | Claude Design copied 36 components and a 189KB bundle **because its runtime is walled**. Ours is not. A copy is a fork that starts rotting the moment it is written. |
| "None" is a recorded answer, not a skipped question | **Art VIII honesty floor** | PCP: *"Blur tokens exist and are unused"*, *"Dark mode is declared but frozen"*. An unanswered question and an answered "none" look identical in the output unless the format forces the difference. |
| A linter-neutral rules file first, oxlint as an adapter | **Art I + Art IX** | The kernel must not bind its only adherence artifact to a third-party schema, and a JSX-only emitter serves nothing in a Vue/Svelte repo. The adapter ships when a gate repo needs it. |
| Starting points (`*.dc.html`) out of v1 | **Art IX (YAGNI)** + R7 | PCP's own manifest declares `startingPoints: []`. Building an emitter for a feature with no source sentence and no populated instance is the invention R7 forbids. |

---

## 5. Design-system check

Spec 025 ships **one user-visible surface** (the pack itself) plus kernel output:

- `ui ds pack` re-emits a JSON envelope; `design-os` passes it through **verbatim** (Art I.3).
- The pack's own linter follows the findings-linter shape (Art II):
  `{checkId, severity, message, line?}` → `{findings, errorCount, warningCount}`, exit 1 on errors.
- `guidelines/*.card.html` are **generated artifacts** — per Art III they run the FULL linter set
  in their own tests (taste-lint included; the specimen-page miss is precedent).
- `ds status`'s `pack` block is **additive** to the existing envelope — no breaking change.
- New modules stay under ~200 lines (Art IX). The pack emitters split by artifact
  (manifest / skill / adherence / cards), not one `ds-pack.ts`.

**New conventions introduced**, each of which must ship its emitter AND its linter in the same
commit (Art II): the `readme.md` required-section set (→ `ds pack --check`), the
`_adherence.rules.json` rule vocabulary (→ `ds-usage-lint --pack`), and the `@dsCard` header on
split specimen pages (→ manifest index validation).

---

## 6. Appetite check

| UC | Effort | Value | Ship this cycle? |
|---|---|---|---|
| UC-01 emit the pack | Medium — four emitters + scaffolds | High — this IS the deliverable | **Yes — Phase 1** |
| UC-02 refuse an unsealed store | Low — reuse 009's seal check | High — Art VIII; a pack certifies its source | **Yes — Phase 1** |
| UC-03 adherence rules from contracts | Medium — 49 of 54 PCP rule kinds are new surface | High — the linter half of Art II | **Yes — Phase 1** |
| UC-07 pack freshness in `ds status` | Low — one additive block | Medium — cheap alongside UC-01 | **Yes — Phase 1** |
| UC-04 the instrument | Medium — a template rewrite with 7 checks | High — the quality of everything downstream | **Yes — Phase 2** |
| UC-05 usage laws | Low per component, real total | High — the part `ds docs` cannot generate | **Yes — Phase 2** |
| UC-06 two-session gate | Medium — a real repo run + a fresh session | High — the only proof that isn't emission | **Yes — Phase 3** |
| oxlint adapter | Low — PCP's selector shape is proven | Medium — needed only if the gate repo is JSX | **Should — Phase 3** |
| `ds a11y` verdicts in the manifest | Low | Low | **Could — later** |
| Claude-Design-compat emitter | High | Low now | **No — future phase, explicit door** |
| Starting points (`*.dc.html`) | Medium | Unknown — no source | **No — spec.md D4** |

---

## 7. Open questions

Questions 1–5 of the first draft (brand slug · copy-vs-symlink · gate repo and stranger · token
copy threshold · gate screen in the pack) were **answered by the owner 2026-07-30** and are now
locked decisions in `spec.md`. What remains:

1. **Where the five scan lessons graduate to.** Direction locks them into this spec's journey
   template now, with the librarian gap door later. What evidence closes that loop — reuse on a
   second repo, or a fixed number of runs?
2. **Recorded deferral, not a decision:** the gate is Claude Code only. Antigravity's
   `.agent/skills/` tree can be emitted by `--install antigravity`, but no scenario here proves a
   session there can consume the pack. Untested, and said so.
