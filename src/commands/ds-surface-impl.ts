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
import { surfaceBlock } from "./ds-surface-block.js";
import { BatchRegisterError, readExistingRegistry, registerRecordsOnce } from "./registry-register-batch.js";
import { readAppFiles } from "../core/ds-surface/app-source-files.js";
import { buildSurface } from "../core/ds-surface/build-surface.js";
import { chooseAppRoot } from "../core/ds-surface/choose-app-root.js";
import { applyCollisionRulings } from "../core/ds-surface/collision-rulings.js";
import { planRegistration } from "../core/ds-surface/register-plan.js";
import { readTokenStore } from "../core/ds-surface/token-store.js";
import { buildTokenLookup } from "../core/ds-surface/style-references.js";
import { collisionNameDetections, unaskableCollisions } from "../core/owner-rulings/kind-component-name-collision.js";
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
  const block = (detections: Parameters<typeof surfaceBlock>[0]["detections"], appChosen: boolean): CommandResult | null => {
    try { return surfaceBlock({ command: CMD, projectDir: cwd, detections, writes, appChosen, json }); }
    catch (e) { if (e instanceof RulingStoreError || e instanceof PendingStoreError) return err(e.code, e.message); throw e; }
  };
  if (!choice.ok) {
    // The project-level questions come first: a user who never ran `ui onboard questions` is still asked.
    if (choice.code === "ONBOARD_BLOCKED_NEEDS_OWNER_RULING") { const blocked = block([], false); if (blocked !== null) return blocked; }
    return err(choice.code, choice.message);
  }

  let store;
  try { store = readTokenStore(join(cwd, "design"), writes); }
  catch (e) { return err(e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "READ_ERROR", e instanceof Error ? e.message : String(e)); }
  const ds = store.ds;

  const app = choice.app;
  const appRoots = scan.apps.map((a) => a.path);
  const dirs = app === "" ? scan.componentDirs.filter((d) => !appRoots.some((r) => d.path === r || d.path.startsWith(`${r}/`))) : (scan.apps.find((a) => a.path === app)?.componentDirs ?? []);
  const model = buildSurface({
    app: app === "" ? "." : app, componentDirs: dirs.map((d) => d.path),
    tailwindCss: app === "" ? scan.tailwindCss : (scan.apps.find((a) => a.path === app)?.tailwindCss ?? null),
    files: readAppFiles(cwd, app, appRoots, rulings), lookup: buildTokenLookup(ds?.tokens),
  });
  const sizes: Record<string, number> = {};
  for (const c of model.output.components) sizes[c.dir] = (sizes[c.dir] ?? 0) + 1;
  const collisionInput = { collisions: model.output.collisions, dirSizes: sizes };
  const blocked = block(collisionNameDetections(collisionInput), true);
  if (blocked !== null) return blocked;

  let stored;
  try { stored = readRulingStore(cwd); }
  catch (e) { if (e instanceof RulingStoreError) return err(e.code, e.message); throw e; }
  const ruled = applyCollisionRulings(model.output.collisions, stored.rulings);
  model.output.shadowed = ruled.shadowed;
  model.output.tokenStore = store.status === "unverified" ? { status: store.status, drifted: store.drifted } : { status: store.status };
  const unaskable = unaskableCollisions(collisionInput);
  if (writes && unaskable.length > 0) {
    return err("SURFACE_COLLISION_NOT_ASKABLE", `${unaskable.length} component name(s) are exported twice from one directory in every directory they run between (${unaskable.map((c) => c.name).join(", ")}), so no question can keep one file per name. Rename one export, then run again. Nothing was written.`);
  }

  let plan = null;
  if (register) {
    try { plan = planRegistration(model, ruled, ds !== undefined ? ds.registry : readExistingRegistry(cwd)); }
    catch (e) { if (e instanceof BatchRegisterError) return err(e.code, e.message); throw e; }
    // Names that are already registered stop a write before anything is written, `--out` included.
    if (apply && plan.preview.alreadyRegistered.count > 0) {
      const held = plan.preview.alreadyRegistered;
      return err("SURFACE_NAMES_ALREADY_REGISTERED", `${held.count} component name(s) are already registered (${held.items.slice(0, 5).map((i) => `${i.name} from ${i.existingProvenance ?? "no provenance"}`).join(", ")}${held.count > 5 ? ", ..." : ""}). The rule for names that are already in the registry is not decided, so nothing was written and no record was replaced or renamed. Next: ui ds surface --register lists them.`);
    }
  }
  const data = { ...model.output, ...(plan === null ? {} : { register: plan.preview }) };

  if (outFile !== undefined) {
    const target = resolve(cwd, outFile);
    try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(model.output, null, 2)}\n`, "utf8"); }
    catch (e) { return err("WRITE_ERROR", `cannot write '${target}': ${e instanceof Error ? e.message : String(e)}`); }
  }
  if (!apply || plan === null) return json ? okJson(CMD, data) : { exitCode: 0, stdout: renderSurfaceText(data) };
  try {
    const done = registerRecordsOnce(cwd, plan.batch, nowFlag ?? new Date().toISOString(), "ui ds surface --register");
    const applied = { ...data, applied: { file: relative(cwd, done.file).split("\\").join("/"), registered: done.registered, sealed: done.sealed, ...(done.generation === undefined ? {} : { generation: done.generation }), warnings: done.warnings } };
    return json ? okJson(CMD, applied) : { exitCode: 0, stdout: renderSurfaceText(applied) };
  } catch (e) {
    if (!(e instanceof BatchRegisterError)) throw e;
    const detail = e.refusals.map((r) => `  ${r.name}: ${r.code}: ${r.message}`).join("\n");
    return json ? errJson(CMD, e.code, `${e.message}${detail === "" ? "" : `\n${detail}`}`) : errText(`ui: ${e.code}: ${e.message}\n${detail}${detail === "" ? "" : "\n"}`);
  }
}
