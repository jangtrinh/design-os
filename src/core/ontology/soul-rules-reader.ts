/**
 * The rules of `design/soul.md` the owner ratified: the bullets of `## Never` and `## Always`, only when the
 * frontmatter says `status: ratified`. A draft's rules are not nodes. The bullets of `## Never (proposed)` are proposals
 * (evidence, not law): they are counted, never read as rules. Pure over the text.
 */

export interface SoulRule { section: "never" | "always"; text: string }
export interface SoulRead { status: string | null; rules: SoulRule[]; proposed: number }

function status(text: string): string | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return fm === null ? null : (/^status:[ \t]*(\S+)/m.exec(fm[1] ?? "")?.[1] ?? null);
}

/** The bullet texts of the section whose heading is exactly `## <name>`; a bullet that is only an HTML comment is a placeholder. */
function bullets(text: string, name: string): string[] {
  const heading = new RegExp(`^##[ \\t]+${name.replace(/[()]/g, "\\$&")}[ \\t]*$`, "m").exec(text);
  if (heading === null) return [];
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^##[ \t]+\S/m.exec(rest);
  const body = (next === null ? rest : rest.slice(0, next.index)).replace(/<!--[\s\S]*?-->/g, "");
  return [...body.matchAll(/^[ \t]*[-*][ \t]+(.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter((s) => s !== "");
}

export function readSoulRules(text: string): SoulRead {
  const st = status(text);
  const proposed = bullets(text, "Never (proposed)").length;
  if (st !== "ratified") return { status: st, rules: [], proposed };
  const rules: SoulRule[] = [
    ...bullets(text, "Never").map((t): SoulRule => ({ section: "never", text: t })),
    ...bullets(text, "Always").map((t): SoulRule => ({ section: "always", text: t })),
  ];
  return { status: st, rules, proposed };
}
