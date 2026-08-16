---
description: "Pull Figma comments scoped to what the owner points at, resolve which screen and element each pin means, decide them one at a time, and read the owner's verdict back off the threads you post. Use when reviewing, triaging, or closing the loop on Figma design feedback."
---

# `/ui:figma-comments` — Triage Figma comments into decisions

Design feedback arrives as comment pins on a Figma file. This workflow pulls the open
ones **on demand** (never on a schedule), tells you which screen and which element each
one is about, and walks you through them one at a time so *you* decide what becomes work.

## Important — what the binary does NOT do

`ui figma comments` is a pure transform over payloads that are already on disk. By
constitution (Art. I) the kernel makes no network calls and no model calls, so it cannot:

- fetch anything from Figma — the **host CLI / host model** owns every REST call;
- resolve your token;
- reply to, resolve, or otherwise write to a comment (this workflow is **read-only** in
  Figma — closing a thread stays a human action);
- decide what is actionable. It reports; you judge.

What it *does* is the part that must be identical every time: folding replies into
threads, hiding resolved ones, counting what it hid, and working out what each pin is
anchored to.

## Inputs

- `<figma-url>` — `https://www.figma.com/(file|design)/<fileKey>/<title>`. Unlike
  `/ui:figma`, no `node-id` is needed: comments are pulled per file.
- A Figma personal access token in the environment, typically `FIGMA_TOKEN` or
  `FIGMA_ACCESS_TOKEN` (same resolution as `figma.md`). It **must carry the
  `file_comments:read` scope** — a token without it fails with an unhelpful 403. If
  neither the host CLI nor the user can supply one, stop and ask.

## Three modes, and which one you are in

- **triage** — first pass over a scope the owner named. Everything below, in order.
- **sync** — a delta since the last pull (`--since`). Run it BEFORE starting a task and
  AFTER delivering one. This is the mode that runs most often.
- **verdict** — read the owner's answer off threads you posted (`--authored-by`). Part of
  every sync; never skipped.

Scope is whatever the owner pointed at. Do NOT scan a whole file to find work nobody asked
for: on a mature file most threads are closed, most of the rest are outside the current
scope, and the discovery is a cost the owner did not authorise.

## Step 0. Settle the destination BEFORE reading a single comment

`--delivery-target <figma-canvas|code|both>` is required, and it is required rather than
defaulted for a measured reason: the most expensive error on the run this workflow comes from
was a batch aimed at the wrong artefact that then passed every gate defined for the wrong one.

The gate follows the target. A canvas change is proved by a before/after frame render
(`templates/skills/verify-canvas.md`); a code change is proved by the project's build. A green
build says nothing about whether a design moved.

## Steps

### 1. Fetch the payloads (host CLI)

Three calls. Persist every raw body under `output/<slug>-figma/raw/` so a rerun — or
resuming this afternoon — skips the network entirely, exactly as `figma.md` does.

- `GET /v1/files/<fileKey>/comments` → `raw/comments.json`
  The comment set. `file_key` accepts a **branch key** too; if the user is reviewing a
  branch, use the branch's key or the result is silently empty.
- `GET /v1/files/<fileKey>?depth=2` → `raw/file-tree.json`
  Pages and their top-level frames. This is the **only** payload that carries page
  names, and real files routinely hold several frames called "Checkout".
- `GET /v1/files/<fileKey>/nodes?ids=<every frame id in comments.json>` → `raw/nodes.json`
  One batched call, not one per frame. Supplies the subtrees used to name the element
  under each pin.

Both supporting payloads are optional. Skip them and triage still works — it just groups
by frame id and declines to name pages or elements.

### 2. Triage deterministically

```bash
ui figma comments raw/comments.json \
  --nodes raw/nodes.json \
  --file-tree raw/file-tree.json \
  --decisions design/figma.comments.decisions.json --pending \
  --json
```

Read the `stats` block aloud to the user before anything else — `pulled`,
`resolvedHidden`, `repliesFolded`, `shown`. Those numbers reconcile; a silent drop is
the failure mode that erodes trust in the whole feature.

### 3. Understand each anchor's `confidence` before you repeat it

The command never guesses. It labels how much it actually knows:

| confidence | what to tell the user |
|---|---|
| `element` | the pin is on `chain`'s last entry — name it plainly |
| `region` | the literal hit was filler (a background rect, a spacer); give the **chain**, not a leaf |
| `frame` | you know the screen only — say so; do not invent an element |
| `orphaned` | the frame was deleted after the comment; offer to skip it |
| `unanchored` | pinned to bare canvas; there is no screen. Read it as a general note |

