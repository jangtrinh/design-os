# MengTo/Skills → DESIGN:OS — Selective-Integration Research Report

**Reviewer:** Opus 5 (research / read-only)
**Date:** 2026-07-25
**Subject repo:** `https://github.com/MengTo/Skills` @ HEAD `21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49` (2026-07-25)
**Local clone for evidence:** `/private/tmp/mengto-skills` (read-only clone; safe to delete)
**Target repo:** `/Users/jangtrinh/Products/ease-design` (DESIGN:OS) — **not modified, no commits, no installs, no paid generation**

Evidence labels used throughout: **[F]** = fact verified in a file/command output, **[I]** = inference,
**[R]** = recommendation. Star count and popularity were not consulted and carry no weight here.

---

## 0. TL;DR (tiếng Việt, cho owner)

MengTo/Skills **không** phải nguồn "design knowledge" tốt hơn DESIGN:OS. Doctrine của DESIGN:OS
sâu hơn rõ rệt (personas, taste-rubric 7 trục, benchmark DNA đo thật, 6 linter, VR gate,
librarian loop). Copy nội dung skill của họ vào là **thụt lùi** và tạo skill sprawl.

Giá trị thật nằm ở **3 cơ chế kỹ thuật**, không phải ở kiến thức thiết kế:

1. **Mỗi đơn vị doctrine phải có 1 demo chạy được + 1 ảnh render ở viewport ghim + 1 dòng trong
   gallery, và có validator fail khi thiếu** (`scripts/validate-skill-demos.mjs`). DESIGN:OS có
   26 persona + 9 signature device + 21 page shape **không đơn vị nào có bằng chứng render riêng**.
   Đây đúng là scar "một standard cần emitter VÀ linter" của chính repo mình.
2. **Đường nhận HTML lạ được làm cứng**: chain hash `original→bundled→hardened→sandboxed`, CSP
   `default-src 'none'`, allowlist host, chặn SSRF (`169.254.169.254`, `127.0.0.1`, `10.*`…), cap
   5 MB, có unit test bảo mật riêng. `templates/workflows/from-url.md` của mình lưu `source.html`
   thô mà **không** hash, không sandbox, không allowlist.
3. **Gate rủi ro originality có rubric + script tất định** (2 vị trí evidence mỗi red flag, danh
   sách false-positive, quét cả git history). DESIGN:OS gọi "originality" là 1 trục ceiling nhưng
   **không có thủ tục chứng minh** nào.

Cảnh báo quan trọng **[F]**: gate của chính họ **đang đỏ** — chạy `node scripts/validate-skill-demos.mjs`
tại HEAD ra `Demo validation failed with 109 issue(s)`, 92/121 skill có demo, `DEMOS.md` vẫn ghi
"Every tracked skill has a portable demo", và **không có `.github/`** nên gate chưa bao giờ chạy CI.
Học *cơ chế* của họ, đừng học *tình trạng bảo trì* của họ.

Kết luận: **Adapt 3 cơ chế, Adopt 1 thứ rẻ (selection table), Experiment 2, Reject phần lớn nội dung.**

---

## 1. Executive summary (EN)

MengTo/Skills is a **single-author, MIT-licensed, prose-first agent-skill library** for designers:
121 `SKILL.md` playbooks in 6 categories, 92 of them shipping a runnable `demo/index.html`, a
`PROMPT.md` prompt-triad, and a fixed-viewport `preview.jpg`, indexed by two generated galleries
and checked by one Node validator **[F]**.

**What it is genuinely good at** (and DESIGN:OS is not): making each unit of knowledge carry its own
*runnable, screenshotted, machine-checked proof*, and making untrusted third-party HTML safe to
ingest with a hash-and-sandbox chain. Both are **mechanisms**, transferable without importing a
single line of their design opinions.

