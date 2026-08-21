# Content and proof structures

These structures organize evidence around a user decision. They extend `page-structures.md` with
content contracts; they do not create new personas, colors, or conversion guarantees.
Legal disposition: These are independently expressed general ideas only; no copied or substantial upstream content, code, prompts, assets, or vendor recipes enter this card.
<!-- ease:source ref="knowledge/sources/mengto-web-techniques--202608.json" captured="202608" -->

## STR-03 — Editorial portfolio

### Purpose
Present selected work as an argument with context, evidence, and an intentional reading order.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use an editorial portfolio when selected work needs context, sequence, and a point of view. The
trigger is a curated body of work rather than an undifferentiated gallery.

### Mechanism
Give each case a clear role, evidence beat, caption, and transition into the next chapter. Alternate
image, artifact, and explanation according to the content instead of repeating one card template.

### Anti-use
Do not hide work behind novelty, use irregularity to avoid missing captions, or treat every item as
equally important when the brief has a clear lead case.

### Required fallback
Provide a plain ordered case list with titles, summaries, links, and image alternatives. Reduced
motion removes transitions but keeps the complete case sequence and navigation.

### Responsive and input behavior
Convert collage or split layouts into a readable single column on narrow screens while preserving
case order. Every case remains reachable by keyboard and touch without hover-only captions.

### Lifecycle and performance downgrade
Lazy-load non-focal media, reserve aspect-ratio space, and avoid layout shifts during chapter entry.
Downgrade image treatment before removing captions, metadata, or case links.

### Verification
Check first-case priority, long captions, missing-image state, narrow/wide order, keyboard links,
reduced motion, and direct case URLs. Confirm each visual has a meaningful text explanation.

### Failure Modes
Failures include an image wall with no proof, a mobile collage that loses sequence, and captions
that appear only after scripts run. Keep the editorial argument legible in plain flow.

## STR-04 — Service booking

### Purpose
Help a visitor complete a service decision by exposing availability, requirements, and the next action.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a service-booking structure when the visitor must select a service, place, time, or contact path.
The trigger is an operational decision with real availability or a truthful request state.

### Mechanism
Sequence service choice, constraints, availability, details, and confirmation as explicit states.
Keep the current selection and next action visible while preserving a clear way to revise it.

### Anti-use
Do not imply a reservation before confirmation, hide unavailable options, or force a decorative
journey when a short form is enough. Avoid collecting data that the service cannot use.

### Required fallback
Offer a direct contact route and a clear unavailable/error state when availability cannot load.
The no-script path still identifies the service, required details, and expected response.

### Responsive and input behavior
Use one-column steps on narrow screens, native controls where possible, and visible focus/error
messages. Touch users can revise a choice without losing entered details or being trapped in a modal.

### Lifecycle and performance downgrade
Keep state local to the booking flow, cancel stale availability requests, and preserve input on
retry. Reduce decorative transitions before reducing validation, status, or recovery behavior.

### Verification
Test empty, unavailable, invalid, loading, success, back, refresh, keyboard, touch, and reduced
motion paths. Confirm confirmation language matches what the system actually completed.

### Failure Modes
Watch for dead ends, false availability, lost form data, and an error shown only through color.
Make every operational state explicit and recoverable.

## STR-05 — Enterprise proof

### Purpose
Make enterprise trust inspectable through concrete capabilities, constraints, outcomes, and evidence.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use enterprise proof when trust depends on boundaries, approvals, controls, and operational
evidence. The trigger is a consequential system decision, not a desire for corporate styling.

### Mechanism
Organize proof around a workflow: scope, actor, control, evidence, exception, and recovery. Show
where the product stops, what is reviewed, and how a qualified handoff occurs.

### Anti-use
Do not claim compliance, automation, or uptime without evidence, and do not substitute a dashboard
of numbers for a described control. Avoid hiding exceptions behind a perfect success path.

### Required fallback
Provide readable process steps, evidence labels, and contact or escalation paths if interactive
proof cannot load. Reduced motion removes transitions but not the operational explanation.

### Responsive and input behavior
Collapse comparison panels into ordered sections and preserve table headers or labels on narrow
screens. Keyboard users must reach evidence, exceptions, and escalation actions in logical order.

### Lifecycle and performance downgrade
Load proof media progressively and keep data states explicit; never let a failed visualization erase
the claim's text. Reduce animation and decoration before reducing evidence detail.

### Verification
Check source labels, stale/error/empty states, keyboard flow, narrow reading order, reduced motion,
and the difference between demonstrated and asserted behavior. Mark unverified claims as such.

