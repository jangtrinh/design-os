/**
 * `ui memory context [--for generate|critique|why]` — emit the memory as a
 * compact prior for the host model (mirrors `ds context`).
 *
 * Invariant #4: memory BIASES generation, never scores critique. So `--for
 * critique` emits ONLY token rationales + design fingerprints (no persona/vibe
 * preference, no taste profile) — the gate stays craft-only. `--for generate|why`
 * add the cross-project taste profile, labelled "fills gaps only". Cold start is
 * not an error: an absent ledger prints `memory: empty` and exits 0.
 */
import { existsSync, readFileSync } from "node:fs";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { memoryPaths, loadGraph, loadProfile, readEvents } from "../core/memory-store.js";
import type { MemoryGraph } from "../core/memory-graph.js";
import { exportCorpus, corpusById, parseRankFile } from "../core/memory-corpus.js";
import type { CorpusItem } from "../core/memory-corpus.js";

const FOR_MODES = ["generate", "critique", "why"] as const;
type ForMode = (typeof FOR_MODES)[number];

/** Most recalled items ever spliced into the prior, however long the rank file is. */
const RECALL_CAP = 10;

interface Section { label: string; lines: string[] }

function personaLines(g: MemoryGraph): string[] {
  return Object.entries(g.personas)
    .filter(([, p]) => p.rawPicks > 0)
    .sort((a, b) => b[1].pickWeight - a[1].pickWeight || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([slug, p]) => `- ${slug} — ${p.rawPicks} pick(s), weight ${p.pickWeight}`);
}
function vibeLines(g: MemoryGraph): string[] {
  return g.vibes.slice(0, 3).map((v) => `- "${v.word}" → ${v.axis || "?"} (${v.count}×, weight ${v.weight})`);
}
function axisLines(g: MemoryGraph): string[] {
  return Object.entries(g.axes)
    .filter(([, a]) => a.failWeight > 0)
    .sort((a, b) => b[1].failWeight - a[1].failWeight || a[0].localeCompare(b[0]))
    .map(([axis, a]) => `- ${axis} (fail weight ${a.failWeight})${a.fixes.length ? `; fixes tried: ${a.fixes.join(", ")}` : ""}`);
}
function tokenLines(g: MemoryGraph): string[] {
  return Object.entries(g.tokens)
    .filter(([, t]) => t.lastReason !== undefined)
    .map(([path, t]) => `- ${path} — "${t.lastReason}" (${t.changes} change(s))`);
}
function designLines(g: MemoryGraph): string[] {
  return Object.entries(g.designs)
    .filter(([, d]) => d.lastFingerprint !== undefined)
    .map(([id, d]) => `- ${id} [${d.medium.join(", ")}]${d.picked ? "{picked}" : ""} ${d.lastFingerprint}`);
}
/** Recalled corpus items, rank order preserved; the event id keeps provenance visible. */
function recalledLines(items: readonly CorpusItem[]): string[] {
  return items.map((i) => `- (${i.tier}) ${i.text} [${i.id}]`);
}

/** Assemble sections, drop whole trailing sections until within maxBytes. */
function render(header: string, sections: Section[], maxBytes: number): string {
  const active = sections.filter((s) => s.lines.length > 0);
  for (let keep = active.length; keep >= 0; keep--) {
    const blocks = active.slice(0, keep).map((s) => `${s.label}\n${s.lines.join("\n")}`);
    const out = [header, ...blocks].join("\n\n") + "\n";
    if (keep === 0 || Buffer.byteLength(out, "utf8") <= maxBytes) return out;
  }
  return header + "\n";
}

