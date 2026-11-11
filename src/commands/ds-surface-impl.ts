/**
 * runSurface — `ui ds surface [--app <root>] [--cwd <dir>] [--out <file>] [--register [--apply]] [--now <UTC-ISO>] [--json]`
 * (spec 033 FR-019, FR-020, FR-027). Reads one app's component directories and reports, exactly and deterministically,
 * every exported component with the tokens its source references, the screens and stories that import components,
 * the name collisions (asked, never resolved) and what could not be read. Read-only unless `--out` or
 * `--register --apply` is given; the only file a read-only call writes is the pending question list of the block
 * contract. `--register` previews the registry records; `--apply` writes them through the shared registration path.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { validLessonTimestamp } from "../core/memory-lessons.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { scanProject } from "../core/project-scan.js";
import { scanRulingsOf } from "../core/project-scan-rulings.js";
import { renderSurfaceText } from "./ds-surface-render.js";
import { openQuestionsOf, surfaceBlock } from "./ds-surface-block.js";
import { BatchRegisterError, readExistingRegistry, registerRecordsOnce } from "./registry-register-batch.js";
import { readAppFiles } from "../core/ds-surface/app-source-files.js";
import { buildSurface } from "../core/ds-surface/build-surface.js";
import { componentDirsOf } from "../core/ds-surface/component-dirs.js";
import { chooseAppRoot } from "../core/ds-surface/choose-app-root.js";
import { applyCollisionRulings } from "../core/ds-surface/collision-rulings.js";
import { planRegistration } from "../core/ds-surface/register-plan.js";
import { readTokenStore } from "../core/ds-surface/token-store.js";
import { buildTokenLookup } from "../core/ds-surface/style-references.js";
import { collisionNameDetections } from "../core/owner-rulings/kind-component-name-collision.js";
import { sourceMatchDetection } from "../core/owner-rulings/kind-component-source-match.js";
import { sourceMatchCandidates } from "../core/ds-surface/source-match-candidates.js";
import type { Registry } from "../core/registry-store.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { RulingStoreError, readRulingStore } from "../core/owner-rulings/ruling-store.js";

const CMD = "ds surface";
const KNOWN_FLAGS = ["app", "cwd", "out", "register", "apply", "now"] as const;

export function runSurface(parsed: ParsedArgs): CommandResult {
  const json = parsed.json;
  const err = (code: string, msg: string): CommandResult => (json ? errJson(CMD, code, msg) : errText(`ui: ${code}: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, KNOWN_FLAGS);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const text = (key: string): string | undefined => (typeof parsed.flags[key] === "string" ? (parsed.flags[key] as string) : undefined);
  for (const key of ["app", "cwd", "out", "now"]) if (parsed.flags[key] !== undefined && text(key) === undefined) return err("BAD_ARG", `--${key} needs a value`);
  const register = parsed.flags["register"] === true;
  const apply = parsed.flags["apply"] === true;
  if (apply && !register) return err("BAD_ARG", "--apply writes the registry records that --register previews: pass --register --apply");
  const nowFlag = text("now");
  if (nowFlag !== undefined && !validLessonTimestamp(nowFlag)) return err("BAD_ARG", `--now expected a UTC ISO-8601 instant such as 2026-11-10T14:00:00Z, got '${nowFlag}'`);
  const cwd = resolve(text("cwd") ?? process.cwd());
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) return err("READ_ERROR", `cannot read the directory '${cwd}'`);
  const outFile = text("out");
  const writes = outFile !== undefined || apply;

  let rulings;
  try { rulings = scanRulingsOf(cwd); }
  catch (e) { if (e instanceof RulingStoreError) return err(e.code, e.message); throw e; }
  const scan = scanProject(cwd, rulings);
  const choice = chooseAppRoot({
    ...(text("app") === undefined ? {} : { flag: text("app") as string }),
    apps: scan.apps.map((a) => ({ path: a.path, framework: a.framework })),
    rootFramework: scan.framework, rootHasPackage: existsSync(join(cwd, "package.json")), rulings,
  });
  const block = (detections: Parameters<typeof surfaceBlock>[0]["detections"], appChosen: boolean, ownKinds: Parameters<typeof surfaceBlock>[0]["ownKinds"]): CommandResult | null => {
    try { return surfaceBlock({ command: CMD, projectDir: cwd, detections, ownKinds, writes, appChosen, json }); }
    catch (e) { if (e instanceof RulingStoreError || e instanceof PendingStoreError) return err(e.code, e.message); throw e; }
  };
  if (!choice.ok) {
    // The project-level questions come first on every refusal: a user who never ran `ui onboard questions` is still asked. An app-choice refusal that is not itself the app-roots question does not wait for it.
    { const blocked = block([], choice.code !== "ONBOARD_BLOCKED_NEEDS_OWNER_RULING", []); if (blocked !== null) return blocked; }
    return err(choice.code, choice.message);
  }

  let store;
  try { store = readTokenStore(join(cwd, "design"), writes); }
  catch (e) { return err(e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "READ_ERROR", e instanceof Error ? e.message : String(e)); }
  const ds = store.ds;

  const app = choice.app;
  const appRoots = scan.apps.map((a) => a.path);
  const files = readAppFiles(cwd, app, appRoots, rulings);
  const model = buildSurface({
    app: app === "" ? "." : app, componentDirs: componentDirsOf(files.sources.keys()),
    tailwindCss: app === "" ? scan.tailwindCss : (scan.apps.find((a) => a.path === app)?.tailwindCss ?? null),
    files, lookup: buildTokenLookup(ds?.tokens),
    scan: { truncated: scan.truncated, visited: scan.visited, budget: scan.budget },
  });
  const sizes: Record<string, number> = {};
  for (const c of model.output.components) sizes[c.dir] = (sizes[c.dir] ?? 0) + 1;
  const collisionInput = { collisions: model.output.collisions, dirSizes: sizes };
  let stored;
  try { stored = readRulingStore(cwd); }
  catch (e) { if (e instanceof RulingStoreError) return err(e.code, e.message); throw e; }
  const ruled = applyCollisionRulings(model.output.collisions, stored.rulings);
  // The registry the surface is read against: a name already in it, from another door, is asked about once per group.
  let existing: Registry | null = null;
  if (register) {
    try { existing = ds !== undefined ? ds.registry : readExistingRegistry(cwd); }
    catch (e) { if (e instanceof BatchRegisterError) return err(e.code, e.message); throw e; }
  }
  const detections = [
    ...collisionNameDetections(collisionInput),
    ...(register ? [sourceMatchDetection({ candidates: sourceMatchCandidates(model, ruled, existing) })] : []),
  ];
  const blocked = block(detections, true, register ? ["component-name-collision", "component-source-match"] : ["component-name-collision"]);
  if (blocked !== null) return blocked;

  model.output.shadowed = ruled.shadowed;
  model.output.tokenStore = store.status === "unverified" ? { status: store.status, drifted: store.drifted } : { status: store.status };

  let plan = null;
  if (register) {
    plan = planRegistration(model, ruled, existing, stored.rulings);
    // A registered code source that no longer matches the tree stops a write before anything is written, `--out` included.
    if (apply && plan.preview.changed.length > 0) {
      const held = plan.preview.changed;
      const first = held[0] as (typeof held)[number];
      return err("SURFACE_REGISTERED_SOURCE_CHANGED", `${held.length} component(s) were registered from a source that has changed since (${held.slice(0, 5).map((c) => `${c.name}: ${c.heldRef} is now ${c.nowRef}`).join(", ")}${held.length > 5 ? ", ..." : ""}). Nothing was written and no record was replaced. Next: ui registry register ${first.name} --category <category> --markup <file> --source-ref ${first.nowRef} --force re-registers a changed component.`);
    }
  }
  const open = openQuestionsOf(cwd);
  const data = { ...model.output, ...(plan === null ? {} : { register: plan.preview }), ...(open === undefined ? {} : { pending: open }) };

  if (outFile !== undefined) {
    const target = resolve(cwd, outFile);
    try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(model.output, null, 2)}\n`, "utf8"); }
    catch (e) { return err("WRITE_ERROR", `cannot write '${target}': ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (!apply || plan === null) return json ? okJson(CMD, data) : { exitCode: 0, stdout: renderSurfaceText(data) };
  try {
    const done = registerRecordsOnce(cwd, plan.batch, plan.links.map((l) => ({ name: l.name, sourceRef: l.sourceRef, tokens: l.tokens })), nowFlag ?? new Date().toISOString(), "ui ds surface --register");
    const applied = { ...data, applied: { file: relative(cwd, done.file).split("\\").join("/"), registered: done.registered, linked: done.linked, separate: done.separate, sealed: done.sealed, ...(done.generation === undefined ? {} : { generation: done.generation }), warnings: done.warnings } };
    return json ? okJson(CMD, applied) : { exitCode: 0, stdout: renderSurfaceText(applied) };
  } catch (e) {
    if (!(e instanceof BatchRegisterError)) throw e;
    const detail = e.refusals.map((r) => `  ${r.name}: ${r.code}: ${r.message}`).join("\n");
    return json ? errJson(CMD, e.code, `${e.message}${detail === "" ? "" : `\n${detail}`}`) : errText(`ui: ${e.code}: ${e.message}\n${detail}${detail === "" ? "" : "\n"}`);
  }
}
