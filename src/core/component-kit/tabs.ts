/**
 * Structure/Tabs — a `role="tablist"` with roving-tabindex tabs and a linked `role="tabpanel"`.
 *
 * The active tab carries `aria-selected="true"` and a `--color-primary` underline indicator;
 * hover uses the L8 `--color-accent` tint, focus uses `--color-ring`, and the disabled tab is
 * `aria-disabled`. States: Default | Hover | Focus | Disabled, drawn statically.
 *
 * The leaf role `tabs` matches neither the control family (`tab`, singular) nor the data family,
 * so the specimen contract requires no `disabled`/`empty` gap — but the honest matrix (including
 * disabled) is declared anyway.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-tabs">
  <style>
    .ui-tabs { font-family: var(--font-family-body); display: grid; gap: var(--space-4); }
    .ui-tabs__list { display: flex; flex-wrap: wrap; gap: var(--space-1); border-bottom: 1px solid var(--color-border); }
    .ui-tabs__tab {
      font: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
      appearance: none; background: transparent; cursor: pointer; border: 0;
      padding: var(--space-2) var(--space-3); border-bottom: 2px solid transparent; margin-bottom: -1px;
      color: var(--color-muted-foreground); border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      transition: color var(--duration-fast) ease, background var(--duration-fast) ease;
    }
    .ui-tabs__tab[aria-selected="true"] { color: var(--color-primary); border-bottom-color: var(--color-primary); }
    .ui-tabs__tab.is-hover:not([aria-selected="true"]) { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-tabs__tab.is-focus { outline: 2px solid var(--color-ring); outline-offset: -2px; }
    .ui-tabs__tab[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
    .ui-tabs__panel { font-size: var(--font-size-sm); color: var(--color-foreground); line-height: 1.5; }
  </style>
  <div class="ui-tabs__list" role="tablist" aria-label="Account settings">
    <button type="button" class="ui-tabs__tab" role="tab" id="ui-tabs-t1" aria-selected="true" aria-controls="ui-tabs-panel">Overview</button>
    <button type="button" class="ui-tabs__tab" role="tab" id="ui-tabs-t2" aria-selected="false" aria-controls="ui-tabs-panel" tabindex="-1">Reports</button>
    <button type="button" class="ui-tabs__tab is-hover" role="tab" id="ui-tabs-t3" aria-selected="false" aria-controls="ui-tabs-panel" tabindex="-1">Members</button>
    <button type="button" class="ui-tabs__tab is-focus" role="tab" id="ui-tabs-t4" aria-selected="false" aria-controls="ui-tabs-panel" tabindex="-1">Billing</button>
    <button type="button" class="ui-tabs__tab" role="tab" id="ui-tabs-t5" aria-selected="false" aria-disabled="true" tabindex="-1">Archived</button>
  </div>
  <div class="ui-tabs__panel" role="tabpanel" id="ui-tabs-panel" aria-labelledby="ui-tabs-t1" tabindex="0">
    <p>Your workspace overview &mdash; usage, seats, and recent design-system activity.</p>
  </div>
</div>`;

export const tabs: KitComponent = {
  name: "Structure/Tabs",
  category: "navigation",
  markup,
  description: "Tabs — a roled tablist with aria-selected, showing default, hover, focus, and disabled tabs plus a linked panel.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Focus", "State=Disabled",
  ],
  tokensUsed: [
    "color.border", "color.muted-foreground", "color.foreground",
    "color.primary", "color.accent", "color.accent-foreground", "color.ring",
    "radius.sm", "font-family.body", "font-weight.medium",
    "font-size.sm",
    "space.1", "space.2", "space.3", "space.4",
    "duration.fast",
  ],
};
