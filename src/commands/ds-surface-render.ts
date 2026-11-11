/** The text form of `ui ds surface`: counts first, then what needs the owner, then what could not be read. */
import type { RegisterPreview } from "../core/ds-surface/register-plan.js";
import type { SurfaceOutput } from "../core/ds-surface/surface-types.js";

export type SurfaceData = SurfaceOutput & {
  register?: RegisterPreview;
  applied?: { file: string; registered: number; sealed: boolean; generation?: number; warnings: string[] };
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function renderSurfaceText(d: SurfaceData): string {
  const withTokens = d.components.filter((c) => c.tokens.length > 0).length;
  const unresolved = d.components.reduce((n, c) => n + c.unresolvedStyles, 0);
  const lines = [
    `ds surface: app '${d.app}' — ${plural(d.components.length, "component")}, ${plural(d.collisions.length, "collision")}, ${plural(d.screens.length, "screen")}, ${plural(d.stories.length, "story", "stories")}, ${plural(d.unstoried.length, "unstoried component")}`,
    `  tokens: ${withTokens} of ${d.components.length} component(s) reference tokens exactly; ${plural(unresolved, "style reference")} resolve to no token`,
  ];
  if (d.tailwindCss !== undefined) lines.push(`  tailwind v4 css: ${d.tailwindCss}`);
  for (const c of d.collisions) lines.push(`  collision: ${c.name} is exported from ${c.files.join(" and ")}`);
  for (const s of d.shadowed) lines.push(`  shadowed: ${s.name} in ${s.file} (ruling ${s.fingerprint.slice(0, 12)})`);
  const askedFor = d.collisions.length - new Set(d.shadowed.map((s) => s.name)).size;
  if (askedFor > 0) lines.push(`  question: ${plural(askedFor, "collision")} need an owner ruling and are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
  const u = d.unread;
  if (u.files.length + u.exports.length + u.unresolvedImports > 0) {
    lines.push(`  not read: ${plural(u.files.length, "file")}, ${plural(u.exports.length, "export")}, ${plural(u.unresolvedImports, "import")} that matched no single file (listed with --json)`);
  }
  const r = d.register;
  if (r !== undefined) {
    lines.push(`  register preview: ${plural(r.records.length, "record")} would be written`);
    for (const rec of r.records) lines.push(`    ${rec.name}  ${rec.sourceRef}  tokens: ${rec.tokensUsed.length === 0 ? "none" : rec.tokensUsed.join(", ")}`);
    lines.push(`  notRead: ${plural(r.notRead.count, "component")} registered with no variants because no extractor reads them exactly`);
    if (r.awaitingRuling.length > 0) lines.push(`  awaiting a ruling: ${r.awaitingRuling.map((c) => c.name).join(", ")} (which file is public is the question; nothing is planned for them)`);
    if (r.alreadyRegistered.count > 0) {
      lines.push(`  alreadyRegistered: ${plural(r.alreadyRegistered.count, "name")} already in the registry; --apply writes nothing while that is so (the rule for them is not decided)`);
      for (const i of r.alreadyRegistered.items) lines.push(`    ${i.name}  held by ${i.existingProvenance ?? "a record with no provenance"}  code file ${i.file}`);
    }
    if (r.shadowedNotRegistered > 0) lines.push(`  ${plural(r.shadowedNotRegistered, "shadowed file")} not registered (the public file of the name is)`);
  }
  if (d.applied !== undefined) {
    lines.push(`  applied: ${plural(d.applied.registered, "record")} written to ${d.applied.file}${d.applied.sealed ? `, resealed once (generation ${d.applied.generation})` : " (no sealed design system: written unsealed)"}`);
    for (const w of d.applied.warnings) lines.push(`    ${w}`);
  } else if (r !== undefined) lines.push("  next: ui ds surface --register --apply writes these records");
  return `${lines.join("\n")}\n`;
}
