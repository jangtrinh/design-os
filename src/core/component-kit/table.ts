/**
 * Data/Table — a semantic table (caption / thead / tbody) with zebra rows.
 *
 * Zebra striping uses `--color-muted`; the hovered row uses the L8 `--color-accent` pair;
 * hairlines are `--color-border`. States: Default | Hover | Empty. The leaf role `table` is
 * in the data family, so the specimen contract REQUIRES an `empty` state — a second table
 * renders the static empty-state row (a `colspan` cell) to satisfy it honestly.
 */
import type { KitComponent } from "./kit-types.js";

const markup = `<div class="ui-kit ui-table">
  <style>
    .ui-table { font-family: var(--font-family-body); display: grid; gap: var(--space-5); }
    .ui-table__t { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); color: var(--color-foreground); }
    .ui-table__t caption { text-align: left; font-size: var(--font-size-xs); color: var(--color-muted-foreground); padding-bottom: var(--space-2); }
    .ui-table__t th { text-align: left; font-weight: var(--font-weight-semibold); font-size: var(--font-size-xs); color: var(--color-muted-foreground); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); }
    .ui-table__t td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); }
    .ui-table__t tbody tr { transition: background var(--duration-fast) ease; }
    .ui-table__t tbody tr:nth-child(even) { background: var(--color-muted); }
    .ui-table__t tbody tr.is-hover { background: var(--color-accent); color: var(--color-accent-foreground); }
    .ui-table__num { text-align: right; font-variant-numeric: tabular-nums; }
    .ui-table__empty { text-align: center; color: var(--color-muted-foreground); padding: var(--space-8) var(--space-3); }
  </style>
  <table class="ui-table__t">
    <caption>Recent invoices</caption>
    <thead>
      <tr><th scope="col">Invoice</th><th scope="col">Client</th><th scope="col" class="ui-table__num">Amount</th></tr>
    </thead>
    <tbody>
      <tr><td>INV-1042</td><td>Aurora Labs</td><td class="ui-table__num">$1,200.00</td></tr>
      <tr><td>INV-1041</td><td>Northwind</td><td class="ui-table__num">$840.00</td></tr>
      <tr class="is-hover"><td>INV-1040</td><td>Globex</td><td class="ui-table__num">$2,050.00</td></tr>
      <tr><td>INV-1039</td><td>Initech</td><td class="ui-table__num">$430.00</td></tr>
    </tbody>
  </table>
  <table class="ui-table__t">
    <caption>Archived invoices</caption>
    <thead>
      <tr><th scope="col">Invoice</th><th scope="col">Client</th><th scope="col" class="ui-table__num">Amount</th></tr>
    </thead>
    <tbody>
      <tr><td class="ui-table__empty" colspan="3">No archived invoices yet.</td></tr>
    </tbody>
  </table>
</div>`;

export const table: KitComponent = {
  name: "Data/Table",
  category: "data",
  markup,
  description: "Data table — semantic caption/thead/tbody with zebra rows, a hovered row, and a static empty state.",
  status: "stable",
  variants: [
    "State=Default", "State=Hover", "State=Empty",
  ],
  tokensUsed: [
    "color.foreground", "color.muted-foreground", "color.border",
    "color.muted", "color.accent", "color.accent-foreground",
    "font-family.body", "font-weight.semibold",
    "font-size.sm", "font-size.xs",
    "space.2", "space.3", "space.5", "space.8",
    "duration.fast",
  ],
};
