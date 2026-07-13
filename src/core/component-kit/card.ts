/**
 * Display/Card — the content-surface composition (header / body / footer).
 *
 * Built on the L8 card pair (`--color-card` + `--color-card-foreground`) and `--radius-card`.
 * Two elevations are shown so the surface tokens read in both treatments: Flat (a hairline
 * `--color-border`) and Raised (the semantic `elevation.card` shadow, composed from its
 * `--elevation-card-*` members). A card is a leaf surface — not a control or data family —
 * so it declares only `State=Default`; its variant axis is Elevation.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-card">
  <style>
    .ui-card { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-5); font-family: var(--font-family-body); }
    .ui-card__surface {
      display: grid; gap: var(--space-4); padding: var(--space-5);
      background: var(--color-card); color: var(--color-card-foreground);
      border-radius: var(--radius-card); border: 1px solid var(--color-border);
    }
    .ui-card__surface--raised {
      border-color: transparent;
      box-shadow: var(--elevation-card-offset-x) var(--elevation-card-offset-y) var(--elevation-card-blur) var(--elevation-card-spread) var(--elevation-card-color);
    }
    .ui-card__head { display: grid; gap: var(--space-1); }
    .ui-card__title { font-family: var(--font-family-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); }
    .ui-card__sub { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-card__body { font-size: var(--font-size-sm); line-height: 1.5; }
    .ui-card__foot { display: flex; gap: var(--space-2); align-items: center; }
    .ui-card__btn {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); cursor: pointer;
      padding: var(--space-2) var(--space-4); border-radius: var(--radius-button); border: 1px solid transparent;
      transition: filter var(--duration-fast) ease;
    }
    .ui-card__btn--primary { background: var(--color-primary); color: var(--color-primary-foreground); }
    .ui-card__btn--ghost { background: transparent; color: var(--color-foreground); border-color: var(--color-border); }
  </style>
  <div class="ui-card__surface">
    <div class="ui-card__head">
      <p class="ui-card__title">Starter</p>
      <p class="ui-card__sub">Flat surface &middot; hairline border</p>
    </div>
    <p class="ui-card__body">Everything a small team needs to ship its first design system.</p>
    <div class="ui-card__foot">
      <button type="button" class="ui-card__btn ui-card__btn--primary">Choose Starter</button>
      <button type="button" class="ui-card__btn ui-card__btn--ghost">Compare</button>
    </div>
  </div>
  <div class="ui-card__surface ui-card__surface--raised">
    <div class="ui-card__head">
      <p class="ui-card__title">Team</p>
      <p class="ui-card__sub">Raised surface &middot; card elevation</p>
    </div>
    <p class="ui-card__body">Shared tokens, unlimited components, and specimen gating on every commit.</p>
    <div class="ui-card__foot">
      <button type="button" class="ui-card__btn ui-card__btn--primary">Choose Team</button>
      <button type="button" class="ui-card__btn ui-card__btn--ghost">Compare</button>
    </div>
  </div>
</div>`;

export const card: KitComponent = {
  name: "Display/Card",
  category: "display",
  markup,
  description: "Content card — header, body, and footer actions on card tokens, shown flat and with card elevation.",
  status: "stable",
  variants: [
    "Elevation=Flat", "Elevation=Raised",
    "State=Default",
  ],
  tokensUsed: [
    "color.card", "color.card-foreground", "color.border",
    "color.muted-foreground", "color.foreground",
    "color.primary", "color.primary-foreground",
    "elevation.card-offset-x", "elevation.card-offset-y",
    "elevation.card-blur", "elevation.card-spread", "elevation.card-color",
    "radius.card", "radius.button",
    "font-family.body", "font-family.display",
    "font-weight.semibold", "font-weight.medium",
    "font-size.lg", "font-size.sm", "font-size.xs",
    "space.1", "space.2", "space.4", "space.5",
    "duration.fast",
  ],
};
