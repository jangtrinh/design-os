/**
 * Display/Badge — a small status pill.
 *
 * Axis: Tone (Neutral | Success | Info | Warning | Danger). The neutral tone reads on the
 * L8 `--color-secondary` surface (its soft neutral action colour); the four status tones
 * use the paired status roles (`--color-success` + `--color-success-foreground`, …) so every
 * pill clears AA by construction. A badge is a leaf label — not a control or data family —
 * so it carries no interaction states; it declares only `State=Default`.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-badge">
  <style>
    .ui-badge { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); font-family: var(--font-family-body); }
    .ui-badge__pill {
      display: inline-flex; align-items: center;
      padding: var(--space-1) var(--space-3); border-radius: var(--radius-full);
      font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); line-height: 1.4;
    }
    .ui-badge__pill--neutral { background: var(--color-secondary); color: var(--color-secondary-foreground); }
    .ui-badge__pill--success { background: var(--color-success); color: var(--color-success-foreground); }
    .ui-badge__pill--info    { background: var(--color-info);    color: var(--color-info-foreground); }
    .ui-badge__pill--warning { background: var(--color-warning); color: var(--color-warning-foreground); }
    .ui-badge__pill--danger  { background: var(--color-danger);  color: var(--color-danger-foreground); }
  </style>
  <span class="ui-badge__pill ui-badge__pill--neutral">Draft</span>
  <span class="ui-badge__pill ui-badge__pill--success">Active</span>
  <span class="ui-badge__pill ui-badge__pill--info">Beta</span>
  <span class="ui-badge__pill ui-badge__pill--warning">Trial ending</span>
  <span class="ui-badge__pill ui-badge__pill--danger">Past due</span>
</div>`;

export const badge: KitComponent = {
  name: "Display/Badge",
  category: "display",
  markup,
  description: "Status badge — neutral plus the success/info/warning/danger status quartet, each on its paired token role.",
  status: "stable",
  variants: [
    "Tone=Neutral", "Tone=Success", "Tone=Info", "Tone=Warning", "Tone=Danger",
    "State=Default",
  ],
  tokensUsed: [
    "color.secondary", "color.secondary-foreground",
    "color.success", "color.success-foreground",
    "color.info", "color.info-foreground",
    "color.warning", "color.warning-foreground",
    "color.danger", "color.danger-foreground",
    "radius.full", "font-family.body", "font-weight.medium",
    "font-size.xs",
    "space.1", "space.3",
  ],
};
