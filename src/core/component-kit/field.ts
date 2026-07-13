/**
 * Form/Field — the labelled form-row wrapper (label + control slot + help/error line).
 *
 * The abstraction every form control sits inside: a top label (with a required/optional
 * hint), the control, and a reserved message line that switches between muted help and a
 * `--color-danger` error. States: Default | Invalid | Disabled — the invalid row wires
 * `aria-invalid` + `aria-describedby` to its error text. Border strength is the L8
 * `--color-input` role.
 *
 * Leaf role `field` is in the control family, but the row declares no interaction state
 * (hover/focus live on the control component), so the specimen contract asks only for the
 * states present — no `disabled` gap fires.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-field">
  <style>
    .ui-field { display: grid; gap: var(--space-4); font-family: var(--font-family-body); max-width: 420px; }
    .ui-field__row { display: grid; gap: var(--space-1); }
    .ui-field__label { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--color-foreground); }
    .ui-field__req { font-weight: var(--font-weight-regular); color: var(--color-danger); }
    .ui-field__opt { font-weight: var(--font-weight-regular); color: var(--color-muted-foreground); }
    .ui-field__ctrl {
      font: inherit; font-size: var(--font-size-sm); width: 100%; box-sizing: border-box;
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-button);
      border: 1px solid var(--color-input); background: var(--color-background); color: var(--color-foreground);
      transition: border-color var(--duration-fast) ease;
    }
    .ui-field__ctrl.is-invalid { border-color: var(--color-danger); }
    .ui-field__ctrl[disabled] { opacity: 0.5; cursor: not-allowed; }
    .ui-field__msg { font-size: var(--font-size-xs); color: var(--color-muted-foreground); }
    .ui-field__msg.is-error { color: var(--color-danger); }
  </style>
  <div class="ui-field__row">
    <label class="ui-field__label" for="ui-field-default">Work email <span class="ui-field__opt">Optional</span></label>
    <input class="ui-field__ctrl" id="ui-field-default" type="email" value="ada@aurora.dev">
    <p class="ui-field__msg">We only use this for billing receipts.</p>
  </div>
  <div class="ui-field__row">
    <label class="ui-field__label" for="ui-field-invalid">Workspace slug <span class="ui-field__req">Required</span></label>
    <input class="ui-field__ctrl is-invalid" id="ui-field-invalid" type="text" value="Aurora Labs" aria-invalid="true" aria-describedby="ui-field-invalid-msg">
    <p class="ui-field__msg is-error" id="ui-field-invalid-msg">Use lowercase letters and hyphens only.</p>
  </div>
  <div class="ui-field__row">
    <label class="ui-field__label" for="ui-field-disabled">Account owner</label>
    <input class="ui-field__ctrl" id="ui-field-disabled" type="text" value="Managed by SSO" disabled>
    <p class="ui-field__msg">Provisioned by your identity provider.</p>
  </div>
</div>`;

export const field: KitComponent = {
  name: "Form/Field",
  category: "form",
  markup,
  description: "Labelled form-row wrapper — label, control, and a help/error message line across default, invalid, and disabled states.",
  status: "stable",
  variants: [
    "State=Default", "State=Invalid", "State=Disabled",
  ],
  tokensUsed: [
    "color.foreground", "color.input", "color.background",
    "color.danger", "color.muted-foreground",
    "radius.button", "font-family.body",
    "font-weight.medium", "font-weight.regular",
    "font-size.xs", "font-size.sm",
    "space.1", "space.2", "space.3", "space.4",
    "duration.fast",
  ],
};
