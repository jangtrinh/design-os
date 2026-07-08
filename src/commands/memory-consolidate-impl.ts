/**
 * `ui memory consolidate` — rebuild the cross-project taste profile from the
 * registry, optionally appending one provenance-carrying insight. User-scope.
 */
import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { consolidate } from "../core/memory-profile.js";
import type { ProfileInsight } from "../core/memory-profile.js";
import { loadRegistry, loadProfile, saveProfile } from "../core/memory-store.js";
import { loadPersonaIndex } from "../core/persona-loader.js";

/** Build a persona-slug → family resolver from the bundled index (identity fallback). */
function familyResolver(): (slug: string) => string {
  try {
    const records = loadPersonaIndex(undefined) as ReadonlyArray<{ slug?: unknown; family?: unknown }>;
    const map = new Map<string, string>();
    for (const r of records) {
      if (typeof r.slug === "string" && typeof r.family === "string") map.set(r.slug, r.family);
    }
    return (slug: string) => map.get(slug) ?? slug;
  } catch {
    return (slug: string) => slug;
  }
}

/** Parse --refs '<json>' into the insight provenance shape, or throw a message. */
function parseInsightRefs(raw: string): { project: string; events: string[] }[] {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    throw new Error("--refs is not valid JSON");
  }
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('--refs must be a non-empty JSON array of {"project","events"}');
  return arr.map((r) => {
    const o = r as Record<string, unknown>;
    if (typeof o["project"] !== "string" || !Array.isArray(o["events"])) {
      throw new Error('each --refs entry needs {"project": string, "events": string[]}');
    }
    return { project: o["project"] as string, events: (o["events"] as unknown[]).map(String) };
  });
}

export function runConsolidate(parsed: ParsedArgs): CommandResult {
  const CMD = "memory consolidate";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const registry = loadRegistry();
  if (registry.length === 0) {
    // Not an error — cold user with no registered projects yet.
    return useJson ? okJson(CMD, { profiles: 0, message: "no projects yet" }) : ok("profile: no projects yet\n");
  }

  const nowFlag = parsed.flags["now"];
  const nowIso = typeof nowFlag === "string" ? nowFlag : new Date().toISOString();
  if (typeof nowFlag === "string" && Number.isNaN(Date.parse(nowFlag))) {
    return err("BAD_ARG", `--now expected an ISO-8601 timestamp, got '${nowFlag}'`);
  }
  const actor = typeof parsed.flags["actor"] === "string" ? (parsed.flags["actor"] as string) : undefined;

  // Assemble insights: preserved from the prior profile + one optional new insight.
  const prior = loadProfile();
  const insights: ProfileInsight[] = prior !== null ? [...prior.insights] : [];
  const insightText = parsed.flags["insight"];
  if (typeof insightText === "string") {
    const refsRaw = parsed.flags["refs"];
    if (typeof refsRaw !== "string") return err("BAD_ARG", "--insight requires --refs '<json>' (provenance)");
    let refs;
    try {
      refs = parseInsightRefs(refsRaw);
    } catch (e) {
      return err("BAD_ARG", e instanceof Error ? e.message : String(e));
    }
    insights.push({ text: insightText, refs, addedAt: nowIso });
  }

  const profile = consolidate({ registry, nowIso, actor, familyOf: familyResolver(), insights });
  try {
    saveProfile(profile);
  } catch (e) {
    return err("BAD_ARG", `cannot write profile: ${e instanceof Error ? e.message : String(e)}`);
  }

  const c = profile.computed;
  const summary =
    `profile: ${profile.projects} project(s), ${Object.keys(c.personaFamilies).length} persona ` +
    `families, ${c.recurringVibes.length} recurring vibes, ${c.avoids.length} avoids, ${profile.insights.length} insight(s)`;
  return useJson ? okJson(CMD, profile) : ok(summary + "\n");
}
