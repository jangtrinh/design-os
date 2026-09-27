/**
 * Thin-family floor (PR-FU5b A2) — pure judge over a persona-family corpus.
 *
 * A family clustered from too few apps, or too few screens per app, is a
 * provisional cluster wearing the same shape as a well-attested one. This
 * flags the ratio and the app-count floor, and treats a family's OWN
 * `history` note ("thin" / "provisional") as a declared exception — the
 * gap is then a recorded decision, not a silent one.
 *
 * Pure transform: no I/O. The command (`src/commands/persona.ts`) owns
 * reading `families.json` and shaping it into `ThinFamilyInput[]`.
 */

const MIN_APPS = 3;

export interface ThinFamilyHistoryEntry {
  note?: unknown;
}

export interface ThinFamilyInput {
  slug: string;
  apps: number;
  screens: number;
  history?: readonly ThinFamilyHistoryEntry[];
}

export interface ThinFamilyRow {
  slug: string;
  apps: number;
  screens: number;
  /** screens / apps, or 0 when apps is 0 (also thin — see MIN_APPS). */
  ratio: number;
  /** ratio below the floor, or apps below MIN_APPS. */
  thin: boolean;
  /** thin AND a history note already says "thin" or "provisional" — a declared gap. */
  excused: boolean;
}

export interface ThinFamilyResult {
  rows: ThinFamilyRow[];
  /** Slugs that are thin and NOT excused — these fail the floor. */
  failing: string[];
  /** true iff no family is thin-and-unexcused. */
  pass: boolean;
}

const EXCUSE_RE = /thin|provisional/i;

/** Does any history entry's note explain this family's thinness? */
function isExcused(history: readonly ThinFamilyHistoryEntry[] | undefined): boolean {
  return (history ?? []).some((h) => typeof h.note === "string" && EXCUSE_RE.test(h.note));
}

/**
 * Judge every family against the screens/app floor and the minimum app count.
 * `minScreensPerApp` is the caller's `--min-screens-per-app` (default 6).
 */
export function lintThinFamilies(
  families: readonly ThinFamilyInput[],
  minScreensPerApp: number,
): ThinFamilyResult {
  const rows: ThinFamilyRow[] = families.map((f) => {
    const ratio = f.apps > 0 ? f.screens / f.apps : 0;
    const thin = ratio < minScreensPerApp || f.apps < MIN_APPS;
    const excused = thin && isExcused(f.history);
    return { slug: f.slug, apps: f.apps, screens: f.screens, ratio, thin, excused };
  });
  const failing = rows.filter((r) => r.thin && !r.excused).map((r) => r.slug);
  return { rows, failing, pass: failing.length === 0 };
}