export function runContext(parsed: ParsedArgs): CommandResult {
  const CMD = "memory context";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

  const forRaw = parsed.flags["for"];
  const mode: ForMode = typeof forRaw === "string" && (FOR_MODES as readonly string[]).includes(forRaw)
    ? (forRaw as ForMode)
    : "generate";
  if (typeof forRaw === "string" && !(FOR_MODES as readonly string[]).includes(forRaw)) {
    return err("BAD_ARG", `--for must be one of ${FOR_MODES.join(", ")}, got '${forRaw}'`);
  }

  let maxBytes = 2048;
  const mb = parsed.flags["max-bytes"];
  if (mb !== undefined) {
    const n = parseInt(String(mb), 10);
    if (Number.isNaN(n) || n <= 0) return err("BAD_ARG", `--max-bytes must be a positive integer, got '${String(mb)}'`);
    maxBytes = n;
  }

  const nowFlag = parsed.flags["now"];
  const nowIso = typeof nowFlag === "string" ? nowFlag : new Date().toISOString();
  if (typeof nowFlag === "string" && Number.isNaN(Date.parse(nowFlag))) {
    return err("BAD_ARG", `--now expected an ISO-8601 timestamp, got '${nowFlag}'`);
  }

  const dirFlag = parsed.flags["dir"];
  const paths = memoryPaths(typeof dirFlag === "string" ? dirFlag : undefined);
  let g: MemoryGraph;
  try {
    g = loadGraph(paths, nowIso);
  } catch (e) {
    return err("BAD_LEDGER", e instanceof Error ? e.message : String(e));
  }

  // Cold start is not a failure (invariant: callers must not break on empty memory).
  if (g.eventCount === 0) {
    return useJson ? okJson(CMD, { for: mode, empty: true }) : ok("memory: empty\n");
  }

  // ── Recalled items (a ranked id list produced by `recall query`) ──
  // Invariant #4: memory biases generation, never scores critique. The rank file is
  // still validated in critique mode (a bad path fails loud) but never spliced.
  const rankFlag = parsed.flags["rank-file"];
  const recalled: CorpusItem[] = [];
  if (typeof rankFlag === "string") {
    if (!existsSync(rankFlag)) return err("FILE_NOT_FOUND", `rank file not found: '${rankFlag}'`);
    let text: string;
    try {
      text = readFileSync(rankFlag, "utf8");
    } catch (e) {
      return err("READ_ERROR", `cannot read rank file '${rankFlag}': ${e instanceof Error ? e.message : String(e)}`);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return err("BAD_ARG", `rank file '${rankFlag}' is not valid JSON`);
    }
    let ids: string[];
    try {
      ids = parseRankFile(raw);
    } catch (e) {
      return err("BAD_ARG", e instanceof Error ? e.message : String(e));
    }
    if (mode !== "critique") {
      let byId: Map<string, CorpusItem>;
      try {
        byId = corpusById(exportCorpus(readEvents(paths)));
      } catch (e) {
        return err("BAD_LEDGER", e instanceof Error ? e.message : String(e));
      }
      for (const id of ids) {
        const item = byId.get(id);
        if (item !== undefined) recalled.push(item);
        if (recalled.length === RECALL_CAP) break;
      }
    }
  }

  const profile = mode === "critique" ? null : loadProfile();

  if (useJson) {
    const prior = mode === "critique"
      ? { tokens: g.tokens, designs: g.designs }
      : { personas: g.personas, vibes: g.vibes.slice(0, 3), axes: g.axes, tokens: g.tokens, designs: g.designs };
    return okJson(CMD, { for: mode, empty: false, prior, recalled, profile });
  }

  // ── PROJECT PREFERENCE PRIOR ──
  const priorSections: Section[] = mode === "critique"
    ? [
        { label: "Token rationales:", lines: tokenLines(g) },
        { label: "Design fingerprints:", lines: designLines(g) },
      ]
    : [
        { label: "Personas picked:", lines: personaLines(g) },
        { label: "Recurring vibe edits:", lines: vibeLines(g) },
        { label: "Axes that tend to fail:", lines: axisLines(g) },
        { label: "Token rationales:", lines: tokenLines(g) },
        { label: "Design fingerprints:", lines: designLines(g) },
      ];
  const priorHeader =
    "[PROJECT PREFERENCE PRIOR]\nThis project's recorded design history — a prior, not a rule. The brief always wins.";
  let out = render(priorHeader, priorSections, maxBytes);

  // ── RECALLED CONTEXT (semantic recall; outranks the cross-project profile) ──
  if (recalled.length > 0) {
    const rcHeader =
      "[RECALLED CONTEXT]\nSemantically recalled from this project's memory, most relevant first. Cite the event id when you rely on one.";
    out += "\n" + render(rcHeader, [{ label: "Recalled:", lines: recalledLines(recalled) }], maxBytes);
  }

  // ── DESIGNER TASTE PROFILE (generate|why only) ──
  if (profile !== null && (mode === "generate" || mode === "why")) {
    const famLines = Object.entries(profile.computed.personaFamilies)
      .sort((a, b) => b[1].pickWeight - a[1].pickWeight || a[0].localeCompare(b[0]))
      .map(([fam, f]) => `- ${fam} — weight ${f.pickWeight} (${f.projects} projects)`);
    const pvLines = profile.computed.recurringVibes.map((v) => `- "${v.word}" — weight ${v.weight} (${v.projects} projects)`);
    const avLines = profile.computed.avoids.map((a) => `- ${a.axis} — fail weight ${a.failWeight} (${a.projects} projects)`);
    const tpHeader =
      "[DESIGNER TASTE PROFILE]\nCross-project taste — fills gaps only; never overrides the brief or this project's history.";
    const tp = render(tpHeader, [
      { label: "Persona families favored:", lines: famLines },
      { label: "Recurring vibes:", lines: pvLines },
      { label: "Tends to avoid:", lines: avLines },
    ], maxBytes);
    if (tp.trim() !== tpHeader) out += "\n" + tp;
  }

  return ok(out);
}
