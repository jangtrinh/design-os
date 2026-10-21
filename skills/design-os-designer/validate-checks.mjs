// validate-checks.mjs — the checks validate.mjs runs that read page content or call `ui`.
// Each returns plain lines in the `<check>: <what to fix>` shape. Offline; the only subprocess is `ui`.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SITE_DIR, runUi } from "./shared.mjs";
import { isRemote, referencesIn, resolveLocal } from "./refs.mjs";
import { renderContract } from "./contract-render.mjs";

/** external-request (a remote load) and missing-local-ref (a local load that resolves to nothing). */
export function referenceFailures(siteRoot, manifest) {
  const lines = [];
  for (const file of manifest.files) {
    const abs = join(siteRoot, ...file.path.split("/"));
    if (!existsSync(abs)) continue;
    for (const { ref, line, tag, fetches } of referencesIn(file.path, readFileSync(abs, "utf8"))) {
      if (!fetches) continue; // plain navigation links may point anywhere
      if (isRemote(ref)) {
        const how = tag.startsWith("css") ? `${tag} loads ${ref}` : `<${tag.split(" ")[0]}>${tag.includes(" srcset") ? " srcset" : ""} loads ${ref}`;
        lines.push(`external-request: ${file.path}:${line} ${how} — bundle the asset into the folder; look blocks the network`);
      } else {
        const target = resolveLocal(abs, ref);
        if (target !== null && !existsSync(target)) lines.push(`missing-local-ref: ${file.path}:${line} ${ref} — add the file next to the page or fix the path`);
      }
    }
  }
  return lines;
}

const brief = (message) => {
  const first = String(message).split("\n")[0];
  return first.length > 200 ? first.slice(0, 197) + "..." : first;
};

/**
 * `ui gate` on the evidence entry, graded against the project design system recorded at build time (passed
 * explicitly, so the evidence folder's depth never hides it). Returns { failures, warnings, notes } or { cannotRun }.
 */
export function runGate(ui, evidence, manifest, args) {
  const failures = [];
  const notes = [];
  const recorded = manifest.project?.tokens;
  const tokens = args.tokens ? resolve(args.tokens) : recorded;
  if (tokens !== undefined && !existsSync(tokens)) {
    failures.push(`gate: token-coverage did not run — token file ${tokens} is missing; pass --tokens <file> or rebuild`);
  }
  const useTokens = tokens !== undefined && existsSync(tokens);
  const flags = ["gate", join(SITE_DIR, manifest.entry), "--json", ...(useTokens ? ["--tokens", tokens] : []), ...(args.family ? ["--family", args.family] : [])];
  const run = runUi(ui, flags, evidence);
  let data;
  try {
    data = JSON.parse(run.stdout).data;
  } catch {
    return { cannotRun: `runtime: \`ui gate\` returned no JSON (exit ${run.status}): ${(run.stderr || run.stdout || "").trim().split("\n")[0]}` };
  }
  if (data === undefined || data === null || (run.status !== 0 && run.status !== 1)) return { cannotRun: `runtime: \`ui gate\` exited ${run.status}` };
  const warnings = [];
  for (const [family, result] of Object.entries(data.families ?? {})) {
    for (const f of result.findings ?? []) {
      const where = `${family}/${f.checkId} ${manifest.entry}${f.line ? ":" + f.line : ""} — ${brief(f.message)}`;
      if (f.severity === "error") failures.push(`gate: ${where}`);
      else if (f.severity === "warning") warnings.push(`warn: gate: ${where}`);
    }
  }
  for (const f of data.linkedCssErrors ?? []) failures.push(`gate: linked-css/${f.checkId} — ${brief(f.message)}`);
  const coverage = data.tokenCoverage?.overall?.coverage;
  if (typeof coverage === "number" && coverage < data.tokenCoverageFloor) {
    failures.push(`gate: token-coverage ${Math.round(coverage * 100)}% is below the ${Math.round(data.tokenCoverageFloor * 100)}% floor — style with the project's tokens`);
  } else if (data.tokenCoverage === undefined && !failures.some((l) => l.startsWith("gate: token-coverage"))) {
    notes.push(`gate: token-coverage did not run — no design system found from ${manifest.projectStart ?? "the page folder"}`);
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
