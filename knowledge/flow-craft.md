# Flow craft — designing a multi-screen flow

A single screen is a frame; a product is a **flow**. `flow.json` is the smallest true model of
one: **screens** (each with its data-lifecycle states) + **transitions** + **entryPoints**. The
binary lints it deterministically (`ui flow lint`) — reachability, dead ends, missing error paths —
which is the one thing a canvas prototype can't give you. Schema: `schemas/flow.schema.json`.

## The model
```jsonc
{
  "name": "checkout",
  "entryPoints": [{ "id": "start", "screen": "cart" }],
  "screens": [
    { "id": "cart",     "mode": "ecommerce", "artifact": "screens/cart.html",
      "states": ["default", "empty", "skeleton"] },
    { "id": "checkout", "states": ["default", "loading", "error"] },
    { "id": "confirm",  "states": ["default"], "terminal": true }
  ],
  "transitions": [
    { "id": "t1", "from": "cart",             "to": "checkout",        "trigger": "ON_CLICK", "source": "#pay" },
    { "id": "t2", "from": "checkout.default", "to": "checkout.loading","trigger": "ON_SUBMIT", "async": true },
    { "id": "t3", "from": "checkout.loading", "to": "confirm",         "trigger": "AFTER_DELAY", "guard": "payment.ok" },
    { "id": "t4", "from": "checkout.loading", "to": "checkout.error",  "trigger": "AFTER_DELAY", "guard": "!payment.ok" },
    { "id": "t5", "from": "confirm",          "to": "cart",            "trigger": "ON_CLICK", "source": "#home" }
  ]
}
```

## Two decisions that make the model work

**1. Screen states are flow nodes — but only the DATA lifecycle.** `from`/`to` are `screenId` OR
`screenId.stateId`. Put the *data* states in the graph — `empty · skeleton · loading · error ·
success · selected` — so the linter can prove you can actually **reach** the error state (a screen's
error state is otherwise decorative). Keep *pointer* states out — `hover · focus · pressed` are
within-screen (CSS/variant reactions), and putting them in the graph drowns the IA in noise.

**2. Guards are declared, never executed.** A `guard` string (`"payment.ok"` / `"!payment.ok"`) exists
to be **linted** (every guard needs its complementary else branch) and **handed off**, not run. The
instant you execute a guard you've built an app and lost the deterministic guarantee. ease-design owns
the *linted navigation graph*, not runtime behaviour.

## The lint contract (run it, don't eyeball it)
`ui flow lint <flow.json>` — errors block, warnings advise:
- **errors:** `dangling-ref` (a transition/entry points at a missing screen/state) · `unreachable-screen`
  (not reachable from any entry) · `dead-end` (non-terminal screen with no way out) · `missing-error-state`
  (an async/submit transition on a screen with no `error` state) · `invalid-trigger` · `noop-self-loop` ·
  `no-entry`.
- **warnings:** `orphan-screen` · `unreachable-state` (a declared state nothing targets — decorative) ·
  `missing-back-path` (reachable but no way home) · `missing-empty-state` / `missing-skeleton` (a data
  mode — dashboard/admin/ecommerce/app — with no empty/skeleton) · `guard-without-complement` (a
  conditional with no else = a trap).

## Authoring
Draft the flow from the brief; each screen's data states come from `component-design.md`'s lifecycle
and the `mode-constraints.md` floors (a data view *requires* skeleton + empty; an async action requires
error + retry). Then `ui flow lint` until clean. `motion-craft.md` owns *how* a transition animates;
flow owns *whether* the navigation is sound.

## What flow is NOT
Not a Framer/ProtoPie clone, not a real-data prototyping tool, not an XState runtime. It borrows the
statechart vocabulary (states/transitions/guards/entries) and nothing else. Macro navigation + the
data-state lifecycle — deterministically checkable — is the whole job.
