---
id: ds-kit-onboarding
description: "Build, verify and adopt a complete owner component kit from captured Figma or code inventory, preserving owner identity on React, shadcn and Tailwind."
when: [owner-kit, full-design-system, component-kit, shadcn, inventory-mapping]
---

# From captured design system to a usable owner kit

## Purpose

Build and adopt a complete owner kit from captured Figma or code evidence, then maintain its verified revision.

## When to use / when not

Use this separate authoring stage when the owner asks to **build or adopt their kit**.
Capture-only onboarding ends with portable inventory. A token import or a list of
component names cannot establish an executable kit. Keep the capture and any older
active seal distinct. Read `ui schema --json` and `ui ds kit --help` for the installed
interface before forming commands.

The host authors and runs the components. `ui` only reads local files, checks contracts,
compiles deterministic projections and performs requested adoption. It never installs
dependencies, runs package scripts, calls a model or fetches a Figma library.

## 1. Establish the owner's source and scope

For Figma, follow [the plugin setup and capture guide](figma-ds-onboarding.md) first:
install the Design OS plugin, verify the exact file and instance, pin it, capture and
retain the raw scan plus the successful ingest receipt. Keep returned paths verbatim.
Do not substitute the portable normalized registry for raw node identity. Numbered
names and wide components are not automatically screens. Check remote libraries,
truncated inventories, collection modes and missing variant tuples explicitly.

For code, enumerate the actual public component exports and their implementation
files. Capture a normalized registry and DTCG tokens as local source evidence. Record
which package, revision and directories were examined, including excluded helpers,
private components and external dependencies. A normalized registry declares the
captured scope; it cannot prove that an unseen repository was fully scanned.
A reviewed `scope: "complete"` asserts completeness of that supplied capture
contract, not independent completeness of an external repository or Figma library.

Keep exact owner names, IDs, axis names, options, modes and token values. Resolve
collisions with source evidence; do not invent a suffix, merge similar names or use a
shadcn name as the owner's identity. Distinguish different captures even when their
headline counts resemble each other.

Create a new candidate, leaving the owner project untouched:

```sh
ui ds kit plan --source '<raw scan or normalized registry>' \
  --kind figma --tokens '<portable DTCG tokens>' \
  --out '<new candidate directory>' --name '<owner DS name>' --json
# For a code registry, use --kind registry.
```

The scaffold starts partial and unresolved. Review `kit.json`, source hashes and every
captured ID. An honest partial capture stays partial. Never change it to complete just
to clear a gate. Unsupported or lost tokens/modes need supplementary facts or remain
blockers. All captured items need an explicit disposition; classification is a reviewed
host decision. Icons, screens and evidenced exclusions do not count as implemented
reusable components.

## 2. Build every required component

Load the available `es:designer` skill before authoring or reviewing any rendered UI.
If it is unavailable, use the bundled craft guidance and `knowledge/build-loop.md`.
Load owner soul, tokens, usage rules and relevant component definitions first. Keep
them in each worker packet, including the full inventory beyond the context preview.

For a new web kit, start from explicitly selected shadcn primitives and Tailwind,
then adapt them to the owner's DS. Record provenance and selected primitives.
Reuse sound existing owner code when onboarding a codebase; preserve its established
platform. Components without a matching primitive require real custom implementation
or composition. A mapping label alone does not implement anything.

The scaffold defaults `minimumComponents` to 25 for the starter pilot; this is a
floor, never a coverage cap. For a genuinely smaller owner inventory, explicitly
set `kit.json`'s `minimumComponents` to the reviewed actual reusable count (a
nonnegative integer). Keep the measured count and rationale in source-scope review;
do not lower it to excuse missing mappings. Full captured coverage remains required.

The starter floor never limits source coverage. If the source has 38, 40 or 530
components, account for every one. One component with multiple variants stays one
component. Do not pad a smaller owner inventory or inflate coverage with variant rows,
helper functions, repeated wrappers or fabricated stock components. Record a separately
requested extension as an addition with its own provenance.

For each reusable item, bind its source ID and exact name to:

- Actual implementation file and export, with `reuse`, `adapt` or `custom` strategy.
- Captured variants/states and the required render, review and applicable behavior cases.
- A specimen harness that imports that export and the actual SSR markup it produces.
- Token usage, assets, support files and the dependency/configuration closure.

