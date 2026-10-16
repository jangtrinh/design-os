/**
 * Shared project loading for `ui ds guidelines build | check | export`: resolve the project, load
 * and verify the sealed store (tolerating hash drift only with --allow-unsealed) and read the
 * optional inputs. Command layer only (fs).
 */
import { dirname, join, relative, resolve } from "node:path";

import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { discoverDesignSystem, loadDesignSystem, pathsForDir, DSError } from "../core/design-system.js";
import type { DesignSystem } from "../core/design-system.js";
import { DSManifestError } from "../core/ds-manifest.js";
import { GuidelinesInputError } from "../core/ds-guidelines-model.js";
import type { PackInputs, StoreSourcePaths } from "../core/ds-guidelines-model.js";
import { readPackInputs } from "./ds-guidelines-inputs.js";

export type Err = (code: string, msg: string) => CommandResult;
export interface Loaded { ds: DesignSystem; src: StoreSourcePaths; packDir: string; inputs: PackInputs }

const posix = (p: string): string => p.split("\\").join("/");

/**
 * `packFlag` names the flag that points at the pack directory: `out` for build and check (where the
 * pack is written/read), `pack` for export (whose `--out` is the bundle destination instead).
 */
export function loadProject(parsed: ParsedArgs, err: Err, packFlag: "out" | "pack" = "out"): Loaded | CommandResult {
  const dirFlag = parsed.flags["dir"];
  const packFlagValue = parsed.flags[packFlag];
  const rulingsFlag = parsed.flags["rulings"];
  if (dirFlag === true || packFlagValue === true || rulingsFlag === true) {
    return err("BAD_ARG", `--dir, --${packFlag} and --rulings each need a path`);
  }
  let ds: DesignSystem;
  try {
    const paths = typeof dirFlag === "string" ? pathsForDir(resolve(dirFlag, "design")) : discoverDesignSystem(undefined);
    ds = loadDesignSystem(paths, { allowUnsealed: parsed.flags["allow-unsealed"] === true });
  } catch (e) {
    const code = e instanceof DSError || e instanceof DSManifestError ? e.code : "BAD_DS";
    return err(code, e instanceof Error ? e.message : String(e));
  }
  const projectDir = dirname(ds.paths.dir);
  const src = { tokens: posix(relative(projectDir, ds.paths.tokens)), registry: posix(relative(projectDir, ds.paths.registry)) };
  const packDir = typeof packFlagValue === "string" ? resolve(packFlagValue) : join(ds.paths.dir, "guidelines");
  let inputs: PackInputs;
  try {
    inputs = readPackInputs(projectDir, ds.paths.dir, typeof rulingsFlag === "string" ? rulingsFlag : undefined);
  } catch (e) {
    if (e instanceof GuidelinesInputError) return err(e.code, e.message);
    throw e;
  }
  return { ds, src, packDir, inputs };
}
