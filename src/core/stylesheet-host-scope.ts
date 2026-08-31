/**
 * What an unresolved stylesheet could have been hiding.
 *
 * The binary never fetches remote CSS — that is the determinism contract — so any
 * remote `<link>` makes a run an undercount. True, and it became noise: on 123 real
 * pages, 27% reported UNDERCOUNT and roughly a third of those were nothing but a
 * webfont loader. A caveat that fires on almost every page teaches the reader to
 * skip it, and then it is not protecting anything.
 *
 * So the caveat is scoped to what the sheet can actually hide. A font CDN serves
 * `@font-face` and little else: it can cost you a family name, so `overused-font`
 * may under-fire, but it cannot hide a layout, a colour or a shadow. An unknown
 * host can hide anything, and stays strict.
 *
 * Classified by HOST, deliberately not by URL SHAPE. Protocol-relative (`//…`) was
 * the tempting proxy and it is wrong: `//` says nothing about content, so a
 * protocol-relative layout sheet would be waved through — a new blind spot traded
 * for the old noise.
 *
 * The residual blind spot is named rather than hidden: a font host that also serves
 * layout CSS would be scoped too narrowly here. The allowlist is short and explicit
 * so that risk stays inspectable.
 */

/** Hosts whose stylesheets carry webfonts and nothing that shapes a layout. */
const FONT_CDN_HOSTS = new Set([
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "use.typekit.net",
  "p.typekit.net",
  "fonts.bunny.net",
  "use.fontawesome.com",
]);

/**
 * Hosts that serve everything, where only certain paths are fonts.
 *
 * Kept apart from the host set on purpose: an entry like
 * `"cdn.jsdelivr.net/fontsource"` in a set of HOSTS can never match anything, and
 * dead config in an allowlist is worse than a missing entry — it reads as coverage
 * that does not exist. This repo's own test caught exactly that before it shipped.
 */
const PATH_SCOPED_FONT_HOSTS: Record<string, RegExp> = {
  // `/npm/@fontsource/inter/...` — the `@` is why a bare `/fontsource` misses.
  "cdn.jsdelivr.net": /(?:^|[/@])fontsource/i,
};

/**
 * True when this href points at a known webfont CDN.
 *
 * Parsing is deliberate about protocol-relative and relative hrefs: `//host/x.css`
 * is given a scheme so the host is read correctly, and anything without a host at
 * all (a local path) is NOT a font CDN — a local sheet that failed to resolve is a
 * real gap, not a benign one.
 */
export function isFontCdnHref(href: string): boolean {
  const trimmed = href.trim();
  const withScheme = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  let host: string;
  try {
    host = new URL(withScheme).host.toLowerCase();
  } catch {
    return false; // relative or unparseable: cannot claim it is benign
  }
  if (FONT_CDN_HOSTS.has(host)) return true;
  const pathRule = PATH_SCOPED_FONT_HOSTS[host];
  return pathRule !== undefined && pathRule.test(new URL(withScheme).pathname);
}

export interface SheetScopeSplit {
  /** Sheets that can hide anything. The strict caveat applies. */
  strict: string[];
  /** Known webfont sheets. They can only cost family facts. */
  fontOnly: string[];
}

export function splitUnresolvedSheets(hrefs: readonly string[]): SheetScopeSplit {
  const strict: string[] = [];
  const fontOnly: string[] = [];
  for (const href of hrefs) (isFontCdnHref(href) ? fontOnly : strict).push(href);
  return { strict, fontOnly };
}