Do not reconstruct a Cartesian variant matrix from a flat list of options. Bind observed
tuples and defaults from supplementary source evidence. Loading, error, keyboard, focus
and disabled behavior are runtime obligations; an absent Figma state is not evidence
that those behaviors are unnecessary. Document applicability for custom components.

## 3. Preserve tokens and prepare the candidate

Owner variables remain authoritative. Explicit compatibility aliases point from
shadcn/Tailwind consumer names to owner tokens; they do not rename source tokens or
inject a stock palette. The deterministic bridge resolves mode overlays before emitting
CSS and Tailwind v4 aliases. Check selector/default behavior for every required mode;
collection-specific axes need reviewed evidence rather than an assumed global Dark mode.

After editing `kit.json`'s explicit `aliases` or the declared token file:

1. Run `ui ds kit theme '<candidate directory>' --json` and require a successful
   reply. The returned `data.path` is the declared candidate-relative theme path;
   `data.css` is the complete deterministic CSS string.
2. With the host's file-writing tool, write the decoded `data.css` verbatim as UTF-8
   to `<candidate directory>/<data.path>`, replacing only that declared candidate
   theme. Do not write the JSON envelope, add a fence or append a newline.
3. Run `prepare` below after all content edits. Re-emit the theme whenever tokens
   or aliases change; do not manually reproduce `emitKitTheme`.

The theme operation is read-only; it has no `--out` or `--write`. Text mode emits
CSS on stdout, but JSON also identifies the exact destination. `ds context --with-theme`
is ordinary token context, not this alias-and-mode bridge. Read `ui schema --json`
for the installed command contract and the packaged kit schema at `schemas/ds-kit.schema.json`
for the declared token, theme and alias fields.

Bind the closed list of content artifacts in `kit.json`: source captures, tokens, real
component code, theme, exports, package and dependency lock, assets, specimens, SSR
markup and owner guidance. Keep evidence outside the content index to avoid a circular
hash. An undeclared local implementation, symlink or escaping path is a blocker.
All declared paths are candidate-relative portable POSIX paths with exact case;
absolute paths, traversal and case collisions are refused. Bind `package.json`
and `package-lock.json`; the scaffold does not create either. `kit.json` is bound
implicitly. Keep generated `design/`, `dist/`, `node_modules/`, `kit.lock.json` and
`evidence/` outside the content artifacts; these exclusions are not permission to
hide implementation imports. The host verifies the import closure. Use the strict
packaged kit schema at `schemas/ds-kit.schema.json`
for mapping and case fields instead of adding guessed keys.

Version 1 does not bind legacy `figmaNode` sidecars under generated `design/`.
A reusable source record with that pointer remains blocked; retain its raw facts
and resolve the unsupported mirror in a staged capture rather than silently
dropping the pointer. Live `figma reconcile --apply` is refused for an adopted
kit before any writes. Continue capture and authoring in a separate candidate.

```sh
ui ds kit prepare '<candidate directory>' --json
```

Prepare returns structural findings and the content identity. It does not seal or certify
the kit. Fix all required coverage, token, mode and artifact gaps before verification.
Require `data.complete: true` and no findings before recording the final
`data.contentHash` and executing the declared cases. A successful prepare command
can still return incomplete findings; command exit alone is not readiness.

## 4. Execute and bind real evidence

Only within the explicitly authorized kit stage, the host runs the pinned
toolchain against the isolated candidate. Capture-only onboarding and legacy
`/ui:learn` do not authorize executing owner code or package scripts. Typecheck and bundle actual
exports; verify local import closure. Render the real components, not independently
drawn HTML stand-ins. Exercise meaningful keyboard and interaction cases. Follow the
design build loop: inspect screenshots at 375, 768 and 1440 pixels, requested sizes,
mode/state coverage, overflow, focus, targets, contrast and the applicable machine gates.
An independent reviewer checks owner fidelity and custom behavior.

