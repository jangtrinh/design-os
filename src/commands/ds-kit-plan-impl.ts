/** Read source facts without classifying, truncating or rewriting the capture. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalStringify } from "../core/ds-manifest.js";
import { hashKitBytes } from "../core/ds-kit-files.js";
import { emitKitTheme } from "../core/ds-kit-theme.js";
import { KitAdoptionError } from "../core/ds-kit-adopt.js";
import { string as validateKitString } from "../core/ds-kit-parse.js";
import { parseTokenFile } from "../core/token-model.js";

function readInput(path: string): Buffer {
  try { return readFileSync(resolve(path)); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code === "ENOENT" ? "FILE_NOT_FOUND" : "READ_ERROR";
    throw new KitAdoptionError(code, `cannot read '${path}': ${error instanceof Error ? error.message : String(error)}`);
  }
}
function parseInput(bytes: Buffer, path: string): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch (error) { throw new KitAdoptionError("BAD_JSON", `invalid UTF-8 JSON '${path}': ${error instanceof Error ? error.message : String(error)}`); }
}
function inputString(value: unknown, label: string, code: "BAD_NAME" | "BAD_KIT"): string {
  try { return validateKitString(value, label); }
  catch (error) { throw new KitAdoptionError(code, error instanceof Error ? error.message : String(error)); }
}

export interface PlanKitOptions { source: string; kind: "figma" | "registry"; tokens: string; out: string; name: string; }
export function planKit(options: PlanKitOptions): { root: string; capturedIds: string[]; complete: false } {
  inputString(options.name, "owner display name", "BAD_NAME");
  if (options.name.length > 64) throw new KitAdoptionError("BAD_NAME", "owner display name must be nonempty, at most 64 characters");
  const sourceBytes = readInput(options.source), tokenBytes = readInput(options.tokens);
  const source: unknown = parseInput(sourceBytes, options.source);
  const tokens: unknown = parseInput(tokenBytes, options.tokens);
  parseTokenFile(tokens);
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray((source as Record<string, unknown>)["components"])) {
    throw new KitAdoptionError("BAD_KIT", "source capture must contain a components array");
  }
  const seenIds = new Set<string>(), seenNames = new Set<string>();
  const mappings = ((source as Record<string, unknown>)["components"] as unknown[]).map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new KitAdoptionError("BAD_KIT", `raw component ${index} must be an object`);
    const record = raw as Record<string, unknown>;
    const name = inputString(record["name"], `raw component ${index} name`, "BAD_KIT");
    const id = options.kind === "figma" ? inputString(record["id"], `raw Figma component ${index} id`, "BAD_KIT") : index;
    const sourceId = `owner:${id}`;
    if (seenIds.has(sourceId) || seenNames.has(name)) throw new KitAdoptionError("BAD_KIT", `duplicate source identity/name '${sourceId}' / '${record["name"]}'`);
    seenIds.add(sourceId); seenNames.add(name);
    return { sourceId, name, disposition: "unresolved", reason: "Owner implementation and evidence not yet authored" };
  });
  const theme = emitKitTheme(tokens, {});
  const sourcePath = `source/${options.kind === "figma" ? "figma" : "registry"}.json`;
  const spec = { version: 1, name: options.name, intent: "Faithful owner kit", target: "react-shadcn-tailwind", minimumComponents: 25,
    sources: [{ id: "owner", kind: options.kind, path: sourcePath, hash: hashKitBytes(sourceBytes), scope: "partial", limitations: ["Capture scope and source facts not yet reviewed"] }],
    tokens: "source/tokens.json", theme: "src/theme.css", aliases: {}, mappings,
    artifacts: [sourcePath, "source/tokens.json", "src/theme.css"],
    cases: [{ id: "build", kind: "build", subject: "kit", description: "Build real React exports and verify import closure" },
      { id: "review", kind: "review", subject: "kit", description: "Review source scope, missing tuple/state facts, fidelity and UI quality" }], evidence: "evidence/receipt.json" };
  const target = resolve(options.out), committed: string[] = [];
  try { mkdirSync(target); }
  catch (error) { throw new KitAdoptionError((error as NodeJS.ErrnoException).code === "EEXIST" ? "KIT_TARGET_EXISTS" : "WRITE_ERROR", `cannot reserve '${target}': ${error instanceof Error ? error.message : String(error)}`); }
  try {
    for (const [path, bytes] of [[sourcePath, sourceBytes], ["source/tokens.json", tokenBytes], ["src/theme.css", theme], ["kit.json", canonicalStringify(spec)]] as const) {
      mkdirSync(dirname(join(target, path)), { recursive: true }); writeFileSync(join(target, path), bytes, { flag: "wx" }); committed.push(path);
    }
  } catch (error) {
    throw new KitAdoptionError("KIT_PLAN_INCOMPLETE", `incomplete reservation '${target}', committed: ${committed.join(", ")}; ${error instanceof Error ? error.message : String(error)}. Retry into a different absent destination.`,
      { path: target, incomplete: true, committed: true, complete: false, committedPaths: committed });
  }
  return { root: target, capturedIds: mappings.map((mapping) => mapping.sourceId), complete: false };
}
