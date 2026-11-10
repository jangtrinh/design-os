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
  /** One plain sentence: exactly what the detector matches (printed next to the count). */
  matches: string;
  /** Also read tokens JSON files (a palette or font token is evidence for this probe). */
  readsJson: boolean;
  /** Also read stylesheets (`.css`, `.scss`, `.less`): the cliche can live in a rule, not only in markup or script text. */
  readsStyles: boolean;
  rule?: ProbeRule;
  /** Judge one Figma component by name and size only; returns the evidence text on a hit. */
  figma?: (c: FigmaComponent) => string | undefined;
  /** What the inventory cannot show for this probe; reported as `figma inventory has no <gap>`. */
  figmaGap: string;
}

const named = (re: RegExp) => (c: FigmaComponent): string | undefined => (re.test(c.name) ? `component "${c.name}"${c.w !== undefined && c.h !== undefined ? ` ${c.w}x${c.h}` : ""}` : undefined);

export const NEGATIVE_SPACE_PROBES: readonly ProbeDef[] = [
  { id: "NS-01", slug: "monospace-ui-leak", summary: "monospace on UI controls or tables", matches: "Monospace font families (ui-monospace, monospace, font-mono, SFMono, JetBrains Mono, Fira Code, and Menlo, Consolas, Monaco or Courier inside a font declaration) in markup, scripts, stylesheets and token JSON, outside <code>, <pre>, styled.code and styled.pre.", readsStyles: true, detect: detectMonospace, readsJson: true, figmaGap: "fonts",
    rule: { tokens: MONOSPACE_TOKENS, excludeElements: ["code", "pre"], message: "Monospace type is not part of this design system; use the system sans (code and pre blocks are exempt)." } },
  { id: "NS-02", slug: "pastel-pill-badge", summary: "pastel pill status badges", matches: "A rounded-full or 999-or-more radius (px, em or rem) together with a pastel fill (a 50/100/200 step, a low-opacity tint, a light bg-[#hex], or a light #hex, rgb() or hsl() background) in one class list, one @apply list or one CSS rule.", readsStyles: true, detect: detectPastelPill, readsJson: true, figmaGap: "fills", figma: named(/badge|pill|\btag\b|chip/i) },
  { id: "NS-03", slug: "uppercase-micro-tag", summary: "uppercase micro-tags on badges and chips", matches: "text-transform: uppercase, the uppercase class, and all-caps text inside a badge, chip, tag or pill element.", readsStyles: true, detect: detectUppercaseTag, readsJson: false, figmaGap: "text case" },
  { id: "NS-04", slug: "internal-card-header-bar", summary: "a header bar inside the card that wraps its title and description", matches: "A card-header or card-hdr class, a .card-header selector, or a <Card.Header> or <CardHeader> element.", readsStyles: true, detect: detectCardHeaderBar, readsJson: false, figmaGap: "layer structure", figma: named(/card[\s_/-]*(?:header|hdr)/i) },
  { id: "NS-05", slug: "page-header-subtitle", summary: "a subtitle under the page title", matches: "A paragraph, or an element classed subtitle, page-sub, page-desc or lead, directly after an </h1>.", readsStyles: false, detect: detectPageSubtitle, readsJson: false, figmaGap: "layer structure", figma: named(/sub-?title|page[\s_/-]*(?:sub|desc)/i) },
  { id: "NS-06", slug: "verbose-row-description", summary: "row descriptions over 40 characters", matches: "An element classed description, desc, caption, hint, helper, sub or subtitle whose text is longer than 40 characters.", readsStyles: false, detect: detectVerboseRowDescription, readsJson: false, figmaGap: "text content" },
  { id: "NS-07", slug: "filled-primary-action-in-row", summary: "solid brand-filled action buttons inside rows", matches: "bg-primary with text-primary-foreground on one element, in a file that also has a row or list-item class.", readsStyles: false, detect: detectFilledActionInRow, readsJson: false, figmaGap: "fills" },
  { id: "NS-08", slug: "sparkline-stat-card-grid", summary: "KPI stat-card grids with delta badges", matches: "grid-cols-3 or grid-cols-4 in a file that also mentions a sparkline, a KPI, a stat card or a signed percentage.", readsStyles: false, detect: detectKpiStatGrid, readsJson: false, figmaGap: "layer structure", figma: named(/kpi|stat[s]?[\s_/-]*(?:card|grid)|sparkline/i) },
  { id: "NS-09", slug: "colored-icon-tile", summary: "tinted icon tiles", matches: "A 32-48 px square (size-N, or h-N with w-N) with a rounded-md to rounded-3xl radius and a tinted fill (a pastel step, a brand tint or a light bg-[#hex]), or the same in a CSS rule or @apply list (a light #hex, rgb() or hsl() background counts).", readsStyles: true, detect: detectTintedIconTile, readsJson: false, figmaGap: "fills",
    figma: (c) => (c.w !== undefined && c.w === c.h && c.w >= 32 && c.w <= 48 && /icon|tile|avatar/i.test(c.name) ? `component "${c.name}" ${c.w}x${c.h}` : undefined) },
  { id: "NS-10", slug: "gradient-surface-or-cta", summary: "gradient surfaces or call-to-action buttons", matches: "linear-gradient(, radial-gradient(, conic-gradient( and the classes bg-gradient-, bg-linear-, bg-radial and bg-conic, in markup, scripts, stylesheets and token JSON.", readsStyles: true, detect: detectGradient, readsJson: true, figmaGap: "fills",
    rule: { tokens: GRADIENT_TOKENS, message: "Gradients are not part of this design system; use flat token fills." } },
  { id: "NS-11", slug: "avatar-ring-or-glow", summary: "glow shadows and decorative rings around avatars or icons", matches: "Glow shadows (shadow-[0_0_, drop-shadow-[0_0_, shadow-glow, ring-glow, a coloured shadow class such as shadow-blue-500/50, box-shadow: 0 0 Npx, filter: drop-shadow(0 0 Npx)), a zero-offset spread ring of 2px or more (box-shadow: 0 0 0 Npx) outside :focus rules, and a resting ring-2 to ring-8 on a rounded-full element.", readsStyles: true, detect: detectGlowOrRing, readsJson: false, figmaGap: "effects",
    rule: { tokens: GLOW_TOKENS, message: "Glow shadows are not part of this design system; use the elevation tokens." } },
  { id: "NS-12", slug: "saas-billing-credit-chrome", summary: "billing, credit, upgrade or referral chrome", matches: "The phrases upgrade to pro, premium, plus or plan; credits left, remaining, balance, usage or meter; referral; quota; usage meter.", readsStyles: false, detect: detectBillingChrome, readsJson: false, figmaGap: "text content", figma: named(/upgrade|credit|quota|referral|billing|usage[\s_/-]*meter/i) },
];

