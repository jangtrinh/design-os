/**
 * The plan of `ui ds import` (spec 033 FR-011, FR-012): the questions the file raises, and, once they are answered,
 * the token tree to seal, the roles to apply and the ledger. Pure: it never reads a file and never writes one, so a
 * blocked import has written nothing by construction.
 *
 * Two kinds are raised, both in the same pass (the second does not depend on the answer to the first):
 * `untypeable-tokens` (every member the importer cannot type, one question sub-grouped by reason) and
 * `ambiguous-roles` (every colour token whose name ties between roles). A token kept raw lands under the `raw`
 * category as a string with its source path in the name; no object is ever written as a token value.
 */
import { importFlatTokens } from "./token-import.js";
import { sanitizeSeg } from "./figma-ds-tokens.js";
import { findAliasSkips, findSourceSkips } from "./ds-import-skips.js";
import type { ImportSkip, ImportSkipReason } from "./ds-import-skips.js";
import { recognizeRoles } from "./role-recognition.js";
import type { Role } from "./role-recognition.js";
import type { TokenTree } from "./token-model.js";
import { rulingView } from "./figma-ds-ingest-rulings.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { ambiguousRolesEmitter, NO_ROLE } from "./owner-rulings/kind-ambiguous-roles.js";
import { EXCLUDE, KEEP_RAW, untypeableTokensEmitter } from "./owner-rulings/kind-untypeable-tokens.js";
import type { Ruling } from "./owner-rulings/ruling-store.js";

export const IMPORT_REASONS: readonly ImportSkipReason[] = ["unmappable-type", "null-leaf", "dangling-alias", "alias-cycle", "bad-colour", "ignored-key", "not-token-group"];

export interface ImportLedger {
  /** Every token and every skipped member of the file. */
  in: number;
  written: { total: number; typed: number; keptRaw: number };
  /** One count per reason that occurred. */
  excluded: Partial<Record<ImportSkipReason, number>> & { total: number };
  /** Members withheld because a question about them is open; always 0 on a plan that has a result. */
  pending: number;
}

export interface ImportResult {
  /** The tree to recognise roles on and seal: typed tokens plus the raw ones. */
  tree: TokenTree;
  ledger: ImportLedger;
  /** Every excluded member by reason, with id and name (the envelope lists them all). */
  excludedItems: Partial<Record<ImportSkipReason, { id: string; name: string }[]>>;
  keptRawItems: { id: string; name: string }[];
  /** Roles the owner gave, to apply through `ui ds set-role` once the store is sealed; `left` stayed without one. */
  roles: { path: string; role: Role }[];
  rolesLeftUnassigned: string[];
  stats: { imported: number; skipped: number; byType: Record<string, number>; skippedKeys: { key: string; reason: string }[] };
}

export interface ImportPlan { detections: KindDetection[]; result: ImportResult | null }

const ADVICE = "An alias is written only when its target is written: add the missing target to the token file, or exclude the alias.";

/** Raw token names: the source path, sanitized, unique (a clash takes a numeric suffix in id order). */
function rawNames(items: readonly ImportSkip[]): Map<string, string> {
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const i of [...items].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const base = i.name.split(".").map(sanitizeSeg).join("-") || "x";
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    taken.add(name);
    names.set(i.id, name);
  }
  return names;
}

export function planImport(flat: unknown, rulings: readonly Ruling[]): ImportPlan {
  const view = rulingView(rulings);
  const base = importFlatTokens(flat);
  const source = findSourceSkips(flat);
  const counted = source.filter((s) => s.reason !== "ignored-key").length;
  if (counted !== base.stats.skipped) throw new Error(`internal: the import skipped ${base.stats.skipped} members and the skip finder named ${counted}`);
  const aliasSkips = findAliasSkips(base.dtcg);
  const items = [...source, ...aliasSkips];
  const detections: KindDetection[] = [];

  const untypeable = untypeableTokensEmitter.detect({
    items: items.map((i) => ({ id: i.id, name: i.name, reason: i.reason, keepable: i.raw !== undefined })),
    ...(aliasSkips.length > 0 ? { hint: ADVICE } : {}),
  });
  if (untypeable !== null && untypeable.members.length > 0) detections.push(untypeable);

  // Roles are read from the typed tokens that will be written: an excluded alias is not one of them.
  const excludedAliases = new Set(aliasSkips.map((a) => a.id));
  const typed: TokenTree = {};
  for (const [cat, group] of Object.entries(base.dtcg)) {
    const kept = Object.fromEntries(Object.entries(group).filter(([name]) => !excludedAliases.has(`${cat}.${name}`)));
    if (Object.keys(kept).length > 0) typed[cat] = kept;
  }
  const ambiguous = recognizeRoles(typed).ambiguous;
  const roles = ambiguousRolesEmitter.detect({ ambiguous });
  if (roles !== null && roles.members.length > 0) detections.push(roles);

  if (!detections.every((d) => view.ruled(d))) return { detections, result: null };

  const outcome = (i: ImportSkip): string => view.outcome("untypeable-tokens", i.id) ?? EXCLUDE;
  const keptRaw = items.filter((i) => i.raw !== undefined && outcome(i) === KEEP_RAW);
  const excluded = items.filter((i) => !keptRaw.includes(i));
  const names = rawNames(keptRaw);
  const tree: TokenTree = { ...typed };
  if (keptRaw.length > 0) {
    tree["raw"] = Object.fromEntries(keptRaw.map((i) => [names.get(i.id) as string, { $value: i.raw as string, $type: "string" as const, $description: "kept raw from the imported token file" }]));
  }
  const given = ambiguous.map((path) => ({ path, outcome: view.outcome("ambiguous-roles", path) ?? NO_ROLE }));
  const excludedBy: ImportLedger["excluded"] = { total: excluded.length };
  const excludedItems: ImportResult["excludedItems"] = {};
  for (const r of IMPORT_REASONS) {
    const those = excluded.filter((i) => i.reason === r);
    if (those.length === 0) continue;
    excludedBy[r] = those.length;
    excludedItems[r] = those.map((i) => ({ id: i.id, name: i.name }));
  }
  const typedCount = Object.values(typed).reduce((n, g) => n + Object.keys(g).length, 0);
  // The aliases that cannot be written are among the imported tokens already; only the source members come on top.
  const total = base.stats.imported + source.length;
  const ledger: ImportLedger = { in: total, written: { total: typedCount + keptRaw.length, typed: typedCount, keptRaw: keptRaw.length }, excluded: excludedBy, pending: 0 };
  if (ledger.written.total + excluded.length + ledger.pending !== ledger.in) throw new Error(`ledger does not add up: in ${ledger.in} = written ${ledger.written.total} + excluded ${excluded.length} + pending 0`);
  const byType: Record<string, number> = {};
  for (const group of Object.values(tree)) for (const t of Object.values(group)) byType[t.$type] = (byType[t.$type] ?? 0) + 1;
  return {
    detections,
    result: {
      tree, ledger, excludedItems,
      keptRawItems: keptRaw.map((i) => ({ id: i.id, name: i.name })),
      roles: given.filter((g) => g.outcome !== NO_ROLE).map((g) => ({ path: g.path, role: g.outcome as Role })),
      rolesLeftUnassigned: given.filter((g) => g.outcome === NO_ROLE).map((g) => g.path),
      // A file with nothing to ask is reported exactly as the importer reported it.
      stats: items.length === 0 ? base.stats : { imported: ledger.written.total, skipped: excluded.length, byType, skippedKeys: excluded.map((i) => ({ key: i.name, reason: i.reason })) },
    },
  };
}
