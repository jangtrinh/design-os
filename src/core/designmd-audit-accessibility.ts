/**
 * Audit family: accessibility
 *
 * For every YAML component with both `backgroundColor` and `textColor`
 * refs, resolve to hex pair and run WCAG contrast via the existing
 * `contrastRatio` helper. Body-text pairs must clear 4.5:1 (FAIL on
 * fail). Large-text / non-text UI pairs flagged as WARN if they only
 * clear 3:1 (still pass) or fail entirely.
 *
 * We don't try to distinguish body vs large text from the spec — the
 * Google-Labs alpha YAML doesn't expose intent. We classify a pair as
 * "body" by default; future refinement can read a `--treat-as` hint.
 */
import { contrastRatio } from "./color-scale.js";
import type { DesignMdDocument, YamlNode } from "./designmd-parser.js";
import type { AuditRow } from "./designmd-audit-types.js";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const WCAG_BODY = 4.5;
const WCAG_LARGE = 3.0;

interface ContrastPair {
  component: string;
  fg: string;
  bg: string;
}

export function auditAccessibility(doc: DesignMdDocument): AuditRow[] {
  const componentsNode = doc.yamlTree["components"];
  if (!componentsNode || typeof componentsNode === "string") {
    const rolePairs = collectM3RolePairs(doc.yamlTree["colors"]);
    if (rolePairs.length > 0) return evaluatePairs(rolePairs, "M3 role");
    return [{
      family: "accessibility",
      rule: "components-block-present",
      status: "WARN",
      detail: "no components: block in YAML — skipping contrast checks",
    }];
  }

  const pairs: ContrastPair[] = [];
  for (const compName of Object.keys(componentsNode)) {
    const comp = componentsNode[compName];
    if (!comp || typeof comp === "string") continue;
    const fgRaw = comp["textColor"];
    const bgRaw = comp["backgroundColor"];
    if (typeof fgRaw !== "string" || typeof bgRaw !== "string") continue;
    const fg = resolveRef(fgRaw, doc.yamlTree);
    const bg = resolveRef(bgRaw, doc.yamlTree);
    if (fg === undefined || bg === undefined) continue;
    if (!HEX_RE.test(fg) || !HEX_RE.test(bg)) continue;
    pairs.push({ component: compName, fg, bg });
  }

  if (pairs.length === 0) {
    const rolePairs = collectM3RolePairs(doc.yamlTree["colors"]);
    if (rolePairs.length > 0) return evaluatePairs(rolePairs, "M3 role");
    return [{
      family: "accessibility",
      rule: "contrast-pairs-checked",
      status: "WARN",
      detail: "no component had both backgroundColor + textColor refs that resolve to hex — nothing to check",
    }];
  }

  return evaluatePairs(pairs, "component");
}

function collectM3RolePairs(colorsNode: YamlNode | string | undefined): ContrastPair[] {
  if (!colorsNode || typeof colorsNode === "string") return [];
  const pairs: ContrastPair[] = [];
  for (const key of Object.keys(colorsNode)) {
    const fg = colorsNode[key];
    if (typeof fg !== "string" || !HEX_RE.test(fg)) continue;
    let bgKey: string | undefined;
    if (key.startsWith("inverse-on-")) {
      bgKey = `inverse-${key.slice("inverse-on-".length)}`;
    } else if (key.startsWith("on-")) {
      bgKey = key.slice("on-".length);
    }
    if (bgKey === undefined) continue;
    const bg = colorsNode[bgKey];
    if (typeof bg !== "string" || !HEX_RE.test(bg)) continue;
    pairs.push({ component: `${key} on ${bgKey}`, fg, bg });
  }
  return pairs;
}

function evaluatePairs(pairs: ContrastPair[], subjectLabel: string): AuditRow[] {
  const rows: AuditRow[] = [];
  const failures: { component: string; fg: string; bg: string; ratio: number }[] = [];
  const warnings: { component: string; fg: string; bg: string; ratio: number }[] = [];

  for (const p of pairs) {
    const ratio = Math.round(contrastRatio(p.fg, p.bg) * 100) / 100;
    if (ratio < WCAG_LARGE) {
      failures.push({ ...p, ratio });
    } else if (ratio < WCAG_BODY) {
      warnings.push({ ...p, ratio });
    }
  }

  if (failures.length === 0 && warnings.length === 0) {
    rows.push({
      family: "accessibility",
      rule: "wcag-body-contrast",
      status: "PASS",
      detail: `all ${pairs.length} ${subjectLabel} fg/bg pair(s) clear WCAG 4.5:1`,
    });
    return rows;
  }

  if (failures.length > 0) {
    rows.push({
      family: "accessibility",
      rule: "wcag-body-contrast",
      status: "FAIL",
      detail: `${failures.length} pair(s) below WCAG 3:1 (large-text floor): ${failures.slice(0, 3).map(f => `${f.component} (${f.fg} on ${f.bg} = ${f.ratio}:1)`).join("; ")}`,
      suggestedFix: "swap the textColor or backgroundColor ref to a higher-contrast token, or pick a different primitive stop",
    });
  }
  if (warnings.length > 0) {
    rows.push({
      family: "accessibility",
      rule: "wcag-body-contrast-warn",
      status: "WARN",
      detail: `${warnings.length} pair(s) only clear large-text 3:1 (below body 4.5:1): ${warnings.slice(0, 3).map(w => `${w.component} (${w.fg} on ${w.bg} = ${w.ratio}:1)`).join("; ")}`,
      suggestedFix: "if this component carries body-size text, raise contrast; if it's display-only, document the large-text intent",
    });
  }

  return rows;
}

/**
 * Resolve a "{group.name}" ref (or a literal hex) to a hex value.
 * Returns undefined if the reference doesn't resolve to a string scalar.
 */
function resolveRef(value: string, tree: YamlNode): string | undefined {
  if (HEX_RE.test(value)) return value;
  const m = value.match(/^\{([a-zA-Z0-9_.-]+)\}$/);
  if (!m) return undefined;
  const parts = m[1]!.split(".");
  let node: YamlNode | string | undefined = tree;
  for (const p of parts) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[p];
  }
  if (typeof node !== "string") return undefined;
  // Resolved value may itself be another ref or a hex — recurse once.
  if (HEX_RE.test(node)) return node;
  if (/^\{[a-zA-Z0-9_.-]+\}$/.test(node)) return resolveRef(node, tree);
  return undefined;
}