/** What no probe sees. Printed with every report, so a zero is read with its blind spots next to it. */
export const NEGATIVE_SPACE_LIMITS: readonly string[] = [
  "A long description styled only with a muted colour, with no description-like class name, is not seen (NS-06).",
  "A filled button with a non-token colour (for example bg-blue-600 text-white) is not judged a filled primary action (NS-07).",
  "A component prop such as a page-header description is not seen as a page subtitle (NS-05).",
  "A tinted bar with no card-header class or element that wraps a title inside a card is not seen as a card header (NS-04).",
  "A class or style assembled at runtime is not seen. Comments and strings are matched as text, which can only suppress a proposal.",
  "A fill that is only a var() reference (for example background: var(--green-100)) is not judged light or coloured (NS-02, NS-09).",
  "Object-style CSS-in-JS ({ borderRadius: 9999, background: '#dcfce7' }) is not read for pills and tiles; only template-literal CSS is.",
  "Nested SCSS or LESS selectors are not joined: only the innermost brace-free rule blocks are judged for pills and tiles.",
  "A code or pre rule in a stylesheet that sets a monospace family still counts for NS-01 (styled.code and styled.pre are exempt).",
  "Test files and vendored code outside the excluded folders are read like any other file.",
];

export const probeById = (id: string): ProbeDef | undefined => NEGATIVE_SPACE_PROBES.find((p) => p.id === id);
