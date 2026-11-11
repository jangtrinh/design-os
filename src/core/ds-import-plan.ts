/**
 * The plan of `ui ds import` (spec 033 FR-011, FR-012): the questions the file raises, and, once they are answered,
 * the token tree to seal, the roles to apply and the ledger. Pure: it never reads a file and never writes one, so a
 * blocked import has written nothing by construction.
 *
 * Three kinds are raised in the same pass: `untypeable-tokens` (every member the importer cannot type, one question
 * sub-grouped by reason), `ambiguous-roles` (every colour token whose name ties between roles) and
 * `token-path-collision` (two keys of the file that become one written path). The first two are computed on the tokens
 * as written, so they are computed again once the collisions are ruled. A token kept raw lands under the `raw`
 * category as a string with its source path in the name; no object is ever written as a token value.
 */
import { importFlatTokens } from "./token-import.js";
import type { ImportResult as FlatImport } from "./token-import.js";
import { sanitizeSeg } from "./figma-ds-tokens.js";
import { findAliasSkips, findSourceSkips } from "./ds-import-skips.js";
import type { ImportSkip, ImportSkipReason } from "./ds-import-skips.js";
import { recognizeRoles } from "./role-recognition.js";
import type { Role } from "./role-recognition.js";
import type { TokenTree } from "./token-model.js";
import { rulingView } from "./figma-ds-ingest-rulings.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { ambiguousRolesEmitter, NO_ROLE } from "./owner-rulings/kind-ambiguous-roles.js";
import { collisionWinner, importCollisionDetection, importCollisionMember } from "./owner-rulings/kind-token-path-collision.js";
import { EXCLUDE, KEEP_RAW, untypeableTokensEmitter } from "./owner-rulings/kind-untypeable-tokens.js";
import type { Ruling } from "./owner-rulings/ruling-store.js";

/** Why a member of the file is not written: one of the seven it cannot be typed for, or it lost a path collision. */
export type ImportExclusionReason = ImportSkipReason | "path-collision";
export const IMPORT_REASONS: readonly ImportExclusionReason[] = ["unmappable-type", "null-leaf", "dangling-alias", "alias-cycle", "bad-colour", "ignored-key", "not-token-group", "path-collision"];

export interface ImportLedger {
  /** Every token and every skipped member of the file. */
  in: number;
  written: { total: number; typed: number; keptRaw: number };
  /** One count per reason that occurred. */
  excluded: Partial<Record<ImportExclusionReason, number>> & { total: number };
  /** Members withheld because a question about them is open; always 0 on a plan that has a result. */
  pending: number;
}

export interface ImportResult {
  /** The tree to recognise roles on and seal: typed tokens plus the raw ones. */
  tree: TokenTree;
  ledger: ImportLedger;
  /** Every excluded member by reason, with id and name (the envelope lists them all). */
  excludedItems: Partial<Record<ImportExclusionReason, { id: string; name: string }[]>>;
  keptRawItems: { id: string; name: string }[];
  /** Roles the owner gave, to apply through `ui ds set-role` once the store is sealed; `left` stayed without one. */
  roles: { path: string; role: Role }[];
  rolesLeftUnassigned: string[];
  stats: { imported: number; skipped: number; byType: Record<string, number>; skippedKeys: { key: string; reason: string }[] };
}

export interface ImportPlan {
  detections: KindDetection[];
  result: ImportResult | null;
  /** Every token path the file holds, written or not (typed, kept raw or left out): what a registry binding may name. */
  sourcePaths: ReadonlySet<string>;
}

const ADVICE = "An alias is written only when its target is written: add the missing target to the token file, or exclude the alias.";

