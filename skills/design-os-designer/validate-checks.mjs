// validate-checks.mjs — the checks validate.mjs runs that call `ui`. Each returns plain lines in the
// `<check>: <what to fix>` shape. Offline; the only subprocess is `ui`, and it grades exactly once per run.
import { join, resolve } from "node:path";
import { SITE_DIR, runUi } from "./shared.mjs";
import { renderContract } from "./contract-render.mjs";

const brief = (message) => {
  const first = String(message).split("\n")[0];
  return first.length > 200 ? first.slice(0, 197) + "..." : first;
};

/**
 * `ui gate` on the evidence entry, ONCE. `ui` owns design-system discovery: it starts from `manifest.projectDir`
 * (`--dir`) and reports where its tokens came from (`tokenCoverageSource`). Whatever `ui` could not run is a
 * failure line or a note carrying its own reason, never a retry: a refused user `--tokens` ends the run's
 * gate verdict there, and the corrected rerun shows the other findings. Returns { failures, warnings, notes }
 * or { cannotRun }.
 */
export function runGate(ui, evidence, manifest, args) {
  const userTokens = args.tokens ? resolve(args.tokens) : undefined;
  const flags = ["gate", join(SITE_DIR, manifest.entry), "--json", "--dir", manifest.projectDir,
    ...(userTokens ? ["--tokens", userTokens] : []), ...(args.family ? ["--family", args.family] : [])];
  const run = runUi(ui, flags, evidence);
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    return { cannotRun: `runtime: \`ui gate\` returned no JSON (exit ${run.status}): ${(run.stderr || run.stdout || "").trim().split("\n")[0]}` };
  }
  if (parsed.ok === false && parsed.error) {
    const { code, message } = parsed.error;
    if (code === "TOKENS_NOT_READABLE" && userTokens !== undefined) {
      return { failures: [`gate: ui refused --tokens ${userTokens} (${code}): ${brief(message)} — fix the path or drop the flag`], warnings: [], notes: [] };
    }
    return { cannotRun: `runtime: \`ui gate\` failed (${code}): ${brief(message)}` };
  }
  const { data } = parsed;
  if (data === undefined || (run.status !== 0 && run.status !== 1)) return { cannotRun: `runtime: \`ui gate\` exited ${run.status}` };
  const failures = [];
  const warnings = [];
  const notes = [];
  for (const [family, found] of Object.entries(data.families ?? {})) {
    for (const f of found.findings ?? []) {
      const where = `${family}/${f.checkId} ${manifest.entry}${f.line ? ":" + f.line : ""} — ${brief(f.message)}`;
      if (f.severity === "error") failures.push(`gate: ${where}`);
      else if (f.severity === "warning") warnings.push(`warn: gate: ${where}`);
    }
  }
  for (const f of data.linkedCssErrors ?? []) failures.push(`gate: linked-css/${f.checkId} — ${brief(f.message)}`);
  const source = data.tokenCoverageSource;
  const coverage = data.tokenCoverage?.overall?.coverage;
  if (source?.error !== undefined) {
    failures.push(`gate: token-coverage did not run — ${source.path} is unreadable (${brief(source.error)}) — fix the project's token file`);
  } else if (typeof coverage === "number" && coverage < data.tokenCoverageFloor) {
    failures.push(`gate: token-coverage ${Math.round(coverage * 100)}% is below the ${Math.round(data.tokenCoverageFloor * 100)}% floor — style with the project's tokens`);
  } else if (source?.origin === "none") {
    notes.push(`note: gate: token-coverage did not run — no design system found from ${manifest.projectDir} (5 folders up, stops at .git)`);
  }
  if (failures.length === 0 && (run.status === 1 || data.pass === false)) failures.push("gate: ui gate failed without a listed finding — run `ui gate` on the entry by hand");
  return { failures, warnings, notes };
}

/** The contract must equal what the installed `ui` generates now, not just match its own header. */
export function contractFailure(ui, contractText) {
  const run = runUi(ui, ["schema", "--json"], process.cwd());
  let rendered;
  try {
    rendered = renderContract(JSON.parse(run.stdout));
  } catch (error) {
    return `contract: the installed ui does not match the commands this skill lists (${brief(error.message)}) — update ease-design`;
  }
  return rendered === contractText ? null : "contract: contract.md differs from what the installed ui generates (stale or edited) — reinstall ease-design to restore the shipped copy";
}
