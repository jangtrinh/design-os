# Owner-local design learning

After [onboarding](../templates/workflows/learn.md), keep improving the project's own
design system through reviewed lessons. Corrections, repeated feedback, new components,
and changed preferences enter a traceable local history. They do not become rules merely
because a model recorded them or a pattern recurred.

For Figma DS onboarding, the default read path is the design:os Figma plugin.
Follow the [Figma DS onboarding guide](../knowledge/figma-ds-onboarding.md) for installation and
connection before learning from the owner's Figma file.

Use this guide with the project's host agent: the host interprets feedback and obtains
owner decisions; the CLI keeps the local evidence and lesson history. Accepted lessons
inform relevant generation work. They are not proof of rendered quality or enforcement.

## Start with the whole inventory

For generic web-product onboarding, target shadcn + Tailwind while preserving the
owner's DS identity: semantic tokens, component vocabulary, variants, and soul. An
established project's DS and platform stack remain authoritative; resolve any proposed
stack change with the owner. This learning flow does not perform automatic migrations
or generate a replacement kit. Representative screens help discover vocabulary; they
are not the component inventory. Enumerate every reusable component and compositional
pattern from the actual sources, register source-backed records, and reconcile discovered, registered,
and unresolved names. Keep unresolved items explicit instead of inventing their variants.

```sh
ui ds status --json
ui ds context --strict --with-theme
ui registry list --json
```

Read the complete registry, not a shortened DS-context preview. There is no 25-component
cap: the fortieth component is as eligible for learning as the first. Pattern scopes also
use exact registered names. Do not merge similar names or infer inventory completeness
from a core-kit count. A starter kit supplies a floor, not the limit of the owner's system.

