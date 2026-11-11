/**
 * Which app root `ui ds surface` reads (spec 033 FR-019, controller ruling R1). `--app` names one; without it:
 *  - the roots the owner kept (`app-roots` outcome `keep`) that the walk reached: exactly one is the default, more than
 *    one is refused by name (never the first), none falls through;
 *  - the scan root, when its package.json names a framework;
 *  - the single entry of `apps[]` that names a framework (a shared config package or a fixtures directory is never the
 *    default);
 *  - otherwise there is no default: ONBOARD_BLOCKED_NEEDS_OWNER_RULING.
 * An `--app` that names a root the owner ruled out, or a directory that is not an app root, is refused by name.
 * The scan root is the app "" (reported as ".").
 */
import { walkDecision } from "../project-scan-rulings.js";
import type { ScanRulings } from "../project-scan-rulings.js";

export interface AppChoiceInput {
  flag?: string;
  /** Nested app roots the walk found, with the framework each names. */
  apps: readonly { path: string; framework: string | null }[];
  rootFramework: string | null;
  rootHasPackage: boolean;
  rulings: ScanRulings;
}
export type AppChoice = { ok: true; app: string } | { ok: false; code: string; message: string };

const refuse = (code: string, message: string): AppChoice => ({ ok: false, code, message });
const list = (paths: readonly string[]): string => paths.map((p) => `'${p}'`).join(", ");
const clean = (p: string): string => p.normalize("NFC").replace(/^\.\//, "").replace(/\/+$/, "");

export function chooseAppRoot(input: AppChoiceInput): AppChoice {
  const walked = input.apps.map((a) => a.path);
  if (input.flag !== undefined) {
    const flag = clean(input.flag);
    if (flag === "." || flag === "") {
      return input.rootHasPackage ? { ok: true, app: "" } : refuse("SURFACE_APP_NOT_A_ROOT", `'--app ${input.flag}': the scan root holds no package.json, so it is not an app root. App roots found: ${walked.length === 0 ? "none" : list(walked)}`);
    }
    if (input.rulings.dropRoots.includes(flag) || walkDecision(input.rulings, flag) !== "walk") {
      return refuse("SURFACE_APP_DROPPED", `'--app ${input.flag}' is a directory the owner ruled out (an app-roots drop or a scan-budget skip), so it is not read. App roots read: ${walked.length === 0 ? "none" : list(walked)}`);
    }
    if (!walked.includes(flag)) {
      return refuse("SURFACE_APP_NOT_A_ROOT", `'--app ${input.flag}' is not an app root (a directory with a package.json below the scan root). App roots found: ${walked.length === 0 ? "none" : list(walked)}`);
    }
    return { ok: true, app: flag };
  }
  const kept = input.rulings.keepRoots.filter((k) => walked.includes(k));
  if (kept.length === 1) return { ok: true, app: kept[0] as string };
  if (kept.length > 1) return refuse("SURFACE_APP_AMBIGUOUS", `the owner kept ${kept.length} app roots (${list(kept)}) and the surface reads one: choose with --app <root>`);
  if (input.rootFramework !== null) return { ok: true, app: "" };
  const named = input.apps.filter((a) => a.framework !== null);
  if (named.length === 1) return { ok: true, app: (named[0] as { path: string }).path };
  return refuse("ONBOARD_BLOCKED_NEEDS_OWNER_RULING", `no app root can be chosen: the scan root names no framework and ${named.length === 0 ? "no nested app root does" : `${named.length} nested app roots do (${list(named.map((a) => a.path))})`}. Choose with --app <root>, or record the app roots with ui onboard questions --format claude`);
}