### Failure Modes
Failures include invented certainty, missing rollback information, and a polished chart with no
source or timestamp. Tie every assertion to an observable evidence path.

## STR-06 — Product proof

### Purpose
Turn a product explanation into verifiable proof that connects capability, use, and resulting value.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use product proof when the hero must demonstrate a real workflow rather than merely describe it.
The trigger is a product outcome that can be shown with a bounded, deterministic example.

### Mechanism
Lead with the user problem, show the interaction path, expose the resulting artifact or state, and
then add supporting evidence. Keep the demonstration separate from the explanatory copy.

### Anti-use
Do not fake live data, autoplay a confusing simulation, or make a demo the only way to understand
the offer. Avoid tabs that hide the proof a visitor needs to compare.

### Required fallback
Provide a static annotated result and plain workflow steps when the demo cannot run. Reduced motion
settles the demonstration; capability or load failure leaves the result and explanation visible.

### Responsive and input behavior
Use a single-column demonstration with explicit step controls on narrow screens. Keyboard and touch
must reach the same states without hover, drag, or timing dependence.

### Lifecycle and performance downgrade
Use deterministic fixtures, lazy-load optional media, and reset the demo cleanly on replay or route
change. Reduce fidelity and transitions before removing the result summary.

### Verification
Test first load, replay, error, empty, keyboard, touch, reduced motion, narrow/wide layout, and
JavaScript failure. Confirm the shown outcome matches the claim and has a textual counterpart.

### Failure Modes
Typical failures are a cinematic demo with no controls, a fake success state, and a mobile crop
that hides the result. Make the proof inspectable and the fallback complete.

## STR-08 — Pricing comparison

### Purpose
Let comparable plans be evaluated quickly by keeping price, limits, inclusions, and qualification visible together.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use pricing comparison when plans differ across dimensions and the visitor must make a choice.
The trigger is a real comparison problem with known prices, limits, and qualification rules.

### Mechanism
Put plan names, price basis, included capabilities, limits, and next actions in one coherent
comparison model. Follow the table with clarification for exceptions rather than hiding differences.

### Anti-use
Do not use visual emphasis to conceal fees, compare unlike units, or invent a low anchor. Avoid an
interactive toggle when it changes values without explaining period, currency, or audience.

### Required fallback
Render a semantic table or stacked plan sections with all values visible when scripts fail. Reduced
motion removes card transitions; the comparison and purchase path remain complete.

### Responsive and input behavior
Transform the table into labeled plan blocks on narrow screens without losing row names. Toggles,
filters, and CTAs support keyboard, touch, focus, disabled, and error states.

### Lifecycle and performance downgrade
Keep price data in one source for all views, avoid layout shifts while switching periods, and cancel
stale updates. Remove decorative comparison motion before hiding any plan detail.

### Verification
Check currency, period, taxes/fees, limits, empty/error states, keyboard traversal, touch, reduced
motion, and narrow width. Confirm every highlighted claim appears in the plain fallback.

### Failure Modes
Failures include a table that becomes unreadable on mobile, a toggle that changes only the label,
and a CTA promising an unavailable plan. Make values and qualification explicit.

## STR-09 — Documentary portfolio

### Purpose
Document work as a traceable sequence so process, decisions, and final artifacts remain understandable.

### Trigger
Use this technique only when the stated condition is observable in the brief; otherwise keep the simpler baseline.

Use a documentary portfolio when process, chronology, and imperfect evidence are the subject.
The trigger is an archive or case record whose order and context matter more than polish.

### Mechanism
Alternate artifact, caption, date or stage, and reflection in an ordered record. Let irregular
composition mark changes in evidence while keeping a stable reading spine.

### Anti-use
Do not manufacture messiness, omit dates or attribution, or use collage to conceal a thin record.
Avoid asymmetry when the content needs a quick comparison or operational scan.

### Required fallback
Provide a chronological list with captions, metadata, and links when images or layout enhancement
fails. Reduced motion preserves the record order and all references.

### Responsive and input behavior
Collapse overlays into normal flow on narrow screens and keep captions adjacent to their artifacts.
Keyboard and touch users must reach every record without hover-dependent labels.

### Lifecycle and performance downgrade
Reserve image space, lazy-load later records, and retain a stable reading position during loading.
Reduce collage layers and motion before dropping metadata or chronology.

### Verification
Check missing assets, long captions, dates, attribution, direct links, narrow/wide order, keyboard,
touch, reduced motion, and a no-image fallback. Confirm the record remains understandable as text.

### Failure Modes
Watch for decorative disorder, orphaned captions, and chronology lost in a masonry layout. Keep an
explicit spine and let evidence, not styling, create distinction.
