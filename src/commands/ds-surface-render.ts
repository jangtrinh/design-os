/** The text form of `ui ds surface`: counts first, then what needs the owner, then what could not be read. */
import type { RegisterPreview } from "../core/ds-surface/register-plan.js";
import type { SurfaceOutput } from "../core/ds-surface/surface-types.js";

export type SurfaceData = SurfaceOutput & {
  register?: RegisterPreview;
  /** The questions stored for the owner when the read went through; absent when none is open. */
  pending?: { count: number; path: string };
  applied?: { file: string; registered: number; linked: number; separate: number; sealed: boolean; generation?: number; warnings: string[] };
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function renderSurfaceText(d: SurfaceData): string {
  const withTokens = d.components.filter((c) => c.tokens.length > 0).length;
  const unresolved = d.components.reduce((n, c) => n + c.unresolvedStyles, 0);
  const lines = [
    `ds surface: app '${d.app}' — ${plural(d.components.length, "component")}, ${plural(d.collisions.length, "collision")}, ${plural(d.screens.length, "screen")}, ${plural(d.stories.length, "story", "stories")}, ${plural(d.unstoried.length, "unstoried component")}`,
    `  tokens: ${withTokens} of ${d.components.length} component(s) reference tokens exactly; ${plural(unresolved, "style reference")} resolve to no token`,
  ];
  const kinds: Record<string, number> = {};
  for (const c of d.components) for (const [k, n] of Object.entries(c.unresolved)) kinds[k] = (kinds[k] ?? 0) + n;
  const shown = Object.entries(kinds).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
  const noToken = d.components.reduce((n, c) => n + c.utilitiesNamingNoToken, 0);
  if (shown.length > 0 || noToken > 0) lines.push(`  unresolved by kind: ${shown.length > 0 ? shown.join(", ") : "none"}${noToken > 0 ? `; ${plural(noToken, "theme-key utility", "theme-key utilities")} name no token (not in the sum: a colour and a size look alike without the app's theme)` : ""}`);
  if (d.tokenStore.status === "unverified") lines.push(`  token store: unverified, ${d.tokenStore.drifted?.join(" and ")} no longer match the seal (read as they are; ui ds reseal adopts them)`);
  else if (d.tokenStore.status === "none") lines.push("  token store: none sealed in this project, so no reference resolves to a token");
  if (d.tailwindCss !== undefined) lines.push(`  tailwind v4 css: ${d.tailwindCss}`);
  for (const c of d.collisions) lines.push(`  collision: ${c.name} is exported from ${c.files.join(" and ")}`);
  for (const s of d.shadowed) lines.push(`  shadowed: ${s.name} in ${s.file} (ruling ${s.fingerprint.slice(0, 12)})`);
  if (d.pending !== undefined) lines.push(`  question: ${plural(d.pending.count, "open question")} in ${d.pending.path}. Next: ui onboard questions --format claude`);
  const u = d.unread;
  if (u.scan.truncated) lines.push(`  scan: the project scan stopped at its entry cap (${u.scan.visited} entries visited), so app roots may be missing; the components above come from reading the chosen app itself and are not cut by it`);
  if (u.files.length + u.exports.length + u.unresolvedImports > 0) {
    lines.push(`  not read: ${plural(u.files.length, "file")}, ${plural(u.exports.length, "export")}, ${plural(u.unresolvedImports, "import")} that matched no single file (listed with --json)`);
  }
  const r = d.register;
  if (r !== undefined) {
    lines.push(`  register preview: ${plural(r.records.length, "record")} would be written`);
    for (const rec of r.records) lines.push(`    ${rec.name}  ${rec.sourceRef}  tokens: ${rec.tokensUsed.length === 0 ? "none" : rec.tokensUsed.join(", ")}`);
    lines.push(`  notRead: ${plural(r.notRead.count, "component")} registered with no variants because no extractor reads them exactly`);
    if (r.awaitingRuling.length > 0) lines.push(`  awaiting a ruling: ${r.awaitingRuling.map((c) => c.name).join(", ")} (which file is public is the question; nothing is planned for them)`);
    if (r.wouldRefuse.notChecked !== undefined) lines.push(`  refusals not predicted: ${r.wouldRefuse.notChecked}`);
    if (r.wouldRefuse.count > 0) {
      lines.push(`  would be refused: ${plural(r.wouldRefuse.count, "record")} (${Object.entries(r.wouldRefuse.byCode).map(([code, n]) => `${code} ${n}`).join(", ")}); --apply writes nothing while any is refused`);
      for (const i of r.wouldRefuse.items.slice(0, 10)) lines.push(`    ${i.name}  ${i.code}`);
    }
    if (r.notRead.severalUnions.length > 0) lines.push(`  several variant unions: ${r.notRead.severalUnions.join(", ")} hold more than one literal union in their props, so no variant was written (the record keeps no prop name per value)`);
    if (r.links.length > 0) {
      lines.push(`  links: ${plural(r.links.length, "existing record")} would gain a code reference (the record, its provenance and its markup stay as they are)`);
      for (const l of r.links) lines.push(`    ${l.name}  ${l.sourceRef}  tokens added: ${l.tokensAdded.length === 0 ? "none" : l.tokensAdded.join(", ")}`);
    }
    if (r.unchanged > 0) lines.push(`  unchanged: ${plural(r.unchanged, "component")} already registered from exactly this source; nothing is written for them`);
    if (r.changed.length > 0) {
      lines.push(`  changed: ${plural(r.changed.length, "component")} registered from a source that is not what the tree holds now; --apply refuses them and replaces nothing`);
      for (const c of r.changed) lines.push(`    ${c.name}  registered ${c.heldRef}, tree ${c.nowRef}`);
    }
    if (r.awaitingSourceMatch.length > 0) {
      lines.push(`  awaiting a ruling: ${plural(r.awaitingSourceMatch.length, "component")} have the name of a record already in the registry; are they the same components? They are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
      for (const i of r.awaitingSourceMatch) lines.push(`    ${i.name}  held by ${i.existingSource ?? "a record with no provenance"}  code file ${i.file}`);
    }
    if (r.shadowedNotRegistered > 0) lines.push(`  ${plural(r.shadowedNotRegistered, "shadowed file")} not registered (the public file of the name is)`);
  }
  if (d.applied !== undefined) {
    const a = d.applied;
    if (a.registered + a.linked + a.separate === 0) lines.push(`  applied: nothing to write, the registry is as the tree says${a.generation === undefined ? "" : `; no reseal (generation ${a.generation})`}`);
    else lines.push(`  applied: ${a.registered} new, ${a.linked} linked, ${a.separate} separate; written to ${a.file}${a.sealed ? `, resealed once (generation ${a.generation})` : " (no sealed design system: written unsealed)"}`);
    for (const w of d.applied.warnings) lines.push(`    ${w}`);
  } else if (r !== undefined) lines.push("  next: ui ds surface --register --apply writes these records");
  return `${lines.join("\n")}\n`;
}
