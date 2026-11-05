/**
 * negative-space-probes.ts - the twelve cliche-absence probes of the negative-space harvester.
 *
 * Each row names the cliche, its detector over source files (negative-space-detectors.ts), what a
 * Figma inventory can say about it, and the machine rule a zero count may propose. Only `token-ban`
 * exists as a rule kind today, so only probes whose absence a `token-ban` can express carry a `rule`;
 * the rest propose a bullet and wait for their rule kind. Invariant (tested): a proposed rule's tokens
 * are a subset of what its detector searches, so a proposed ban can never fire on text the probe
 * already proved clean.
 */
import {
  detectBillingChrome, detectCardHeaderBar, detectFilledActionInRow, detectGlowOrRing, detectGradient, detectKpiStatGrid, detectMonospace,
  detectPageSubtitle, detectPastelPill, detectTintedIconTile, detectUppercaseTag, detectVerboseRowDescription,
  GLOW_TOKENS, GRADIENT_TOKENS, MONOSPACE_TOKENS,
} from "./negative-space-detectors.js";
import type { Detector } from "./negative-space-detector-kit.js";

export interface ProbeRule { tokens: readonly string[]; excludeElements?: readonly string[]; message: string }
export interface FigmaComponent { name: string; w?: number; h?: number }
export interface ProbeDef {
  id: string;
  slug: string;
  /** Bullet phrase: what the system never does. */
  summary: string;
  detect: Detector;
  /** Also read tokens JSON files (a palette or font token is evidence for this probe). */
  readsJson: boolean;
  rule?: ProbeRule;
  /** Judge one Figma component by name and size only; returns the evidence text on a hit. */
  figma?: (c: FigmaComponent) => string | undefined;
  /** What the inventory cannot show for this probe; reported as `figma inventory has no <gap>`. */
  figmaGap: string;
}

const named = (re: RegExp) => (c: FigmaComponent): string | undefined => (re.test(c.name) ? `component "${c.name}"${c.w !== undefined && c.h !== undefined ? ` ${c.w}x${c.h}` : ""}` : undefined);

export const NEGATIVE_SPACE_PROBES: readonly ProbeDef[] = [
  { id: "NS-01", slug: "monospace-ui-leak", summary: "monospace on UI controls or tables", detect: detectMonospace, readsJson: true, figmaGap: "fonts",
    rule: { tokens: MONOSPACE_TOKENS, excludeElements: ["code", "pre"], message: "Monospace type is not part of this design system; use the system sans (code and pre blocks are exempt)." } },
  { id: "NS-02", slug: "pastel-pill-badge", summary: "pastel pill status badges", detect: detectPastelPill, readsJson: true, figmaGap: "fills", figma: named(/badge|pill|\btag\b|chip/i) },
  { id: "NS-03", slug: "uppercase-micro-tag", summary: "uppercase micro-tags on badges and chips", detect: detectUppercaseTag, readsJson: false, figmaGap: "text case" },
  { id: "NS-04", slug: "internal-card-header-bar", summary: "a header bar inside the card that wraps its title and description", detect: detectCardHeaderBar, readsJson: false, figmaGap: "layer structure", figma: named(/card[\s_/-]*(?:header|hdr)/i) },
  { id: "NS-05", slug: "page-header-subtitle", summary: "a subtitle under the page title", detect: detectPageSubtitle, readsJson: false, figmaGap: "layer structure", figma: named(/sub-?title|page[\s_/-]*(?:sub|desc)/i) },
  { id: "NS-06", slug: "verbose-row-description", summary: "row descriptions over 40 characters", detect: detectVerboseRowDescription, readsJson: false, figmaGap: "text content" },
  { id: "NS-07", slug: "filled-primary-action-in-row", summary: "solid brand-filled action buttons inside rows", detect: detectFilledActionInRow, readsJson: false, figmaGap: "fills" },
  { id: "NS-08", slug: "sparkline-stat-card-grid", summary: "KPI stat-card grids with delta badges", detect: detectKpiStatGrid, readsJson: false, figmaGap: "layer structure", figma: named(/kpi|stat[s]?[\s_/-]*(?:card|grid)|sparkline/i) },
  { id: "NS-09", slug: "colored-icon-tile", summary: "tinted icon tiles", detect: detectTintedIconTile, readsJson: false, figmaGap: "fills",
    figma: (c) => (c.w !== undefined && c.w === c.h && c.w >= 32 && c.w <= 48 && /icon|tile|avatar/i.test(c.name) ? `component "${c.name}" ${c.w}x${c.h}` : undefined) },
  { id: "NS-10", slug: "gradient-surface-or-cta", summary: "gradient surfaces or call-to-action buttons", detect: detectGradient, readsJson: true, figmaGap: "fills",
    rule: { tokens: GRADIENT_TOKENS, message: "Gradients are not part of this design system; use flat token fills." } },
  { id: "NS-11", slug: "avatar-ring-or-glow", summary: "glow shadows and decorative rings around avatars or icons", detect: detectGlowOrRing, readsJson: false, figmaGap: "effects",
    rule: { tokens: GLOW_TOKENS, message: "Glow shadows are not part of this design system; use the elevation tokens." } },
  { id: "NS-12", slug: "saas-billing-credit-chrome", summary: "billing, credit, upgrade or referral chrome", detect: detectBillingChrome, readsJson: false, figmaGap: "text content", figma: named(/upgrade|credit|quota|referral|billing|usage[\s_/-]*meter/i) },
];

export const probeById = (id: string): ProbeDef | undefined => NEGATIVE_SPACE_PROBES.find((p) => p.id === id);
