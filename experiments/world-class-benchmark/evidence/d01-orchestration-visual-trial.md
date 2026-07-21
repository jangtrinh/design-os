# D01 orchestration visual trial

## Result

D01 now preserves four new renderable states: content-led, golden, selected, and art-directed.
The golden candidate is the provisional maker selection. `orchestrated-selected` reproduces that
candidate without refinement; art direction happens only in `art-directed`.

## Design critique

First impression: architectural context is immediate. The house remains the primary evidence,
while the headline and action are readable without competing with it.

The page no longer spends all craft in the hero:

- **Site reading** turns climate inputs into a spatial diagram.
- **Material proof** uses distinct material fields instead of generic feature cards.
- **Process** becomes a sticky-heading decision sequence.
- **Conclusion** returns to the landscape and carries a complete footer.

The weakest region is still the process section at 7.9/10. It is clear and topic-coupled, but its
row structure is more conventional than the site and material regions. This is retained as an
honest learning signal rather than cosmetically inflated.

## Candidate comparison

Content-led uses a 1:1.25 hero split derived from copy and media minimums. Golden uses 1:1.618 on
the hero and limited desktop regions. Both preserve identical content, assets, visual DNA, and
region order.

Golden wins provisionally because the larger landscape field improves context and emotional
impact without harming readable measure. At widths below 900px, both candidates release their
ratio and use the same semantic single-column order.

## Corrections discovered by the trial

- The first content-led implementation accidentally used 5:8, making it almost identical to phi.
  The test now uses a genuinely different 1:1.25 candidate.
- Tablet min-width constraints caused 153px horizontal overflow. The content-failure breakpoint
  now releases the split below 900px; measured overflow is zero.
- The initial material region used a split heading with filler copy. It now uses one stacked
  message.
- Workflow labels were visible inside the hero and could contaminate blind evaluation. They now
  remain only in the excluded benchmark toolbar.
- The old page used a global scroll listener and hid reveal content by default. The trial uses
  IntersectionObserver, CSS view timelines where supported, reduced-motion fallback, and a
  no-script essential-content fallback.
- Selected initially drifted into a third hybrid proportion. It now reproduces the golden winner
  exactly; refinements exist only in art-directed.

## Evidence

Screenshots are stored in `evidence/renders/d01/`. The structured scores and measured browser
results are in `d01-orchestration-scorecard.json`.

This remains maker evaluation, not a blind win. It cannot promote a reusable taste rule or unlock
default rollout.
