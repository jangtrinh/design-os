# System quality contracts

These contracts make optional motion and effects survivable. They complement, rather than replace,
the existing accessibility, generation, motion, and Canvas owners.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## SYS-02 — Scene ledger

### Purpose
Keep multi-scene visual state explicit so transitions, loading, and responsive changes remain coherent.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a scene ledger when a persistent or multi-chapter effect has state that must remain coherent
across progress, loading, and responsive changes. The trigger is more than one scene concern.

### Mechanism
Record chapter identity, renderer state, progress source, continuity key, and fallback state in one
explicit model. Separate exact user progress from any smoothed value used only for presentation.

### Anti-use
Do not keep hidden mutable state in unrelated callbacks or infer chapter identity from a frame count.
Avoid a ledger for a single static effect whose owner already has one clear state.

### Required fallback
The ledger must name a settled static state and a semantic chapter path for every unavailable branch.
Reduced motion and capability failure choose those states deterministically.

### Responsive and input behavior
Reconcile state after reflow, de-pin on narrow layouts, and preserve the active chapter when input
mode changes. Touch and keyboard navigation update the same explicit state as pointer input.

### Lifecycle and performance downgrade
Give one owner responsibility for observers, animation frames, media, and scene disposal. On stress,
reduce smoothing, detail, and active modules before dropping the continuity key or content.

### Verification
Exercise forward/reverse progress, resize, route change, reload, reduced motion, capability-off,
and remount. Log enough state to prove the fallback branch was selected, not merely assumed.

### Failure Modes
Failures include progress that jumps between renderers, chapters resetting after resize, and stale
listeners writing to a removed scene. Keep state explicit, scoped, and disposable.

## SYS-05 — Evidence matrix

### Purpose
Make each design claim traceable to a fresh, observable piece of evidence and its validation context.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use an evidence matrix when an effect or narrative has multiple capability, input, and lifecycle
branches that a single screenshot cannot prove. The trigger is a meaningful state space.

### Mechanism
List each required behavior against an observable artifact: static render, reduced motion, touch,
keyboard, narrow/wide, capability failure, loading/error, and cleanup. Mark claims as observed,
unexecuted, or not applicable rather than treating silence as success.

### Anti-use
Do not present source inspection as runtime proof or claim accessibility, browser support, or
performance without the corresponding observation. Avoid a matrix that lists states no consumer can
actually exercise.

### Required fallback
If a branch cannot be executed, document the limitation and keep the deterministic static baseline
as the accepted state. A missing observation must never silently pass.

### Responsive and input behavior
Include each canonical width and both fine/coarse input modes when the technique responds to them.
Record keyboard order and focus visibility separately from visual screenshots.

### Lifecycle and performance downgrade
Include hidden-tab pause, remount cleanup, resource disposal, and downgrade behavior for live fields.
Use a smaller matrix for CSS-only techniques, but do not omit a required branch.

### Verification
Run the matrix after the final change and link each result to an artifact or explicit refusal.
Separate deterministic lint results, human visual judgment, and unexecuted consumer behavior.

### Failure Modes
Failure is a green row backed only by code reading, an omitted capability-off case, or stale evidence
carried from a prior build. Freshness and evidence type belong in every row.

## SYS-06 — Quality governor

### Purpose
Set a measurable quality boundary that chooses when an effect ships, degrades, or stays disabled.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a quality governor when an effect has variable cost across devices or scene states. The trigger
is a live budget that must degrade before the page becomes unusable.

### Mechanism
Define ordered quality levels over resolution, density, update rate, geometry, and active modules.
Move downward from measured signals such as frame pressure, visibility, memory, or load failure.
Check capability and budget gates before importing a heavy optional module. Initialize the loader through
one idempotent, concurrency-safe promise so overlapping requests share one outcome and cannot duplicate work.

### Anti-use
Do not guess universal frame budgets, adapt based only on user-agent strings, or hide degradation
without preserving meaning. Avoid a governor for a static CSS surface with no runtime cost.

### Required fallback
The lowest level is a complete semantic or static rendering, not an empty canvas. Reduced motion
selects a settled level; capability failure bypasses the live levels entirely.

### Responsive and input behavior
Start with lower quality on narrow or coarse-pointer devices when evidence supports that choice.
Keep controls, focus, and scroll responsive while the governor changes only the optional field.

### Lifecycle and performance downgrade
Sample sparingly, debounce transitions, pause while hidden, and dispose resources when the owner
unmounts. Degrade in one direction during pressure and restore cautiously after stability. Clear the
shared loader outcome on an intentional teardown only when a later mount is allowed to retry safely.

### Verification
Exercise each level with representative content, reduced motion, hidden tab, resize, load failure,
and remount. Record target hardware and observed evidence instead of asserting a universal number.

### Failure Modes
Failures include oscillating quality, a governor that measures itself instead of the page, and a
low level that loses the narrative. Make transitions hysteretic and keep the fallback meaningful.
