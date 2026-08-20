/**
 * Agent templates point, never enumerate — the per-role command ALLOWLIST guard.
 * The drift class actually observed (designer.md teaching the superseded
 * four-linter quartet as the handback gate) involves commands that all still
 * EXIST, so an existence check stays green on it forever; only an allowlist
 * pinning what each role SHOULD cite can go red. Journeys and knowledge files
 * legitimately enumerate commands, so they get a plain existence check against
 * COMMAND_SIGNATURES instead.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_TEMPLATE_COMMAND_ALLOWLIST } from "../src/adapters/templates.js";
import { COMMAND_SIGNATURES } from "../src/core/command-signatures.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const AGENTS_DIR = join(ROOT, "templates", "agents");

/** Backticked command spans (`ui …` / `design-os …`), fenced blocks skipped. */
function commandSpans(md: string): string[] {
  const noFences = md.replace(/```[\s\S]*?```/g, "");
  const out: string[] = [];
  for (const m of noFences.matchAll(/`((?:ui|design-os) [^`]+)`/g)) out.push(m[1] as string);
  return out;
}

describe("agent templates cite only their role's allowlisted commands", () => {
  it("every backticked ui/design-os span in templates/agents/* prefix-matches the role allowlist", () => {
    for (const f of readdirSync(AGENTS_DIR).filter((x) => x.endsWith(".md"))) {
      const role = f.replace(/\.md$/, "") as keyof typeof AGENT_TEMPLATE_COMMAND_ALLOWLIST;
      const allow = AGENT_TEMPLATE_COMMAND_ALLOWLIST[role] ?? [];
      expect(allow.length, `no allowlist for role '${role}' — add it in templates.ts`).toBeGreaterThan(0);
      for (const span of commandSpans(readFileSync(join(AGENTS_DIR, f), "utf8"))) {
        const ok = allow.some((prefix) => span.startsWith(prefix));
        expect(ok, `${f} cites \`${span}\` — not under ${role}'s allowlist. Templates point, never enumerate: a live-but-superseded citation (the designer's old four-linter quartet) is exactly the drift this guard exists to catch.`).toBe(true);
      }
    }
  });

  it("allowlisted prefixes name real commands (the allowlist itself cannot rot)", () => {
    const known = new Set(Object.keys(COMMAND_SIGNATURES));
    for (const [role, prefixes] of Object.entries(AGENT_TEMPLATE_COMMAND_ALLOWLIST)) {
      for (const p of prefixes) {
        const head = p.replace(/^(ui|design-os) /, "").split(" ")[0] as string;
        expect(known.has(head), `${role} allowlist prefix '${p}' → unknown command '${head}'`).toBe(true);
      }
    }
  });
});
