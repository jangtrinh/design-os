/**
 * COMPONENT_KIT — the mature default component kit `ds init` registers into every fresh
 * design system (unless `--bare`). It ships 14 `stable` `ComponentRecord`s: the 7 Control-family
 * controls (wave A) plus Field, Badge, Card, Alert, Tabs, Table, and Dialog (wave B). Each uses
 * ONLY the L8 semantic token tier and declares its full State matrix via `variants`, so
 * `ds specimen` reports zero gaps on a fresh DS.
 *
 * The array is sorted by name for deterministic registration order (saveRegistry also
 * sorts on write, but a sorted source keeps this list self-documenting).
 */
import type { ComponentRecord } from "../registry-store.js";
import { alert } from "./alert.js";
import { badge } from "./badge.js";
import { button } from "./button.js";
import { card } from "./card.js";
import { checkbox } from "./checkbox.js";
import { dialog } from "./dialog.js";
import { field } from "./field.js";
import { input } from "./input.js";
import { radio } from "./radio.js";
import { select } from "./select.js";
import { switchControl } from "./switch.js";
import { table } from "./table.js";
import { tabs } from "./tabs.js";
import { textarea } from "./textarea.js";

export const COMPONENT_KIT: ComponentRecord[] = [
  alert,
  badge,
  button,
  card,
  checkbox,
  dialog,
  field,
  input,
  radio,
  select,
  switchControl,
  table,
  tabs,
  textarea,
].sort((a, b) => a.name.localeCompare(b.name));
