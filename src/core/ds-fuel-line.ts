/**
 * The fuel line — the loop config every DS store needs to be CAPABLE of evolving
 * (spec 012 P2). Measured gap: `ds init` scaffolded a soul but `ds import` did not
 * (dana was onboarded via import → no soul.md), and NEITHER road wrote a
 * `heartbeat.json` — no project got a rhythm to harvest/reflect against. This
 * module is the single shared helper both `ds init` and `ds import` call so the
 * fix lives once (Art IV), not duplicated per caller.
 *
 * `wireFuelLine` writes three things into a DS's `design/` dir, each ONLY when
 * absent — never clobbers an owner's edited soul.md or a hand-tuned heartbeat.json:
 *   1. soul scaffold (draft) — delegates to `writeSoulScaffold` (ds-soul.ts).
 *   2. `heartbeat.json` — the default Figma-INDEPENDENT task set (ds-a11y,
 *      specimen, harvest, reflect). `figma-audit` is deliberately omitted: it
 *      needs a configured Figma file, which a fresh DS store doesn't have yet.
 *   3. `harvest-inbox/` — the empty dir `harvest` writes into when there's no
 *      model adapter wired.
 *
 * All three are static templates → deterministic writes, no model call, no
 * fabricated content (Art I). None of them participate in the DS seal — that
 * covers only tokens + registry (design-system.ts's verifyHashes) — so writing
 * them can never trip DS_TAMPERED.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeSoulScaffold } from "./ds-soul.js";

export const HEARTBEAT_FILENAME = "heartbeat.json";
export const HARVEST_INBOX_DIRNAME = "harvest-inbox";

/**
 * Default heartbeat config (matches VSF-PCP's proven shape — version 1, a
 * `tasks` array of `{id, type, interval, params?}`) minus `figma-audit`, which
 * only belongs once a project has a Figma file configured.
 */
const DEFAULT_HEARTBEAT = {
  version: 1,
  tasks: [
    { id: "a11y", type: "ds-a11y", interval: "1d" },
    { id: "specimen", type: "specimen", interval: "1d" },
    { id: "harvest", type: "harvest", interval: "12h" },
    { id: "reflect", type: "reflect", interval: "24h", params: { minEvents: 5 } },
  ],
};

export interface FuelLineWriteState { path: string; written: boolean }
export interface FuelLineResult {
  soul: FuelLineWriteState;
  heartbeat: FuelLineWriteState;
  harvestInbox: FuelLineWriteState;
}

/**
 * Wire the learning-loop fuel line into `designDir` (the DS store's `design/`
 * directory). Idempotent: safe to call on every `ds init`/`ds import`
 * invocation, including re-init/re-import — nothing here is ever overwritten
 * once it exists.
 */
export function wireFuelLine(designDir: string): FuelLineResult {
  mkdirSync(designDir, { recursive: true });

  const soul = writeSoulScaffold(designDir);

  const heartbeatPath = join(designDir, HEARTBEAT_FILENAME);
  const heartbeatWritten = !existsSync(heartbeatPath);
  if (heartbeatWritten) {
    writeFileSync(heartbeatPath, JSON.stringify(DEFAULT_HEARTBEAT, null, 2) + "\n", "utf8");
  }

  const harvestInboxPath = join(designDir, HARVEST_INBOX_DIRNAME);
  const harvestInboxWritten = !existsSync(harvestInboxPath);
  mkdirSync(harvestInboxPath, { recursive: true });

  return {
    soul,
    heartbeat: { path: heartbeatPath, written: heartbeatWritten },
    harvestInbox: { path: harvestInboxPath, written: harvestInboxWritten },
  };
}