Write `evidence/receipt.json` with version 1, the prepared contentHash and exactly the
declared case IDs. Each case records outcome, local evidence files and a note. Failed,
missing or stale evidence cannot become passed by changing a status string. Reprepare
and rerun affected cases after a content edit. Screenshots and logs must belong to the
final bytes, and component markup must come from the bound implementation.
Each receipt file path must be candidate-relative under `evidence/`, name a
nonempty regular file and never reference the receipt itself. Bind actual build
logs, screenshots, behavior results and independent review findings. Keep actual
SSR markup at the mapping's declared `markup` content path; a render receipt may
reference screenshots/logs in `evidence/`. Follow the strict
packaged receipt schema at `schemas/ds-kit-receipt.schema.json`; do not invent receipt fields.

```sh
ui ds kit validate '<candidate directory>' --json
```

Treat the validate reply as a summary, not a lock file to save. Adoption derives
and writes its lock internally; the host does not author `kit.lock.json`.

Validation checks local byte identity, declared coverage and receipt consistency.
It cannot authenticate the receipt's author, independently run a browser, judge taste
or establish external capture completeness. Report those observations separately.
Never describe a valid hash as pixel fidelity, accessibility or production acceptance.

## 5. Adopt and use the verified kit

```sh
ui ds kit adopt '<candidate directory>' --out '<absent destination>' --json
ui ds kit verify --dir '<adopted project>' --json
ui ds status --dir '<adopted project>' --json
ui ds context --dir '<adopted project>' --strict --with-theme
ui registry list --file '<adopted project>/design/component-registry.json' --json
```

Adoption rechecks the candidate, exclusively reserves a fresh destination, binds copied
bytes and writes the DS manifest last. It refuses every occupied destination, including
an empty directory. There is no force/reset adoption. An interrupted reservation is
incomplete; use its exact failure receipt for recovery, never overwrite the owner's DS.
Read back through normal DS loading after the last write. Require verify
`data.ready: true` and `data.kitStatus: "verified"`; intact `stale` exits nonzero.
Installing this package into an existing application is a separate integration step with its own build/runtime proof.

For a new React consumer, read the selected `kit.json` mappings and bound usage
guidance, then import their actual implementation exports. Registry SSR markup is
reference evidence. Pass exact selected names to memory context as JSON string
arrays (for example `--components '["Owner, Control"]'`), so punctuation is not
mistaken for a CSV separator. Explicitly requested platform adaptations need their
own build/render proof; do not label them reuse of the React implementation.

The kit binding participates in the normal DS revision and owner-local lesson checks.
Editing TSX, CSS, source, mappings, lock files or evidence outside sanctioned writes
fails integrity. An accepted lesson cannot float to another implementation revision.

## 6. Grow with the owner

Sanctioned token/role and registry writes preserve prior integrity, update the bound
revision and mark old kit verification stale. Token changes regenerate the deterministic
theme. Adding a component does not silently invent its implementation or coverage.
Retain the original capture and evidence; explain which current state they no longer
cover. Staleness is distinct from an unauthorized edit.

When verify reports stale, continue the authoring loop in a staged candidate: reconcile
current tokens/registry and new source evidence, implement missing items, rerun affected
cases, review, then adopt a newly verified revision. Keep the active project and staged
revision identities explicit. Ordinary DS context can still load an intact stale
kit; it must not be reported as current build/render proof. Use `ui ds kit verify` as the readiness check. The
lesson acceptance guard refuses `KIT_STALE`; do not propose or accept revision-bound
lessons until kit readiness has been reverified. Learning proposals still require
the owner's actual review decision; successful adoption does not fabricate that approval.

## Failure modes

- **Capture mistaken for readiness.** Portable tokens and inventory have no implementation or runtime proof. Finish the staged authoring and review loop before adoption; otherwise an older seal can be presented as the new capture.
- **Coverage reduced to the starter floor.** A minimum count does not account for every captured ID. Keep all supplied mappings and observed options; unresolved items, duplicate owner identities and lost token/mode projections block completeness.
- **Screenshots show different code.** Bind the actual implementation exports, consumer CSS and dependency/import closure used by the harness. Preserved original source alone cannot justify a screenshot of adapted code.
- **Evidence treated as its own judge.** Hashes bind the declared subject and proof bytes; they cannot establish visual quality or authenticate a review author. Require independent source, render and behavior assessment before writing passed cases.
- **Growth silently inherits an old pass.** Sanctioned changes create a new revision with stale proof; arbitrary source edits fail integrity. Stage and verify the new candidate rather than accepting lessons against stale proof or healing unauthorized edits.