**What it is not good at**, measured against DESIGN:OS: design doctrine depth. DESIGN:OS carries
26 personas with full DNA, a 7-axis scored taste rubric, 8 measured `*.dna.json` product
benchmarks, six deterministic linters, a VR gate, an anti-fabrication evidence ledger, and a
knowledge-authoring meta-standard enforced by `ui knowledge check`. MengTo's design content is
thinner, sometimes 20 lines (`number-details/SKILL.md`), sometimes duplicative-but-weaker
(`animation-systems` motion bands vs `knowledge/motion-craft.md:165-167`), and sometimes directly
hostile to DESIGN:OS invariants (raw Tailwind arbitrary-value shadow strings vs
`knowledge/token-taxonomy.md`'s semantic-tier contract) **[F]**.

**Bottom line [R]:** take three mechanisms (unit-level rendered proof, hardened untrusted-HTML
intake, originality-risk gate), take one cheap documentation pattern (need→skill selection table),
run two time-boxed experiments (motion-reference intake; contiguous section-crop evidence), and
reject the bulk of the library — importing 79 web-design style skills would create skill sprawl,
freeze taste as deterministic truth, and shadow the persona library that already owns that job.

---

## 2. Taxonomy — what MengTo/Skills actually contains

### 2.1 Shape of the repo **[F]**

| Metric | Value | Evidence |
|---|---|---|
| Commits | 108, first `67a74af` 2026-02-01, HEAD `21b278c` 2026-07-25 | `git log` |
| Authors | 1 human (`Meng To` / `MengTo`, 3 git identities: 73+21+14) | `git shortlog -sne --all` |
| License | MIT, © 2026 Meng To | `LICENSE` |
| Skills | **121** `SKILL.md` (README text says "118 skills" — its own line says `find` is the source of truth) | `find agent-skills -name SKILL.md \| wc -l` vs `README.md` |
| Frontmatter keys | exactly `name:` + `description:` in **121/121** — no version, no deps, no runtime pins | frontmatter scan |
| Aux artifacts | 92 `PROMPT.md`, 54 `agents/openai.yaml`, 27 `REFERENCES.md`, 13 `input.md`+13 `expected-output.md`, 2 `ARTICLE.md` | `find` |
| Media weight | 253 jpg / 24 webp / 15 png / 1 mp4; repo 136 MB (`agent-skills` 83 MB, of which `web-design` 75 MB; `.git` 48 MB) | `du -sh`, `find` |
| Executable helpers | 5 `.mjs` (root `scripts/`), 4 `.py`, 3 `.tsx`, 2 `.js` | `find` |
| CI | **none** — no `.github/` directory | `ls -a .github` |

### 2.2 Category taxonomy **[F]**

| Category | Count | Nature | Representative |
|---|---|---|---|
| `web-design/` | 79 | **Style/treatment cards** — one aesthetic or one CSS/WebGL device each; plus a few systemic ones | `build-awwwards-quality-sites`, `animation-systems`, `beautiful-shadows`, `progressive-blur`, `dither-laser-dark-mode` |
| `codex/` | 18 | **Operational workflows** — capture, convert, audit, profile, publish | `video-to-superprompt`, `html-to-interaction-prompts`, `audit-reference-originality`, `article-prompts-to-skills`, `optimize-web-animations` |
| `game-development/` | 19 | Three.js/browser-game architecture + gameplay QA | `build-isometric-arpg`, `test-playable-web-games`, `ship-web-games` |
| `customer-support/` | 2 | SaaS case triage, draft-only safety gates | `handle-saas-billing-cases` |
| `media/` | 2 | Image sourcing from external services | `aura-asset-images`, `unsplash-asset-images` |
| `ui/` | 1 | Design-first prompting system (+`ARTICLE.md`) | `design-first-ui-prompting` |

Counted per directory, not taken from the README: `18 + 2 + 19 + 2 + 1 + 79 = 121`. `README.md`'s own
category headings say "Codex workflows (17)" and "Game development (17)" **[F]** — two more stale
counts on top of the "118 skills" line. Its instruction to trust `find` over its prose is sound
advice about itself, and it is the same failure `knowledge/authoring-standard.md`
§"No hardcoded counts in prose" exists to prevent.

**Functional taxonomy [I]** — the categories hide the real split, which is four kinds of artifact:

- **A. Style cards** (~60 of `web-design/`): a named aesthetic with fixed values. Lowest reuse value
  for DESIGN:OS — this is exactly what `knowledge/personas/*` + `knowledge/signature-devices.md` own.
- **B. Technique recipes** (~19 of `web-design/`, e.g. `gsap`, `threejs`, `css-alpha-masking`,
  `progressive-blur`): library-scoped how-to. Overlaps `knowledge/motion-craft.md` +
  `knowledge/gsap-motion-direction.md`, which are deeper.
- **C. Reference→artifact pipelines** (`codex/`): capture a reference (video, HTML, full page),
  convert it into a builder-ready prompt with an asset map and per-section anatomy. **The most novel
  layer relative to DESIGN:OS.**
- **D. Meta / governance skills** (`article-prompts-to-skills`, `audit-reference-originality`,
  `audit-verify-explain-grade-5`, `test-playable-web-games`): how to package knowledge, how to prove
  a claim, how to audit. **The second-most novel layer.**

### 2.3 The technical mechanisms (this is the actual payload)

**M1 — The skill folder contract [F]** (`README.md`, `CLAUDE.md`):

```txt
agent-skills/<category>/<skill-name>/
  SKILL.md            # required: 2-key frontmatter + procedural body
  REFERENCES.md       # links only — keeps SKILL.md lean
  ARTICLE.md          # long-form, kept OUT of SKILL.md
  agents/openai.yaml  # per-runtime interface manifest
  references/*.md     # deep-dives loaded on demand
  scripts/*.py|mjs    # deterministic helpers
  demo/index.html     # self-contained, no build step
  demo/PROMPT.md      # Minimal / Recreate / Remix prompt triad
  demo/preview.jpg    # 1280×720 real browser render
  demo/input.md + expected-output.md   # for non-visual workflow skills
```

Two enforced separations are worth stealing conceptually: **links live in `REFERENCES.md`,
long-form lives in `ARTICLE.md`, so the loaded context stays procedural** — and **non-visual
workflows prove themselves with `input.md`/`expected-output.md` instead of a screenshot** **[F]**.

**M2 — `scripts/validate-skill-demos.mjs`** (commit `6b4f314`, 2026-07-18) — the strongest artifact
in the repo **[F]**. One Node file, zero dependencies, enumerates skills via `git ls-files` and
enforces, per skill:

- structural HTML: `<!doctype html>`, `lang="en"`, viewport meta, non-empty `<title>`, `<main>`
  landmark, **exactly one `<h1>`**;
- craft floor: `prefers-reduced-motion` must appear (non-`codex` categories);
- self-containment: **no remote URL**, every `src`/`href` resolves inside the demo folder, no
  reference escapes it;
- privacy: no `/Users/` or `file://` path, no email address;
- inline `<script>` bodies are **syntax-checked via `node:vm`** (`new vm.Script(...)`);
- screenshot integrity: `preview.jpg` must be a real JPEG parsed from SOF markers, ≥1200×700,
  ≤2 MB, and **within 2 % of the first preview's dimensions** — a drift check that keeps every
  screenshot comparable;
- asset budget: any `assets/*` file ≤5 MB;
- prompt quality: `PROMPT.md` ≥120 words, must contain the literal `$<slug>` trigger, and must
  contain all three headings `## Minimal prompt`, `## Recreate the demo`, `## Remix prompt`;
- provenance: when `source.json` exists, `provider === "Neuform"`, `ranking.position === 1`,
  design id/title/url present, and `html.original_sha256` matching `^[a-f0-9]{64}$`;
- index coherence: `DEMOS.md` row count, `SCREENSHOTS.md` preview-link count, and `SCREENSHOTS.html`
  `data-demo=` card count must each **equal the skill count**.

**M3 — `scripts/sync-neuform-skill-demos.mjs` + `scripts/test-sync-neuform-security.mjs`**
(both commit `4dd0ae1`, 2026-07-23) — a hardened third-party-HTML intake pipeline **[F]**:

- **SSRF defence**: `isBlockedIp()` rejects `127.0.0.1`, `169.254.169.254` (cloud metadata),
  `10.0.0.1`, `192.168.1.4`, `::1`, `fd00::1`; `assertSafeRemoteUrl()` requires HTTPS, an
  allowlisted host, and resolves DNS before fetching. All asserted in the companion test file.
- **Host allowlists**, split by purpose: runtime scripts (`cdn.tailwindcss.com`,
  `cdnjs.cloudflare.com`, `code.iconify.design`), styles (`fonts.googleapis.com`,
  `api.fontshare.com`), images (`images.unsplash.com`).
- **Secret hygiene**: `manifestUrl()` strips `?token=…` and fragments before anything is recorded.
- **Caps + type checks**: 5 MB HTML, 5 MB per asset, `hasExpectedMagic()` byte-signature check.
- **A 4-stage content-hash chain** recorded in `demo/source.json`:
  `original_sha256 → bundled_sha256 → hardened_sha256 → sandboxed_sha256`, plus
  `security_profile: "sandboxed-srcdoc-v1"`.
- **Runtime de-duplication by content hash**: each vendored library lands once at
  `assets/runtime/runtime-<hash12>-<name>.js` with its `original_url` and `sha256` recorded
  (9 files, 1.8 MB total, 0 duplicate copies inside demos).
- **Execution containment**: the committed demo is a CSP-locked wrapper —
  `default-src 'none'; …; object-src 'none'; form-action 'none'; base-uri 'none'` — that injects the
  real page into a sandboxed `srcdoc` iframe and hands assets in over `postMessage` as blob URLs.

**M4 — Prompt-triad packaging + `$slug` trigger [F]**: every demo carries `Minimal prompt` (one
line, invoke), `Recreate the demo` (full brief: product concept, content anchors, skill direction,
fidelity target, reference snapshot with source URL + rank), `Remix prompt` (change brand/subject/
palette, **preserve mechanism, a11y, responsive and performance contract**). The word-count floor
and heading presence are validator-enforced.

**M5 — Cross-runtime interface manifest [F]**: 54 skills ship `agents/openai.yaml`:
`interface.display_name`, `interface.short_description` (spec'd 25–64 chars), and
`interface.default_prompt` that explicitly invokes `$skill-name`.

**M6 — Need→skill selection table [F]** (`agent-skills/game-development/README.md`): a two-column
`| Need | Start with |` router plus an explicit **"Important boundaries"** section stating which
skill owns which decision ("`design-action-combat` defines combat verbs; `design-game-encounters`
composes them into pressure and pacing"). Cheap, and it is the anti-sprawl device.

**M7 — Reference-intake pipelines [F]**:
- `codex/video-to-superprompt`: `ffprobe` for duration/dimensions/fps, `ffmpeg -vf fps=1` frame
  extraction favouring **timeline beats over uniform thumbnails**, then a 6-layer analysis
  (story / layout / motion / visual / technical rebuild / a11y+perf), an **asset map**, and a
  single paste-ready prompt. Quality bar: "long enough to rebuild the interaction without seeing
  the original video", must name the exact mechanism (`video.currentTime` scrub vs pinned scrub vs
  mask reveal), must always include mobile and reduced-motion.
- `codex/html-to-interaction-prompts`: source HTML is **truth over screenshots**; one tall
  full-page capture becomes the **source of truth for section crops**, which must be *contiguous
  and pixel-complete* (`y-start`/`y-end`/`height` recorded in `manifest.json`, coordinates kept
  out of the article body); **wait 2 s after each scroll** before capture so lazy media and
  reveal animations settle; interactions must be *actuated* before capture.

**M8 — Evidence-graded audit rubric [F]** (`codex/audit-reference-originality` + its
`references/audit-rubric.md` + `scripts/build_evidence_inventory.py`, 423 lines, Python stdlib only
— `hashlib`/`re`/`json`/`subprocess`-to-git, **no network**):
- a 6-level **evidence hierarchy** (identical bytes or historical git blob → rendered-text match →
  brand/number/URL match → image-crop/video-frame match → several distinctive elements combined →
  generic resemblance), where **levels 1–4 can carry a high-confidence flag and 5–6 require
  explicit caveats**;
- a 5-level severity ladder (Blocker/High/Medium/Low/Clear) with the line *"Severity is not a legal
  conclusion"*;
- an explicit **false-positive control list** ("do not escalate solely because both use black and
  white, one accent colour, large sans type, hero→work→services→pricing→FAQ→footer, fade/slide/
  marquee/parallax, common icon libraries, the same framework");
- **every red flag must cite two reproducible evidence locations** (current-site *and* reference);
- **history is a first-class category**: `git log -S`, `git log --all --name-status`, `git show` to
  catch material later renamed, recoloured, cropped, or deleted;
- verdict literals including **`Blocked by missing evidence`** — "never turn missing evidence into
  a pass".

### 2.4 Maintenance state — do not confuse mechanism with hygiene **[F]**

Running the repo's own gate at HEAD:

```
$ node scripts/validate-skill-demos.mjs
Demo validation failed with 109 issue(s):
- agent-skills/codex/audit-reference-originality/demo/index.html: missing
… (32 skills lack demo/index.html)
```

- 92/121 skills have a demo → **29–32 have none** (all of `game-development`, the flagship
  `build-awwwards-quality-sites`, 4 `codex` skills, both `customer-support` skills).
- `DEMOS.md` line 3 states *"Every tracked skill has a portable demo"* — **false at HEAD**.
- `SCREENSHOTS.md` states *"Captured demos: 89"* against 121 skills — the index is honest, the
  DEMOS claim is not.
- No `.github/` → the validator has never gated a commit.
- Generated prompt text is not proofread: `agent-skills/web-design/beautiful-shadows/demo/PROMPT.md`
  contains mangled nested bullets (`- - Beautiful Shadows Skill`, `- - Shadow: Beautiful sm …`),
  i.e. machine-generated content shipped unreviewed.

**[I]** The library grew faster than its gate. Mechanism M2 is excellent and its enforcement is
theatre — precisely the failure DESIGN:OS's own `CLAUDE.md` names ("A report is not evidence.
Re-run the gate yourself, where it actually runs"). Any adoption must land the gate **in CI on day
one**, or DESIGN:OS inherits the same drift.

---

## 3. Gap analysis vs DESIGN:OS

### 3.1 Where DESIGN:OS is already ahead (do not import) **[F]**

| Dimension | DESIGN:OS | MengTo/Skills |
|---|---|---|
| Taste model | `knowledge/taste-rubric.md` — 6 axes + Consistency, 0–10 per axis, critique-gate thresholds (476 lines) | prose adjectives per style card |
| Persona system | 26 personas with full DNA (`knowledge/personas/*.md`, `personas.json`) + auto-selection algorithm (`knowledge/persona-index.md`) | 79 flat style cards, no selection algorithm, no anti-pattern lists per style |
| Signature moves | `knowledge/signature-devices.md` — 9 devices, each with Principle/When/Mechanism, "one hero device, at most two", a11y-subordinate | style cards stack freely |
| Motion contract | `knowledge/motion-craft.md` T1→T6 ladder + persona tier caps + floors; **150–250 ms UI, 400–800 ms hero, 20–60 ms stagger** (`:165-167`); `knowledge/gsap-motion-direction.md` for T5 | `animation-systems` gives 120–200 / 180–260 / 400–800 / 40–90 ms — overlapping, differently-numbered, unsourced |
| Token model | `knowledge/token-taxonomy.md` — DTCG tiers, alias resolution, `{role}`/`{role}-foreground` pairing, post-compile immutability | `beautiful-shadows` ships raw Tailwind arbitrary-value strings |
| Measured references | `knowledge/benchmarks/*.dna.json` — 8 products, `evidence: "SOURCE"`, per-value use counts (Stripe: `sohne-var` ×1802, `16px` ×206 …) | `source.json` popularity counts (views/favourites/remixes) — engagement, not measured DNA |
| Deterministic gates | `taste-lint`, `layout-lint`, `a11y-lint`, `content-lint`, `ds-usage-lint`, `tenant-lint`, `vr gate`, `knowledge check`, `specimen-check`, `critique-coverage` | one demo validator |
| Doctrine authoring | `knowledge/authoring-standard.md` — file frame, bilateral ALLOWED/NOT-ALLOWED, WHY-with-mechanism, no-hardcoded-counts, `<!-- ease:source ref=… -->` provenance grammar | `README.md` "Writing style: write like Meng To, avoid fluff" |
| Learning loop | evidence ledger with verbatim-substring anti-fabrication gate (`knowledge/user-evidence.md`), librarian veto chain (`knowledge/librarian-loop.md`), spec 018 preregistered controlled trial | none |

### 3.2 Real gaps in DESIGN:OS that MengTo exposes **[F]** (each verified by grep, not assumed)

| Gap | Verification | Severity |
|---|---|---|
| **G1. No unit-level rendered proof.** 26 personas (`knowledge/personas/personas.json`) + 9 signature devices (`knowledge/signature-devices.md`, 9 `###` headings) + the 21-shape macrostructure catalog (`knowledge/page-structures.md:21`) are prose-only. `ui ds preview`/`ds specimen` prove a *project's DS*; `ui vr` guards *change* not *quality* (`knowledge/visual-regression.md:50`); spec 018 proves *whole cases* (3 cases, controlled trial). Nothing renders "device: echo/ghost type" or "persona: graphic-modernist" as one inspectable artifact with a pinned-viewport screenshot. | `grep -rn -i gallery src/ knowledge/ templates/` → only prose hits; `src/core/specimen-check.ts` is a registry variant-matrix checker, not a renderer | **High** — this is the repo's own "standard needs an emitter AND a linter" scar applied to its largest prose surface |
| **G2. Untrusted-HTML intake is unhardened.** `templates/workflows/from-url.md` fetches HTML+CSS via host WebFetch/`curl`/bb-browser and writes raw bytes to `source.html` as an audit trail (`:282`), with no content hash, no CSP/sandbox wrapper, no host allowlist, no SSRF guard, no size cap. Meanwhile `knowledge/authoring-standard.md` §"Quarantining untrusted content" *mandates* quarantine — as prose, with no emitter and no linter. | `grep -n -i -E 'sha256\|csp\|sandbox\|untrusted' templates/workflows/from-url.md` → no hits | **High** — a doctrine with no fence, on a path that ingests arbitrary internet HTML into a design pipeline |
| **G3. No originality-risk procedure.** "originality" appears in DESIGN:OS only as a *ceiling axis label* (`knowledge/world-class-learning-loop.md:15`, `templates/workflows/generate.md:235`). There is no rubric, no evidence hierarchy, no false-positive control list, no history search, no verdict literal — yet DESIGN:OS clones from URLs (`from-url.md`), duels benchmark DNA, and mirrors Figma files. | `grep -rn -i -E 'originality\|plagiar' knowledge/ templates/` → 2 hits, both axis labels | **High** — legal/reputational exposure with zero procedure |
| **G4. No example-prompt packaging per knowledge unit.** Nothing in `templates/` or `knowledge/` carries a minimal/recreate/remix prompt triad, so there is no copy-pasteable, testable invocation per doctrine unit. | `grep -rn -i -E 'minimal prompt\|example prompt\|remix' templates/ knowledge/` → **0 hits** | Medium |
| **G5. No motion-reference (temporal) intake.** Reference intake handles URLs and images (`knowledge/figma-craft/workflow-experience.md`); `ffmpeg`/`ffprobe` appear only in `knowledge/motion-craft.md` and spec 021 (which *produces* video). A reference whose value is its *choreography* cannot be ingested as evidence. | `grep -rln -E 'ffmpeg\|ffprobe' knowledge/ src/ templates/` | Medium |
| **G6. No section-crop evidence discipline.** `knowledge/delivery-assets.md` governs *asset* resolution and lints `avoidable-screenshot-crop`; nothing governs *evidence* crops (contiguity against one full-page capture, settle-wait before capture, crop coordinates in a manifest not in prose). | reading `knowledge/delivery-assets.md` + `knowledge/README.md:41` | Low–Medium |
| **G7. Selection-table + explicit ownership boundaries.** `knowledge/README.md` has a strong Task→files map; `templates/skills/` (9 files) and `templates/workflows/` (15 files) have no equivalent need→artifact router or "who owns which decision" boundary list. | `ls templates/skills templates/workflows` | Low |

---

## 4. Integration map — Adopt / Adapt / Experiment / Reject

Every row: evidence path → DESIGN:OS target → benefit → risk → verification gate.
No row implies a commit; all are proposals for the owner.

### 4.1 ADOPT (take the pattern nearly as-is; low risk, low cost)

| # | Item | Evidence (MengTo) | Target (DESIGN:OS) | Benefit | Risk | Verification gate |
|---|---|---|---|---|---|---|
| A1 | **Need→artifact selection table + explicit ownership boundaries** | `agent-skills/game-development/README.md` (`\| Need \| Start with \|` + "Important boundaries") | `templates/README.md` and/or a new `## Skill → job` block in `knowledge/README.md` | Kills sprawl by naming which artifact owns which decision; makes 15 workflows + 9 skills routable in one glance | Table rots; a hardcoded count would violate `authoring-standard.md` §"No hardcoded counts in prose" | `ui knowledge check` — extend `index-missing-row` so every `templates/workflows/*.md` and `templates/skills/*.md` has exactly one router row (count enforced by the check, never written in prose) |
| A2 | **`REFERENCES.md` / `ARTICLE.md` / `references/*.md` separation** | `README.md` folder contract; 27 `REFERENCES.md`; `codex/performance-profiling/references/*` (4 deep-dives loaded on demand) | `templates/skills/*.md`, `templates/workflows/*.md` | Keeps the loaded context procedural; `knowledge/ux-psychology.md` is 1116 lines and is already read selectively — this generalises the discipline | Fragmentation; extra files to link-check | `ui knowledge check` link-check (`src/core/knowledge-link-check.ts`) already exists — extend to the new file kinds |
| A3 | **Non-visual proof via `input.md` / `expected-output.md`** | 13 pairs, required for `codex/` category by `scripts/validate-skill-demos.mjs` | `templates/workflows/*` that produce reports not pixels (`why.md`, `evidence.md`, `critique.md`) | A workflow with no screenshot still gets falsifiable proof — closes the "prose workflow, no evidence" hole without demanding a render | Fixtures drift from behaviour | Assert the pair exists **and** is regenerable: a vitest case runs the workflow's deterministic steps and diffs against `expected-output.md` |

### 4.2 ADAPT (steal the mechanism, rewrite for DESIGN:OS invariants)

| # | Item | Evidence (MengTo) | Target (DESIGN:OS) | Benefit | Risk | Verification gate |
|---|---|---|---|---|---|---|
| **D1** | **Unit-level rendered proof + gallery + validator** (→ Brief #1) | `scripts/validate-skill-demos.mjs` @ `6b4f314`; `DEMOS.md`; `SCREENSHOTS.md`; `SCREENSHOTS.html`; `demo/preview.jpg` 2 %-drift check | new `ui knowledge proof` (emitter/index) + new checks in `ui knowledge check`; specimens under `knowledge/proof/<unit-slug>/`; renders via existing host-render + `ui vr` capture path | Turns 26 personas + 9 devices + the page-shape catalog from prose into falsifiable artifacts; every specimen is run through the **full** linter set, closing the repo's own "3 of 4 linters" scar | Proof-set becomes a maintenance tax; screenshots bloat git; a specimen could enshrine the bug (`ds-round-trip.test.ts` scar) | (a) `ui knowledge check` fails on any unit without a specimen + index row; (b) every specimen must pass `taste-lint` **and** `layout-lint` **and** `a11y-lint` **and** `content-lint`; (c) renders gated by `ui vr gate` at one pinned viewport; (d) **CI on day one**; (e) one existing device specimen must be shown to *fail* the gate when its device is removed (a gate that cannot fail is theatre) |
| **D2** | **Hardened untrusted-source intake** (→ Brief #2) | `scripts/sync-neuform-skill-demos.mjs` + `scripts/test-sync-neuform-security.mjs` @ `4dd0ae1`: `isBlockedIp`, `assertSafeRemoteUrl`, `manifestUrl` token-strip, `hasExpectedMagic`, 5 MB caps, 4-stage hash chain, CSP `default-src 'none'` srcdoc sandbox, content-hashed runtime vendoring | `templates/workflows/from-url.md` §8.3 + new `src/core/` module (`intake-manifest.ts`) + `ui intake verify`; makes `knowledge/authoring-standard.md` §Quarantining executable | Gives the quarantine doctrine an emitter and a linter; makes every cloned source re-verifiable by hash; contains any fetched script that gets previewed | Over-engineering a design tool; DNS-resolve + allowlist may block legitimate sources and push users to bypass; **the binary must not fetch** (Art I: no network in `ui`) | Hard boundary: **host fetches, `ui` only verifies** — `ui intake verify <dir>` recomputes `sha256` over `source.html`+assets, checks the manifest, and FAILs on a missing/mismatched hash. Unit tests must mirror MengTo's security test: metadata IP, loopback, private ranges, IPv6 ULA, non-HTTPS, non-allowlisted host, `?token=` stripping. A preview wrapper must be CSP-asserted by test. |
| **D3** | **Originality-risk gate** (→ Brief #3) | `agent-skills/codex/audit-reference-originality/SKILL.md` @ `2c8b27c`; `references/audit-rubric.md` (evidence hierarchy, severity, false-positive controls, report schema, fix patterns); `scripts/build_evidence_inventory.py` (423 lines, stdlib-only, git-history search) | new `knowledge/originality-risk.md` (authored to `authoring-standard.md`) + `ui originality inventory` (deterministic: hashes, normalised-text shingles, repeated-number tokens, `git log -S` history) + a curator step in `knowledge/figma-craft/curator.md` | Fills G3 on the exact paths DESIGN:OS already runs (from-url clone, benchmark duel, Figma mirror); the two-evidence rule + false-positive list prevent the "grep-sized reads manufacture false findings" failure the repo has already scarred on | Weaponised into a blocker on legitimate common grammar; agents self-assigning severity (repo scar: "không tự phong severity"); implying legal conclusions | Verdict literals mirroring house style, including **`BLOCKED-BY-MISSING-EVIDENCE`** (never an implied pass); every finding must cite **two** reproducible locations or it is dropped; the false-positive control list is a **test fixture** — a corpus of legitimately-similar pages must produce zero findings; the binary emits **leads**, the curator assigns severity, the human decides release |
| D4 | **Prompt triad per knowledge unit, house-flavoured** | 92 `demo/PROMPT.md` with `## Minimal prompt` / `## Recreate the demo` / `## Remix prompt`, ≥120 words, validator-enforced | one `PROMPT.md` per D1 proof unit, under `knowledge/proof/<unit>/` | Every doctrine unit gets a copy-pasteable invocation and a remix contract that explicitly preserves a11y/responsive/perf while changing brand — the exact separation `knowledge/prompt-modes.md` (replicate/enhance/adapt) reasons about but never packages | Prompt rot; prompts read as marketing | Reuse the mechanism, **drop `$slug`** (see R6). Gate: heading presence + word floor + `ui content-lint` clean + the remix prompt must name the preserved contract (a11y, responsive widths 390/768/1440 per `generation-craft-defaults.md`, motion floors) |
| D5 | **`prefers-reduced-motion` presence as a structural gate on generated artifacts** | validator line: non-`codex` demos fail without `prefers-reduced-motion` | extend `specimen`/proof gate; cross-check `src/core/taste-checks-motion.ts` (`animation-no-reduced-motion` already exists as an error) | Cheap belt-and-braces on the new proof surface | Duplicate of an existing check | Confirm `animation-no-reduced-motion` fires on the new specimen path; if it does, **do not add a second check** — record the confirmation and move on |
| D6 | **Content-hashed vendored runtime** | `assets/runtime/runtime-<hash12>-<lib>.js` + `original_url` + `sha256` in `source.json`; 9 files, 0 duplicates | proof-specimen assets under D1; `knowledge/delivery-assets.md` provenance ladder | Self-contained specimens with zero network at render time, deduped by content, each traceable to its origin URL | Repo weight (MengTo carries 1.8 MB for 9 libs; their `web-design` folder is 75 MB) | A byte budget enforced by the proof gate (e.g. total proof assets ≤ N MB, per-asset ≤ 1 MB); prefer CSS/inline over vendoring a library at all — most personas and devices need no JS |

### 4.3 EXPERIMENT (time-boxed, kill by default)

| # | Item | Evidence (MengTo) | Target | Benefit | Risk | Kill criterion |
|---|---|---|---|---|---|---|
| E1 | **Motion-reference intake** (`ffprobe` + beat-based frame extraction → structured motion DNA, not prose) | `codex/video-to-superprompt/SKILL.md` (+ `references/superprompt-template.md`) | a `motion.dna.json` sibling to `knowledge/benchmarks/*.dna.json`, consumed by `knowledge/motion-craft.md` + `gsap-motion-direction.md` | Fills G5; DESIGN:OS grades motion but cannot *measure* a reference's choreography | Frame-extracted "motion DNA" is inference dressed as measurement — the repo's benchmarks are `evidence: "SOURCE"`, this would not be | One 2-hour run on **one** real reference. Kill unless the output is machine-readable, reproducible from the same input, and honestly labelled a lower evidence tier than `SOURCE`. |
| E2 | **Contiguous section-crop evidence contract** | `codex/html-to-interaction-prompts` ("full-page image is the source of truth"; contiguous crops; `y-start`/`y-end` in `manifest.json`; 2 s settle wait; actuate interactions before capture) | `templates/workflows/from-url.md` capture step + `knowledge/delivery-assets.md` | Makes probe evidence auditable and kills the "arbitrary viewport screenshot as section proof" cheat; the 2 s settle rule is a real anti-flake finding | Ceremony on a path that already works; overlaps VR baseline discipline | One from-url run on a lazy-loading, animated real site. Kill unless crop contiguity or the settle-wait catches an actual evidence defect. |
| E3 | **`audit-verify-explain-grade-5` plain-language explanation layer** | `agent-skills/codex/audit-verify-explain-grade-5/SKILL.md` | the channel-A host summary described in memory `tui-output-channel-a-b` | Owner-facing verdicts in plain language without touching channel B (raw stdout) | Dumbing down a technical gate; two voices for one verdict | One `ui audit` run rendered both ways. Kill unless the owner prefers it. |

### 4.4 REJECT (with reasons — these are the load-bearing "no"s)

| # | Rejected | Why | Evidence |
|---|---|---|---|
| R1 | **Bulk import of the 79 `web-design/` style cards** | Skill sprawl + direct shadowing: DESIGN:OS already owns aesthetics via 26 personas with anti-pattern lists and a selection algorithm, plus 9 composable devices with an explicit "one hero, at most two" rule. 79 flat cards with no composition rule invites the exact smear `signature-devices.md` forbids. Also freezes taste as truth. | `knowledge/persona-index.md`, `knowledge/signature-devices.md` (Mental Model) vs `agent-skills/web-design/` (79 dirs, no composition contract) |
| R2 | **`animation-systems` numeric bands** | Duplicative **and** conflicting: MengTo says micro 120–200 ms, stagger 40–90 ms; DESIGN:OS says UI 150–250 ms, stagger 20–60 ms — and DESIGN:OS's are sourced against measured benchmarks and enforced by `taste-checks-motion.ts`. Importing a second unsourced band set creates two truths for one gate. | `knowledge/motion-craft.md:165-167` vs `agent-skills/web-design/animation-systems/SKILL.md` |
| R3 | **`beautiful-shadows` Tailwind arbitrary-value strings** | Violates the token contract: raw `shadow-[0px_0px_0px_1px_rgba(...)…]` literals bypass the DTCG primitive/semantic tiers and the post-compile immutability rule; DESIGN:OS's shadow truth is measured per-product in `benchmarks/*.dna.json`. Adopting the *idea* of a 6-layer elevation ramp is fine; adopting the strings is not. | `knowledge/token-taxonomy.md`; `agent-skills/web-design/beautiful-shadows/SKILL.md` |
| R4 | **`media/aura-asset-images` + `unsplash-asset-images`** | Couples a deterministic, zero-dependency binary to third-party accounts and paid asset services. `generation-craft-defaults.md` already fixes the asset ladder (project asset → approved source → generated → intentional no-image, Phosphor/SVGL/GPT Image 2) and states the binary "never fetches or generates assets". | `knowledge/generation-craft-defaults.md:30-52`; `agent-skills/media/*/SKILL.md` |
| R5 | **All 17 `game-development/` skills** | Out of product scope. (Their `test-playable-web-games` "do not treat a green build as gameplay proof" framing is a *good sentence*, and DESIGN:OS already carries the equivalent as a hard-won rule — no import needed.) | `agent-skills/game-development/README.md`; `CLAUDE.md` "Hard-won rules" |
| R6 | **The `$slug` trigger convention** | Hard-codes one runtime's invocation grammar into portable knowledge. DESIGN:OS is explicitly multi-runtime with generated per-runtime adapters (`src/adapters/`, `ui init`). Adopt the prompt *triad*, express invocation via the adapter layer. | `CLAUDE.md` (runtime-neutral stub); `scripts/validate-skill-demos.mjs` (`$` + slug assertion) |
| R7 | **The 38 Neuform-sourced `demo/index.html` files** | Provenance is recorded (`source.json`: design id, url, `original_sha256`), but these are **third-party generated pages from `neuform.ai`** redistributed inside an MIT repo with no statement of Neuform's own licence. The repo's MIT grant covers Meng To's copyright, not neuform.ai's content. Reusing these files is an unquantified licence risk; the *pipeline* that hardened them (D2) is the asset worth taking. | `agent-skills/web-design/beautiful-shadows/demo/source.json`; `LICENSE`; `DEMOS.md` ("Neuform-sourced demos preserve the real generated HTML") |
| R8 | **`write-like-meng-on-x`** (+ `references/tweet-corpus.jsonl`, `voice-profile.md`) | A named individual's personal voice corpus. DESIGN:OS's voice surface is `knowledge/content-design.md` + the owner-ratified `design/soul.md`. Importing another person's voice model into a taste system is both a provenance and an identity error. | `agent-skills/codex/write-like-meng-on-x/references/` |
| R9 | **`agents/openai.yaml` as a file format** | The *idea* (a per-runtime interface manifest with display name, ≤64-char summary, default invocation) is right and DESIGN:OS already solves it better — generated adapters via `ui init`, `src/adapters/`, `src/core/adapter-lint.ts`. Adding a hand-maintained YAML per unit would be a second, drift-prone source of truth. **Confirm coverage; do not add the file.** | `src/adapters/`, `src/core/adapter-lint.ts` vs 54 `agents/openai.yaml` |
| R10 | **Copying the library's maintenance posture** | 32 skills with no demo, a `DEMOS.md` claim that is false at HEAD, no CI. If the proof set (D1) ships without a CI gate, DESIGN:OS reproduces this exact drift at larger scale. | `node scripts/validate-skill-demos.mjs` output; `ls -a .github` |

---

## 5. Top-3 by ROI — implementation briefs

These are **briefs, not implementations**. Nothing here has been built. Each is scoped so a
Sonnet-tier builder can execute against a spec an Opus-tier writer produces first (house pipeline).
Each names its own falsification condition.

---

### Brief #1 — `ui knowledge proof`: unit-level rendered proof for the knowledge core

**Fills:** G1. **Adapts:** M2 (+ M4 via D4, M6 via A1). **ROI rationale:** the largest prose surface
in the repo (26 personas + 9 devices + the page-shape catalog) currently has *zero* per-unit
rendered evidence, while the repo's own doctrine says a standard needs an emitter and a linter and
that generated artifacts must run the **full** linter set. Cost is one Node emitter + N specimens;
payoff is that every taste claim becomes falsifiable.

**Scope (in):** signature devices first (9 units — smallest, most visual, most falsifiable), then
personas (26), then page shapes. **Scope (out):** components (already covered by `ui ds specimen` +
`src/core/specimen-check.ts`), whole-page cases (spec 018 owns those), VR baselines for project
work (`ui vr` owns those).

**Proposed layout**

```txt
knowledge/proof/<unit-slug>/
  index.html      # self-contained specimen: one device or persona, no build step, no network
  PROMPT.md       # D4 triad: Minimal / Recreate / Remix
  meta.json       # { kind: "device"|"persona"|"page-shape", unit, knowledgeRef, viewport, assets[] }
knowledge/proof/INDEX.md      # generated: one row per unit → specimen · knowledge section · render
```

**Deliverables**

1. `src/core/knowledge-proof.ts` — pure: parse `meta.json`, resolve `knowledgeRef` to an existing
   heading in the referenced knowledge file, enumerate units from the knowledge source (**never a
   hardcoded count** — `authoring-standard.md` §No-hardcoded-counts), compute index rows.
2. `src/commands/knowledge-proof-impl.ts` + a `ui knowledge proof` subcommand: `--check` (default,
   fails on gaps) and `--index` (regenerate `INDEX.md`). The binary **never renders and never
   fetches** — the host renders (Art I / the constitutional split stated in
   `knowledge/visual-regression.md`).
3. New checks wired into `ui knowledge check`: `proof-missing-unit`, `proof-orphan-specimen`,
   `proof-index-drift`, `proof-bad-knowledge-ref`.
4. Structural specimen checks, ported from `validate-skill-demos.mjs`: doctype, `lang`, viewport
   meta, non-empty `<title>`, `<main>`, **exactly one `<h1>`**, no remote URL, every local ref
   resolves inside the unit folder, no `/Users/` or `file://`, no email, inline `<script>`
   syntax-checked via `node:vm`, per-asset and total byte budget.
5. Render + gate wiring: host renders each specimen at **one pinned viewport** (reuse the from-url
   convention `1280×800`, or `1440×900` to match `benchmarks/*.dna.json` `viewport` — pick one and
   pin it in the spec); `ui vr gate` compares against committed baselines; capture environment
   pinned per `knowledge/visual-regression.md:19-20`.
6. **CI job on day one** (`.github/workflows/`): `ui knowledge proof --check` + the full linter set
   over `knowledge/proof/**` + `ui vr gate`.

**Verification gate (all must hold before it lands)**

- Every enumerated unit has a specimen and an index row, or the check fails.
- Every specimen passes **all four** of `taste-lint`, `layout-lint`, `a11y-lint`, `content-lint`
  (the "3 of 4 linters" scar, explicitly).
- **Falsification proof:** delete the device from one specimen (e.g. remove the ghost layers from
  `echo-ghost-type/index.html`) and show the gate goes red. A gate that cannot fail is theatre —
  this is a required artifact of the task, not an optional nicety.
- Byte budget enforced; `git` growth reported in the PR body.
- The 2 %-dimension-drift idea from M2 is expressed as: all baselines share one pinned viewport;
  any deviation fails.

**Risks & mitigations**

- *Specimen enshrines the bug* (`ds-round-trip.test.ts` scar) → every specimen's `meta.json` cites
  the `knowledgeRef` heading, and the reviewer checks the specimen against the prose, not the
  reverse.
- *Maintenance tax* → start at 9 devices. Do not expand to personas until the 9 have survived one
  real knowledge edit.
- *Screenshot bloat* → baselines are the only PNGs; budget them and report growth.

**Definition of done:** 9 device specimens + index + CI green + one demonstrated red gate + a
`CHANGELOG.md` entry (post-merge protocol: USER-VISIBLE at minimum).

---

### Brief #2 — Hardened untrusted-source intake for `from-url` (host fetches, `ui` verifies)

**Fills:** G2. **Adapts:** M3. **ROI rationale:** `authoring-standard.md` already *mandates*
quarantining untrusted content; the from-url path already ingests arbitrary internet HTML+CSS and
writes it into the project tree. The doctrine has no fence. MengTo has a working, unit-tested
fence, and porting the *verification* half stays inside Art I (no network in the binary).

**Hard architectural boundary (non-negotiable):** the **host** fetches (WebFetch / `curl` /
bb-browser MCP, exactly as `from-url.md:54-99` already specifies). The **binary** only verifies,
hashes, and lints. `ui` gains no network code.

**Deliverables**

1. `src/core/intake-manifest.ts` — pure. Defines and validates `intake.json`:
   ```json
   {
     "version": 1,
     "source": { "url": "…", "fetchedAt": "…", "fetchPath": "webfetch|curl|bb-browser" },
     "html": { "file": "source.html", "sha256": "…", "bytes": 0 },
     "assets": [{ "file": "…", "originalUrl": "…", "sha256": "…", "bytes": 0, "kind": "css|image|font|script" }],
     "securityProfile": "quarantined-v1"
   }
   ```
   Functions: `computeManifest`, `verifyManifest` (recompute every hash, FAIL on mismatch/missing),
   `stripSecrets(url)` (port of `manifestUrl` — drop query + fragment), `assertAllowedOrigin(url,
   allowlist)`, `isBlockedIp(ip)` (port: loopback, `169.254.0.0/16`, RFC1918, `::1`, `fd00::/8`),
   `hasExpectedMagic(bytes, kind)`, size caps (HTML and per-asset; default 5 MB, configurable).
2. `ui intake verify <dir>` — recompute and compare; report per-file `ok|mismatch|missing`; exit
   non-zero on any failure. Also `ui intake manifest <dir> --emit` to produce `intake.json` from
   what the host already fetched.
3. `templates/workflows/from-url.md` edit: step 8.3 additionally writes `intake.json`; a new step
   runs `ui intake verify` and the run-summary records the security profile and the hash of
   `source.html`. **`from-url.md` currently records only the fetch path** — hashes make the audit
   trail re-verifiable months later.
4. `knowledge/authoring-standard.md` §Quarantining gains a pointer to the executable fence (the
   doctrine keeps the prose; it stops being prose-only).
5. **Preview containment**: if any workflow previews fetched HTML locally, wrap it exactly as M3
   does — a CSP `default-src 'none'` shell injecting the page into a sandboxed `srcdoc` iframe,
   assets handed in as blob URLs. Assert the CSP by test, not by eye.

**Verification gate**

- Unit tests mirroring `scripts/test-sync-neuform-security.mjs`, asserting **rejection** of:
  `http://` (non-HTTPS), `https://localhost/…`, `127.0.0.1`, `169.254.169.254`, `10.0.0.1`,
  `192.168.1.4`, `::1`, `fd00::1`, a non-allowlisted host; and asserting `?token=secret` is stripped
  from anything recorded.
- A tamper test: mutate one byte of `source.html` → `ui intake verify` FAILs (this is the
  `DS_TAMPERED` pattern the repo already trusts).
- One **real** from-url run end-to-end (repo rule: every phase budgets one run on real data).
- Determinism preserved: `npm run typecheck && lint && build && test` green; no new dependency
  (all of it is `node:crypto` + `node:net` + `node:dns` — MengTo proves it needs nothing else).

**Risks & mitigations**

- *Allowlist becomes a wall users route around* → allowlist governs **automated asset fetches and
  previews**, not the primary page the user explicitly asked for; an off-allowlist origin is a
  recorded WARN with a named override, never a silent pass.
- *Scope creep into a security product* → the deliverable is a manifest + verifier + CSP preview
  wrapper. Nothing else.

---

### Brief #3 — Originality-risk gate (`knowledge/originality-risk.md` + `ui originality inventory`)

**Fills:** G3. **Adapts:** M8. **ROI rationale:** DESIGN:OS clones from URLs, mirrors Figma files,
and duels measured benchmark DNA, while scoring "originality" as a ceiling axis with **no
procedure**. MengTo ships the missing procedure: an evidence hierarchy, a false-positive control
list, a two-location citation rule, git-history search, and a `BLOCKED-BY-MISSING-EVIDENCE` verdict.
This is the cheapest large reduction in legal/reputational exposure available.

**Deliverables**

1. `knowledge/originality-risk.md`, authored to `authoring-standard.md` (Purpose → Mental Model →
   When to Use/NOT → Content → **Failure Modes mandatory**), carrying:
   - the 6-level evidence hierarchy, with the explicit split that levels 1–4 can carry a
     high-confidence flag and 5–6 require caveats;
   - severity ladder mapped to house verdict literals, **with the sentence "severity is not a legal
     conclusion"** and the standing rule that the model never claims plagiarism from resemblance;
   - the **false-positive control list** (black+white, one accent, large sans type, the standard
     hero→work→services→pricing→FAQ→footer order, fade/slide/marquee/parallax, common icon
     libraries, same framework) — bilateral ALLOWED / NOT-ALLOWED per `authoring-standard.md`;
   - the two-evidence-location rule (current artifact **and** reference artifact, both reproducible:
     file+line, URL+section, asset path+hash, or video frame);
   - the eight categories (text, brands, numbers, images, assets, videos, structure+motion,
     **history**);
   - `<!-- ease:source ref="…" -->` provenance markers per the house grammar.
2. `src/core/originality-inventory.ts` + `ui originality inventory --site <dir> --reference <path…>`
   — deterministic, pure, no network, no model call: sha256 exact-file matches (current **and**
   historical blobs via `git log --all --name-status` / `git log -S`), suspicious basename reuse,
   normalised-text shingle overlap, repeated distinctive-number tokens. Output is **leads**, and the
   output schema must say so.
3. A curator step in `knowledge/figma-craft/curator.md`: the curator (never the designer) assigns
   severity from the leads + the rubric; the human decides release.

**Verification gate**

- **False-positive corpus test:** a fixture of two legitimately-similar-but-independent pages
  (same generic grammar, different identity/content/assets) must yield **zero** findings. This is
  the check that keeps the gate from becoming a nuisance — and it is the direct answer to the repo
  scar "grep-sized reads manufacture false findings".
- **True-positive fixture:** a page with a verbatim copied headline + an identical asset byte-match
  + a renamed historical copy must produce three findings at the right severities, each with two
  cited locations.
- Any finding lacking two reproducible locations is **dropped by the tool**, not reported.
- `BLOCKED-BY-MISSING-EVIDENCE` is exercised by a fixture where a promised reference is absent —
  and it must never render as a pass.
- Role boundary asserted: the binary emits leads with no severity field; severity exists only in the
  curator's report.

**Risks & mitigations**

- *Agent self-assigns severity* (recorded scar) → schema-level: leads carry evidence, not severity.
- *Legal overreach* → the "not a legal conclusion" sentence is in the knowledge file **and** in the
  report template.
- *Blocking legitimate work* → default verdict on level-5/6-only evidence is `Low` with a
  documented distinction, never a blocker.

---

## 6. Risks — consolidated

**Legal / provenance**

- **[F]** MIT covers Meng To's copyright only. 38 demos embed generated pages from `neuform.ai`
  (`source.json` names the design id, URL and original hash); the repo states no licence for that
  content. → **Do not reuse those HTML files** (R7). Mechanisms and prose written by Meng To are
  MIT-clean.
- **[F]** `assets/runtime/*` vendors GSAP, ScrollTrigger, Draggable, Three.js, Iconify, and the
  Tailwind CDN runtime by content hash with `original_url` recorded — each carries its own upstream
  licence, and GSAP ships under GreenSock's own licence terms rather than MIT. (Note the distinction
  from `knowledge/README.md:17`, where the *GSAP skill suite* DESIGN:OS adapted is MIT — that says
  nothing about redistributing the library bundle.) → If D6 is taken, record the licence next to the
  hash, not just the URL, and vendor nothing the house has not already cleared.
- **[F]** `write-like-meng-on-x/references/tweet-corpus.jsonl` is one person's authored corpus (R8).

**Security**

- **[F]** MengTo's own intake pipeline is the *defence*, not the threat; the threat model it
  encodes (SSRF to `169.254.169.254`, tokens leaking into committed manifests, unbounded fetches,
  arbitrary inline script executing in a previewed page) is exactly DESIGN:OS's current from-url
  exposure. **[I]** DESIGN:OS's mitigating factor today is that from-url writes bytes rather than
  executing them — but any local preview of `source.html` removes that mitigation.
- **[F]** Their demos rely on `unsafe-inline` script inside the sandbox. Acceptable there because
  `default-src 'none'` + `srcdoc` isolation; **[R]** do not copy `unsafe-inline` into any DESIGN:OS
  page that is not equally isolated.

**Dependency / portability**

- **[F]** Everything portable is dependency-free Node ESM (`node:vm`, `node:crypto`, `node:dns`,
  `node:net`) or Python stdlib — a genuinely good fit for DESIGN:OS's zero-dependency posture.
- **[F]** Non-portable couplings to avoid: `ffmpeg`/`ffprobe` binaries (E1 only), the Codex in-app
  browser, Aura/Neuform/ElevenLabs accounts, the `$slug` convention, and `skill-creator`'s
  `quick_validate.py` — `article-prompts-to-skills` §4 and §7 require the "installed `skill-creator`
  initializer" and that script, and neither exists anywhere in the repo (`find . -name
  'quick_validate*'` → 0) **[F]**. That skill therefore cannot be executed as written from a clean
  clone; treat its *contract* as the reusable part.

**Maintenance**

- **[F]** 136 MB repo, 75 MB in one category, 253 JPEGs, 32 skills failing the gate, no CI. The
  proof-set pattern (D1) has a real cost curve; MengTo demonstrates what happens when it is not
  budgeted. → Byte budgets, start at 9 units, CI from commit one, and report git growth in the PR.

**Process (house-specific)**

- **[I]** Three high-value adaptations touching `src/core/`, `templates/workflows/`, `knowledge/`,
  and CI is a COMPLEX-domain body of work — not one task. Each brief should be its own
  `specs/NNN-slug` with its own gates; running them as one pipeline invites the "invented instead
  of following" failure the owner has already had to stop twice (memory:
  `mechanical-vs-fundamental-before-pivot`).

---

## 7. Anti-patterns to avoid (explicit answer to Q7)

1. **Copy the whole library.** 121 skills, 83 MB, 79 style cards that shadow the persona system.
   The value is ~4 mechanisms. Import mechanisms; leave content.
2. **Skill sprawl.** Every new unit must answer "which existing artifact already owns this
   decision?" — and the answer must be visible in a router table with explicit ownership boundaries
   (A1), the way `game-development/README.md` does it. Without the boundary section, a router table
   is just a longer list.
3. **Turning taste into deterministic truth.** MengTo's style cards hard-code aesthetics
   (`shadow-[0px_2px_3px…]`, "use 01/02/03 markers"). DESIGN:OS's split — deterministic binary for
   math and structure, prose knowledge + scored rubric for taste — must hold. A linter may check
   *whether* a device is present and whether it respects the a11y floor; it must never assert that
   the device is *correct taste*.
4. **Hard-coding model or runtime routing.** No `$slug`, no "Fable 5 can one-shot this", no
   `gpt-image-2`-shaped assumptions baked into knowledge. Model choice lives in the orchestration
   layer; runtime invocation lives in generated adapters.
5. **Making the owner the bottleneck.** These briefs must produce *machine* gates (checks, fixtures,
   CI), not "owner eyeballs 26 specimens". Owner judgment belongs at the release decision (severity
   in Brief #3, baseline acceptance in Brief #1), not at per-unit inspection.
6. **Shipping a standard without its fence** — and its inverse, **shipping a fence that cannot
   fail.** MengTo has both failure modes at once: a validator that enforces beautifully and never
   runs, guarding a claim ("every skill has a demo") that is false. Every brief above therefore
   requires a demonstrated red gate plus CI wiring as part of *done*.
7. **Trusting a report over a re-run.** `DEMOS.md` says every skill has a demo; the gate says 109
   issues. This report re-ran the gate. Any agent acting on this report should re-run the commands
   cited here rather than trusting the numbers.
8. **Grep-sized reads manufacturing findings.** Each gap in §3.2 was verified by a negative grep
   over the actual target files, and each rejection cites the DESIGN:OS sentence that already
   decided the question. Do not add a "gap" without doing the same.

---

## 8. Phased rollout — 30 / 60 / 90

Sequenced so each phase produces one falsifiable artifact and can be abandoned without stranding
the next. All of it is proposal; nothing is scheduled without owner approval.

**Days 0–30 — one mechanism, proven end to end (Brief #1, devices only)**

- Spec `specs/NNN-knowledge-proof/` (Opus writes; COMPLEX-adjacent → architecture pass first).
- Build `ui knowledge proof --check/--index` + the ported structural checks.
- Author **9** signature-device specimens + `PROMPT.md` triads + `INDEX.md`.
- Wire CI: proof check + all four linters over `knowledge/proof/**` + `ui vr gate`.
- **Exit criterion:** CI green **and** one demonstrated red gate (device removed → fail).
  **Abort criterion:** if a specimen cannot be authored without vendoring JS, the device set is the
  wrong starting surface — stop and re-pick, do not vendor.
- Also land A1 (router table + boundaries) and A2 (references/article split) — cheap, independent.

**Days 31–60 — close the security gap (Brief #2)**

- `intake-manifest.ts` + `ui intake verify` + the security unit-test suite (ported assertions).
- `from-url.md` writes and verifies `intake.json`; run **one real from-url** on a live site.
- CSP srcdoc preview wrapper, asserted by test, if any preview path exists.
- Point `authoring-standard.md` §Quarantining at the fence.
- **Exit criterion:** tamper test fails, all rejection cases pass, one real run recorded.
- Optionally run **E2** (section-crop contiguity) inside that same real run — it is the same
  capture step, so the experiment is nearly free here.

**Days 61–90 — the judgment gate (Brief #3) + expand proof**

- `knowledge/originality-risk.md` + `ui originality inventory` + both fixture corpora
  (false-positive corpus first — if it cannot be made to return zero, the gate is not ready).
- Curator step wired into the SEE lifecycle.
- Expand Brief #1 from 9 devices to the 26 personas **only if** the device proof-set survived a real
  knowledge edit without rotting.
- Run **E1** (motion-reference intake) as a strictly time-boxed spike; kill by default.
- Reflect: at most **one** durable lesson recorded (house rule), most likely about proof-set cost
  curves or about untrusted-intake hardening — not both.

**Not scheduled:** any import of style cards, media skills, game skills, `$slug`, `openai.yaml`
files, or Neuform demo HTML.

---

## 9. Final recommendation

**Integrate three mechanisms; import almost no content.**

MengTo/Skills is best read as a **proof-and-provenance engineering repo wearing a design-library
costume**. Its design opinions are a step down from what DESIGN:OS already carries and in two cases
(motion bands, Tailwind shadow literals) would create competing truths inside gates DESIGN:OS
already enforces. Its **engineering patterns** — per-unit runnable proof with a fixed-viewport
screenshot and a zero-dependency validator; a hash-and-sandbox chain with an SSRF-tested fetch
boundary for untrusted HTML; an evidence-graded originality rubric with false-positive controls and
git-history search — are exactly the three fences DESIGN:OS's own doctrine demands and does not yet
have.

Ranked: **Brief #1 first** (largest prose surface made falsifiable, cheapest to prove, directly
discharges the repo's "emitter AND linter" and "full linter set" scars). **Brief #2 second**
(highest severity per line of code; makes an existing mandate executable without touching Art I).
**Brief #3 third** (highest judgment content, so it needs the other two shipped to be trusted, and
its false-positive corpus is the real work).

One condition applies to all three: **the gate ships with CI and with a demonstrated failure, or it
does not ship.** MengTo's repo is the cautionary proof — a beautiful validator, 109 unaddressed
issues, a false claim in the index, and no CI. Copying the mechanism without the wiring would
reproduce their drift at DESIGN:OS's larger scale.

---

## Appendix A — commands to reproduce this report's evidence

```bash
# Clone (read-only)
git clone https://github.com/MengTo/Skills.git /private/tmp/mengto-skills
cd /private/tmp/mengto-skills && git log -1 --format='%H %ad %s'   # expect 21b278c… 2026-07-25

# Inventory
find agent-skills -name SKILL.md | wc -l                  # 121
find agent-skills -name index.html -path '*/demo/*' | wc -l   # 92
find agent-skills -name openai.yaml | wc -l               # 54
find agent-skills -name source.json | wc -l               # 38
du -sh . .git assets agent-skills                          # 136M / 48M / 4.4M / 83M

# The gate — currently RED
node scripts/validate-skill-demos.mjs                      # "failed with 109 issue(s)"
ls -a .github                                              # no such directory

# Key mechanism files
git log -1 --format='%h %ad %s' --date=short -- scripts/validate-skill-demos.mjs      # 6b4f314 2026-07-18
git log -1 --format='%h %ad %s' --date=short -- scripts/sync-neuform-skill-demos.mjs  # 4dd0ae1 2026-07-23
```

DESIGN:OS-side verifications (read-only, run from `/Users/jangtrinh/Products/ease-design`):

```bash
grep -rn -i -E 'originality|plagiar' knowledge/ templates/          # 2 hits, both axis labels
grep -rn -i -E 'minimal prompt|example prompt|remix' templates/ knowledge/   # 0 hits
grep -n -i -E 'sha256|csp|sandbox|untrusted' templates/workflows/from-url.md # 0 hits
grep -n -E '150–250|400–800|20–60' knowledge/motion-craft.md        # :165-167
grep -c '^### ' knowledge/signature-devices.md                      # 9
node -e "console.log(require('./knowledge/personas/personas.json').length)"  # 26
sed -n '21p' knowledge/page-structures.md                           # "The catalog (21 shapes …)"
```

Per-category counts on the MengTo side were re-derived rather than read off its README:

```bash
cd /private/tmp/mengto-skills
for d in agent-skills/*/; do echo "$(find $d -name SKILL.md | wc -l) $(basename $d)"; done
# 18 codex · 2 customer-support · 19 game-development · 2 media · 1 ui · 79 web-design = 121
du -sh assets/runtime && find assets/runtime -type f | wc -l        # 1.8M · 9
find . -name 'quick_validate*' -not -path './.git/*' | wc -l        # 0
```

## Appendix B — files read in full (audit trail)

**MengTo/Skills:** `README.md`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `DEMOS.md` (head),
`SCREENSHOTS.md` (head), `scripts/validate-skill-demos.mjs`,
`scripts/sync-neuform-skill-demos.mjs` (head 90 + exports),
`scripts/test-sync-neuform-security.mjs` (head 50),
`agent-skills/web-design/{build-awwwards-quality-sites,beautiful-shadows,number-details,animation-systems,gsap}/SKILL.md`,
`agent-skills/web-design/README.md`,
`agent-skills/codex/{article-prompts-to-skills,audit-reference-originality,video-to-superprompt,html-to-interaction-prompts}/SKILL.md`,
`agent-skills/codex/audit-reference-originality/references/audit-rubric.md`,
`agent-skills/codex/audit-reference-originality/scripts/build_evidence_inventory.py` (structure),
`agent-skills/game-development/README.md`, `agent-skills/game-development/test-playable-web-games/SKILL.md`,
`agent-skills/web-design/beautiful-shadows/demo/{PROMPT.md,source.json,index.html (head)}`,
3× `agents/openai.yaml`.

**DESIGN:OS:** `CLAUDE.md`, `package.json`, `knowledge/README.md`,
`knowledge/authoring-standard.md`, `knowledge/generation-craft-defaults.md`,
`knowledge/signature-devices.md` (head 60), `knowledge/motion-craft.md` (numeric bands),
`knowledge/visual-regression.md` (grep), `knowledge/benchmarks/stripe-marketing--202607.dna.json`
(head), `templates/skills/gsap-motion.md`, `templates/workflows/from-url.md` (grep),
`src/core/specimen-check.ts` (head), `src/core/taste-checks-motion.ts` (checkIds),
`src/commands/` + `src/core/` listings, `specs/003-quality-upgrade/spec.md` (head),
`specs/018-improving-proof-benchmark/benchmark-contract.md` (head).