/** Raw token names: the source path, sanitized, unique (a clash takes a numeric suffix in id order). */
function rawNames(items: readonly ImportSkip[], alreadyTaken: Iterable<string>): Map<string, string> {
  const taken = new Set<string>(alreadyTaken);
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

/** The ledger must add up: every member of the file is written, excluded, or still pending. */
export function assertLedgerBalances(l: ImportLedger): void {
  if (l.written.total + l.excluded.total + l.pending !== l.in) throw new Error(`ledger does not add up: in ${l.in} = written ${l.written.total} + excluded ${l.excluded.total} + pending ${l.pending}`);
}

/** Merging the kept-raw tokens into the tree must leave every typed token where it was, untouched. */
export function assertTypedTokensKept(typed: TokenTree, tree: TokenTree): void {
  for (const [cat, group] of Object.entries(typed)) {
    for (const name of Object.keys(group)) if (tree[cat]?.[name] !== group[name]) throw new Error(`internal: the token ${cat}.${name} was replaced while the plan was built`);
  }
}

/** The importer and the skip finder walk the file by one rule; a disagreement is a bug, never a quiet difference. */
export function assertSkipFinderAgrees(importerSkipped: number, finderNamed: number): void {
  if (importerSkipped !== finderNamed) throw new Error(`internal: the import skipped ${importerSkipped} members and the skip finder named ${finderNamed}`);
}

/** Every token path the importer wrote. */
function pathsOf(base: FlatImport): Set<string> {
  const paths = new Set<string>();
  for (const [cat, group] of Object.entries(base.dtcg)) for (const name of Object.keys(group)) paths.add(`${cat}.${name}`);
  return paths;
}

/** The collision question for the keys of `flat` that write one path; null when none does. */
function collisionQuestion(first: FlatImport): ReturnType<typeof importCollisionDetection> {
  return importCollisionDetection({
    collisions: first.collisions.map((c) => ({ path: c.path, keys: c.keys.map((k) => ({ ...k, aliases: first.aliasesNaming.get(k.name) ?? 0 })) })),
  });
}

export function planImport(flat: unknown, rulings: readonly Ruling[]): ImportPlan {
  const view = rulingView(rulings);
  // A colliding path is written by its first key until the owner rules; the plan has no result before that.
  let base = importFlatTokens(flat);
  const collision = collisionQuestion(base);
  if (collision !== null && view.ruled(collision)) {
    const winners = new Map(base.collisions.map((c) => [c.path, collisionWinner(view.outcome("token-path-collision", importCollisionMember(c.path, c.keys)) ?? "")]));
    base = importFlatTokens(flat, winners);
  }
  const source = findSourceSkips(flat);
  const counted = source.filter((s) => s.reason !== "ignored-key").length;
  assertSkipFinderAgrees(base.stats.skipped, counted);
  const aliasSkips = findAliasSkips(base.dtcg, base.unreachableAliases);
  const items = [...source, ...aliasSkips];
  const detections: KindDetection[] = [];
  const sourcePaths = pathsOf(base);
  for (const i of items) { sourcePaths.add(i.name); sourcePaths.add(i.name.split(".").map(sanitizeSeg).join(".")); }
  if (collision !== null) {
    detections.push(collision);
    // Which key writes a colliding path decides the other questions, so none is asked before the owner rules: no
    // provisional winner reaches a question or an answer.
    if (!view.ruled(collision)) return { detections, result: null, sourcePaths };
  }

  const untypeable = untypeableTokensEmitter.detect({
    items: items.map((i) => ({ id: i.id, name: i.name, reason: i.reason, keepable: i.raw !== undefined })),
    noun: "member(s)", modes: false,
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
  const { ambiguous, ambiguousFamilies } = recognizeRoles(typed);
  const roles = ambiguousRolesEmitter.detect({ ambiguous, families: ambiguousFamilies });
  if (roles !== null && roles.members.length > 0) detections.push(roles);

  if (!detections.every((d) => view.ruled(d))) return { detections, result: null, sourcePaths };

  const outcome = (i: ImportSkip): string => view.outcome("untypeable-tokens", i.id) ?? EXCLUDE;
  const keptRaw = items.filter((i) => i.raw !== undefined && outcome(i) === KEEP_RAW);
  const excluded = items.filter((i) => !keptRaw.includes(i));
  // The raw group may already hold typed tokens; a kept token goes beside them under a free name, never over one.
  const names = rawNames(keptRaw, Object.keys(typed["raw"] ?? {}));
  const tree: TokenTree = { ...typed };
  if (keptRaw.length > 0) {
    tree["raw"] = { ...(typed["raw"] ?? {}), ...Object.fromEntries(keptRaw.map((i) => [names.get(i.id) as string, { $value: i.raw as string, $type: "string" as const, $description: "kept raw from the imported token file" }])) };
  }
  const given = ambiguous.map((path) => ({ path, outcome: view.outcome("ambiguous-roles", path) ?? NO_ROLE }));
  const lost = base.losers.map((k) => ({ id: k.id, name: k.name }));
  const excludedBy: ImportLedger["excluded"] = { total: excluded.length + lost.length };
  const excludedItems: ImportResult["excludedItems"] = {};
  for (const r of IMPORT_REASONS) {
    const those = r === "path-collision" ? lost : excluded.filter((i) => i.reason === r).map((i) => ({ id: i.id, name: i.name }));
    if (those.length === 0) continue;
    excludedBy[r] = those.length;
    excludedItems[r] = those;
  }
  const treeCount = Object.values(tree).reduce((n, g) => n + Object.keys(g).length, 0);
  assertTypedTokensKept(typed, tree);
  // The aliases that cannot be written are among the imported tokens already; only the source members and the keys
  // that lost a collision come on top.
  const total = base.stats.imported + source.length + lost.length;
  const ledger: ImportLedger = { in: total, written: { total: treeCount, typed: treeCount - keptRaw.length, keptRaw: keptRaw.length }, excluded: excludedBy, pending: 0 };
  assertLedgerBalances(ledger);
  const byType: Record<string, number> = {};
  for (const group of Object.values(tree)) for (const t of Object.values(group)) byType[t.$type] = (byType[t.$type] ?? 0) + 1;
  return {
    detections, sourcePaths,
    result: {
      tree, ledger, excludedItems,
      keptRawItems: keptRaw.map((i) => ({ id: i.id, name: i.name })),
      roles: given.filter((g) => g.outcome !== NO_ROLE).map((g) => ({ path: g.path, role: g.outcome as Role })),
      rolesLeftUnassigned: given.filter((g) => g.outcome === NO_ROLE).map((g) => g.path),
      // A file with nothing to ask is reported exactly as the importer reported it.
      stats: items.length === 0 && lost.length === 0 ? base.stats : {
        imported: ledger.written.total, skipped: excludedBy.total, byType,
        skippedKeys: [...excluded.map((i) => ({ key: i.name, reason: i.reason })), ...lost.map((k) => ({ key: k.name, reason: "path-collision" }))],
      },
    },
  };
}