When no existing component fits, build from the project's semantic tokens and stack,
verify its actual states, and register its source-backed specimen with the existing
`ui registry register` command. Follow [learn's record-shape rules](../templates/workflows/learn.md#step-3d--component-record-shape-for-a-code-source-d1d2d4)
and [extraction](../templates/workflows/extract.md); add new records rather than squeezing
them into the starter inventory. Registration beside a manifest reseals the registry.
Reload DS and lesson context afterward: the revision changed, and older accepted lessons
need a fresh proposal and owner review before they apply to that revision.

## Refresh an existing host adapter

Existing projects must regenerate their runtime adapters to adopt this entry flow.
Only in the owner-approved target checkout, run the matching command:

```sh
ui init --runtime codex --force
```

Use `claude` or `antigravity` instead of `codex` for those runtimes. For an existing
Claude agent roster, add `--with-agents` to refresh the generated role instructions
and command permissions too. Inspect the resulting diff before using the refreshed
host. `--force` overwrites generated adapter files: review custom host instructions
with the owner before replacement; never automatically overwrite a custom host.
The [initializer](https://github.com/jangtrinh/design-os/blob/main/src/commands/init.ts) owns supported flags and write boundaries;
the [shared runtime entry](https://github.com/jangtrinh/design-os/blob/main/src/adapters/wrapper-shapes-shared.ts) supplies lesson
loading even when no role roster is installed.

## Load relevant lessons before authoring directions

For every visual change, discover the project's design guidance and available
`es:designer` / `es-designer` capability before implementation or visual review. Preserve
project tokens, stack, and platform specialists. If that skill is unavailable, read the
shipped applicable workflow, [craft defaults](../knowledge/generation-craft-defaults.md),
and [build loop](../knowledge/build-loop.md). Reading guidance does not prove compliance;
retain rendered evidence and gate results. See [design entry](design-entry.md).

Routine visual edits within the already-authorized task need no new approval ceremony.
Owner review here authorizes durable lesson acceptance, rejection, or withdrawal; it
does not replace the existing task's permission boundary or require approval for every render.

The host grounds the task and loads the DS first, identifies exact relevant registry
names, then reads lesson context **before direction authoring**, building, or repair:

```sh
ui registry lookup 'Control/Button' --json
ui registry lookup 'Pattern/DetailPanel' --json
ui memory context --for generate --json --max-bytes 16384
ui memory context --for generate --components 'Control/Button' \
  --patterns 'Pattern/DetailPanel' --json --max-bytes 16384
```

The names above are examples: substitute names present in the full local registry.
Look up every task component and pattern before the builder packet is authored, and
include its full definition, variants, token use, and specimen markup. DS context may
truncate its registry preview to ten entries; selecting all relevant lessons alone
does not load the missing component definitions. Exact lookup covers targets beyond
that preview, including component #40. Use `--file <registry-path>` consistently for
list/lookup when the active registry needs an explicit path.
Resolve referenced tokens against the complete local token file when its DS-context
preview also omits values; a token name alone is not a builder definition.
`--components` and `--patterns` accept CSV or JSON string arrays; unknown targets fail.
Use JSON for names containing commas or significant whitespace, for example
`--components '["Controls/Primary, Compact","Controls/Secondary"]'`. JSON preserves
the exact name; CSV remains compatible for simple names.
No selectors means project-scoped lessons only. With selectors, project lessons plus
matching component/pattern lessons are eligible. No vector rank file or semantic search
is required for accepted lessons. Reload if task targets or the DS change.
Form commands from `ui schema --json`; `--for generate` is the generation mode for both
the designer and Figma hand, rather than an invented consumer mode.

Use `data.lessons` for accepted task guidance and `data.learning.excluded` to understand
excluded history. The owning [selection code](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-lesson-context.ts)
checks scope, revision, lifecycle, and [local evidence](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-lesson-evidence.ts);
rejected and revoked history share the inactive exclusion count. JSON exposes the active revision
even without lesson history at `data.learning.dsRevision`; use that identity when
proposing a lesson. With no sealed DS there is no eligible revision; finish verified
onboarding rather than inventing a hash.
Tampered DS data must fail visibly.

Required eligible lessons have priority over optional legacy priors, semantic recall, and
taste profiles within one UTF-8 output budget, including the JSON envelope. If required
context cannot fit, `CONTEXT_OVERFLOW` stops authoring: raise `--max-bytes` or resolve
an explicit narrower task scope, then read again successfully. Never drop relevant
targets just to fit, or treat failed or incomplete context as an empty rule set.
The [output formatter](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-context-render.ts) owns completeness and budgets.
Legacy observations remain labeled unapproved. New lesson events stay outside incremental
semantic recall so stale approval cannot return through an embedding index.

Owner-local preferences guide relevant generation within the brief, soul, and project
evidence. If authoritative instructions conflict — including accepted lessons with each
other, the brief, soul, or DS — present the conflict and obtain the user's decision before
authoring. Never silently choose a winner. Accessibility, correctness, safety, and delivery
floors remain mandatory; optional recalled observations cannot resolve authority conflicts.
`--for critique` excludes lesson content; independent craft judgment keeps its rubric.
Do not copy project lessons into another project's profile, code, or shared knowledge,
or mutate global rules as part of this flow.

## Record evidence, then a pending proposal

Run these examples in the target project. `--no-registry` keeps recording from updating
the user-wide project index. Replace every angle-bracket placeholder with an actual
command result or owner decision; the examples create no approval by themselves.
Use project-relative local files, never a URL, Figma node ID, external path, or symlink
escaping the project as lesson evidence. Preserve the original bytes; new evidence gets
a new file and event, rather than rewriting an old artifact.

```sh
ui memory fingerprint evidence/button-review.json
ui memory record manual_edit \
  --data '{"summary":"Owner requested the project button spacing adjustment"}' \
  --artifact-ref evidence/button-review.json --fingerprint 'sha256:<64hex>' --no-registry --json
ui memory context --for generate --json --max-bytes 16384
```

The host supplies the real local evidence file, such as a measured render review with
source references. Keep source/recipe fingerprints as separate evidence where needed;
a hash of a review document alone does not seal every file it mentions. Capture the
assigned evidence event ID returned by `record` and the active revision returned by
context JSON. Do not guess the next event ID, use a context-preview hash, or hash the
raw manifest file as a substitute for the revision.

Use the revision returned by context and the fingerprint returned by the fingerprint
command; their formats differ. The [evidence owner](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-lesson-evidence.ts)
defines the revision boundary and checks the exact local file bytes.

```sh
ui memory record lesson_proposed \
  --data '{"text":"Use the evidenced compact button spacing on this project surface.","scope":{"kind":"component","target":"Control/Button"},"dsRevision":"<active revision from context JSON>"}' \
  --refs '<evidence event ID>' --actor owner --no-registry --json
```

Select the smallest justified scope; the [lesson schema and lifecycle](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-lessons.ts)
own payload validation:

| Scope | Proposal `scope` | Applies to |
|---|---|---|
| Project | `{"kind":"project"}` | This project; no target field |
| Component | `{"kind":"component","target":"Control/Button"}` | That exact registered component |
| Pattern | `{"kind":"pattern","target":"Pattern/DetailPanel"}` | That exact registered compositional pattern |

Each proposal needs at least one unique backward evidence event reference. Every cited
event must exist and carry a local `artifact.ref` plus a valid fingerprint. Duplicate,
forward, dangling, malformed, or lifecycle-invalid references fail rather than silently
becoming memory. The returned proposal ID is the lesson ID. Its status is **pending**;
it is absent from eligible lesson context until reviewed.

## Bind review to an actual owner decision

Show the owner the proposal, scope, revision, evidence, and implications. Only after the
owner chooses a decision does the host write a project-relative JSON receipt, for example
`evidence/lesson-accept.json`:

```json
{
  "lessonId": "<proposal event ID>",
  "dsRevision": "<proposal revision>",
  "decision": "accept",
  "actor": "owner",
  "reason": "<owner reason>"
}
```

Fingerprint those exact bytes, then append a review whose actor, reason, and decision
match the receipt. Its only reference is the proposal ID:

```sh
ui memory fingerprint evidence/lesson-accept.json
ui memory record lesson_reviewed \
  --data '{"lessonId":"<proposal event ID>","decision":"accept","reason":"<owner reason>","approvalRef":"evidence/lesson-accept.json","approvalFingerprint":"sha256:<receipt 64hex>"}' \
  --refs '<proposal event ID>' --actor owner --no-registry --json
```

The receipt binds the owner decision to the exact lesson and proposal revision. The
kernel checks matching fields, fingerprints, and realpath containment. **It does not
authenticate a human**: an actor string or host-written receipt is not proof of who
clicked approval. The host owns obtaining and faithfully recording the owner's decision.

Accept checks the current DS seal and every cited evidence artifact. A mismatch must
block acceptance. Rejection and revocation remain possible after evidence disappears or
the DS changes, but each still needs a fresh matching decision receipt. Use the original
proposal revision in that receipt, not the now-current revision.

For a pending proposal the owner rejects, write `evidence/lesson-reject.json` with the
same receipt fields and `decision: "reject"`; fingerprint it, then run:

```sh
ui memory record lesson_reviewed \
  --data '{"lessonId":"<pending proposal ID>","decision":"reject","reason":"<owner reason>","approvalRef":"evidence/lesson-reject.json","approvalFingerprint":"sha256:<receipt 64hex>"}' \
  --refs '<pending proposal ID>' --actor owner --no-registry --json
```

For an accepted lesson the owner withdraws, write and fingerprint a new receipt at
`evidence/lesson-revoke.json` with `decision: "revoke"`, then run:

```sh
ui memory record lesson_reviewed \
  --data '{"lessonId":"<accepted lesson ID>","decision":"revoke","reason":"<owner reason>","approvalRef":"evidence/lesson-revoke.json","approvalFingerprint":"sha256:<receipt 64hex>"}' \
  --refs '<accepted lesson ID>' --actor owner --no-registry --json
```

## Keep lifecycle, recurrence, and verification separate

| State | Meaning | Next allowed review |
|---|---|---|
| Pending | Evidence-backed proposal awaiting the owner | Accept or reject |
| Accepted | Owner accepted; eligible only while bindings remain current | Revoke |
| Rejected | Owner declined; retained as counterevidence | None; new proposal required |
| Revoked | Owner withdrew acceptance; retained in history | None; new proposal required |

Ledger order controls transitions. Edit neither old events nor receipts to reactivate a
lesson. A correction, revision change, or replacement creates a new proposal with current
evidence and revision. Explicitly revoke an accepted predecessor when withdrawing or
replacing it; no automatic supersession or semantic conflict resolution is promised.
Pending replacements do not silently cancel an eligible accepted predecessor. A stale
revision or changed evidence suppresses eligibility without rewriting lifecycle status.

Repeated observations, including three successful cases, can justify a **pending proposal
and owner review** for this project. They never automatically accept it. Ordinary
auto-recorded lint, edits, picks, and outcomes remain unapproved observations. Feedback
acceptance is separate from verified implementation and from deterministic enforcement.

A proposed hard rule needs an actual applicable gate and a negative control that makes
that gate fail, plus final passing evidence. Until those exist, report enforcement as
unverified; approval alone cannot turn prose into a gate. Unsafe overrides of accessibility,
correctness, or safety floors are never allowed. Keep floor and ceiling judgments separate
using the canonical [qualified delivery](../knowledge/qualified-delivery.md),
[build loop](../knowledge/build-loop.md), and [taste rubric](../knowledge/taste-rubric.md).

Cross-context world-class qualification remains a separate explicit experiment under
[World-Class Learning Loop](../knowledge/world-class-learning-loop.md). Its controlled
comparison and expert/three-wins eligibility do not accept a project lesson or authorize
editing shared rules. Shared-knowledge changes require the existing librarian/review
process and owner authorization.

## Integrity and recovery

Keep `design/memory.events.jsonl` as local history; `design/memory.graph.json` is a
rebuildable view, not approval authority. The [shared writer](https://github.com/jangtrinh/design-os/blob/main/src/core/memory-store.ts)
owns append serialization and projection recovery. Ordinary auto-record appends use
an O(1) path with a fresh counter; lesson validation and a stale-counter recount need
ledger reads. This is not an O(1) guarantee for lesson review or context.

On lock contention, the writer retries for at most 100 ms, then returns `MEMORY_LOCKED`
if the lock is still held. Wait for the writer to release it before retrying; no stale
lock is automatically broken. For `MEMORY_COMMITTED`, keep the returned event ID and
run `ui memory compile` to recover the projection instead of repeating the record.

The revision covers compiled tokens, registry, and generation. Cite separate evidence
fingerprints for implementations, recipes, or other sources outside that boundary.
A valid seal does not establish rendered quality or human identity. The host interprets
feedback; the deterministic kernel never grants itself permission to edit host rules,
skills, or global knowledge. Keep evidence local to this owner's project.

The executable [lifecycle checks](https://github.com/jangtrinh/design-os/blob/main/tests/cmd-memory-lessons.test.ts) and
[context checks](https://github.com/jangtrinh/design-os/blob/main/tests/cmd-memory-context-lessons.test.ts) own the mechanism's
verification. Inspect the rendered result and applicable delivery gates separately.