Never upgrade a `region` into an element name. A confidently wrong anchor produces a task
that sends someone to the wrong component, which is worse than no task at all.

### 4. Show the screen (optional, one at a time)

For the thread being presented, render its frame and show it:

```
GET /v1/images/<fileKey>?ids=<frameId>&format=png&scale=2
```

Place a marker at `anchor.pin` multiplied by the scale — `pin` is already frame-local, so
at `scale=2` the pixel position is `(pin.x * 2, pin.y * 2)`. Two cautions:

- **Render lazily**, only for the thread on screen. `/images` is rate-limited well below
  the metadata endpoints, and most threads get skipped without ever being looked at.
- The returned URLs are **short-lived signed links**. Download the PNG into `raw/` — a
  hotlinked image is broken by the time the user resumes.

### 4b. Check blast radius before starting, not at attempt seven

If the anchor reports the pin inside a component instance, the real fix may live in the master
and propagate to every consumer. The bare fact is not the signal — in a componentised file
nearly every pin is inside some instance. The signal is **how often the same master recurs
across this batch**; a master hit repeatedly needs owner approval before any edit.

### 5. Present one thread at a time

In `stats` order, for each thread: the screen (`Page / Frame`), the anchor per step 3, the
message **verbatim**, its replies, and the author. Then ask for one of four decisions:

- **task** — it becomes work
- **skip** — noise, praise, or already handled
- **later** — real, not now
- **ask** — needs the designer to clarify before anyone can act

Record every decision in `design/figma.comments.decisions.json` as
`{ "<commentId>": { "decision": "task|skip|later|ask", "ts": "<iso>", "taskRef": "<optional>" } }`.
The host model writes this file; `ui` only reads it. That ledger is what makes `--pending`
work, so a half-finished triage resumes cleanly instead of starting over. It is keyed by
**comment id**, never by a position — comments are an unordered, mutable set.

If the list is long, offer the whole grouped digest first (drop `--json`) and let the user
bulk-skip the obvious noise before walking the survivors.

### 6. Write the tasks

Append accepted threads to `plans/reports/figma-feedback-<file-slug>-<date>.md`. Each one
carries:

- a derived, imperative title (≤60 chars) — clearly *your* interpretation;
- the **verbatim** comment as a quote, plus author and date;
- `Page / Frame` and the anchor chain;
- the comment id and a link back to the frame.

Keep the quote intact. The comment is evidence; the title is interpretation, and only one
of those two is safe to paraphrase. Do not invent priority, effort, or acceptance criteria
from six words of prose.

For an `ask`, collect the open questions into one list at the end of the same file, phrased
so the user can paste them into Figma themselves — this workflow does not write to Figma.

## Closing the loop — the part that is usually skipped

Posting the handoff comment is not the end. The owner answers **in that thread**, and the
answer is the only place completion exists.

Run `--authored-by "<owner handle>"` and read the verdict on every thread you posted:

| verdict | meaning | action |
|---|---|---|
| `accepted` | a bare acknowledgement | close it |
| `conditional` | accepted with a caveat, or a new instruction | new task, immediately |
| `reversed` | the requirement was withdrawn or inverted | supersede the task, check what shipped |
| `silent` | resolved with nothing said | **NOT acceptance** — ask before closing |

Two rules that make this work, both learned the expensive way:

- **NEVER resolve-filter a thread you authored.** The owner resolves those the moment he has
  replied, so filtering by resolve drops every thread that has a verdict. `--since` and
  `--authored-by` both imply `--include-resolved` for this reason.
- **A resolve is not a completion.** `resolved_at` means "my request is satisfied" from a
  reviewer, but only "I have read this" from an owner answering in his own thread. Read the
  reply, not the flag.

Anything that is not a plain acknowledgement becomes a task in the same ledger, in the same
session. A reversal noticed a day later has already shipped.

## Outputs

- `output/<slug>-figma/raw/` — cached payloads, so reruns and resumes skip the network.
- `design/figma.comments.decisions.json` — the durable decided-record.
- `plans/reports/figma-feedback-<file-slug>-<date>.md` — the tasks.

## Quality gate

- Every count in `stats` reconciles, and you said them out loud before presenting.
- No anchor was reported with more precision than its `confidence` allows.
- Every quoted comment is verbatim.
- No comment was resolved or replied to in Figma.
