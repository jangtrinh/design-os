#!/usr/bin/env node
/**
 * Generate the examples gallery served by GitHub Pages.
 *
 * The gallery is derived from the artifacts themselves — title, description, and grammar
 * are read out of each file's own `<title>`/`<desc>`/`data-*-grammar` — so a new grammar
 * appears in the gallery by existing, and no hand-maintained list can drift from the
 * corpus. `ui knowledge check` has the same shape for the knowledge index.
 *
 *   node scripts/build-examples-gallery.mjs           # write site/examples/index.html
 *   node scripts/build-examples-gallery.mjs --check   # exit 1 if the committed page drifted
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "site", "examples");
const OUT_FILE = join(OUT_DIR, "index.html");

const CAPABILITIES = [
  { kind: "diagram", dir: join(ROOT, "examples", "diagrams"), attr: "data-diagram-grammar" },
  { kind: "chart", dir: join(ROOT, "examples", "charts"), attr: "data-chart-grammar" },
];

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pull the artifact's own self-description rather than restating it in the gallery. */
function describe(html, attr) {
  const title = /<title id="[^"]*">([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim() ?? "";
  const desc = /<desc id="[^"]*">([\s\S]*?)<\/desc>/.exec(html)?.[1]?.trim() ?? "";
  const grammar = new RegExp(`${attr}="([^"]+)"`).exec(html)?.[1] ?? "";
  return { title, desc, grammar };
}

function collect() {
  return CAPABILITIES.map(({ kind, dir, attr }) => ({
    kind,
    dir,
    items: (existsSync(dir) ? readdirSync(dir) : [])
      .filter((f) => f.endsWith(".html"))
      .sort()
      .map((file) => ({ file, ...describe(readFileSync(join(dir, file), "utf8"), attr) })),
  }));
}

/**
 * A gallery of rendered work is a Portfolio Grid (page-structures.md §1), not a list of
 * text cards: the artifact itself is the strongest thing we can show, so each cell leads
 * with its render and lets the label do the naming. The whole cell is the link, which also
 * clears the 44px tap-target floor without a separate hit area.
 */
function card(kind, item) {
  const thumb = `./thumbs/${kind}s/${item.grammar}`;
  return `        <li class="cell">
          <a class="cell-link" href="./${kind}s/${item.file}">
            <span class="cell-art">
              <picture>
                <source media="(prefers-color-scheme: dark)" srcset="${thumb}-dark.png">
                <img src="${thumb}-light.png" alt="${escapeHtml(item.title)}" loading="lazy" width="1680" height="1000">
              </picture>
            </span>
            <span class="cell-meta">
              <span class="cell-label">${escapeHtml(item.grammar)}</span>
              <span class="cell-name">${escapeHtml(item.title)}</span>
            </span>
          </a>
        </li>`;
}

function render(groups) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const sections = groups.map((g) => `      <section class="band" id="${g.kind}s">
        <header class="band-head">
          <h2 class="band-title">${g.kind === "diagram" ? "Diagrams" : "Charts"}</h2>
          <p class="band-count">${g.items.length} grammars</p>
        </header>
        <ul class="grid">
${g.items.map((item) => card(g.kind, item)).join("\n")}
        </ul>
      </section>`).join("\n\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DESIGN:OS — diagram and chart gallery</title>
<meta name="description" content="${total} worked artifacts, one per grammar. Every one is self-contained, offline, and passes its deterministic linter.">
<style>
  /* Same canonical skin the artifacts resolve to, so the frame and its contents agree. */
  :root {
    --paper: #fbfaf8; --surface: #ffffff; --ink: #1a1a17; --muted: #6f6f66;
    --rule: #e6e3dd; --rule-strong: #d6d2c9; --accent: #b4531f;
    --step-1: 8px; --step-2: 16px; --step-3: 24px; --step-4: 32px;
    --step-5: 48px; --step-6: 64px; --step-7: 96px;
  }
  :root[data-theme="dark"], :root:not([data-theme="light"]) {
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #14140f; --surface: #1c1c17; --ink: #f2efe9; --muted: #a3a096;
      --rule: #2e2e26; --rule-strong: #3d3d33; --accent: #e08c4a;
      color-scheme: dark;
    }
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--paper);
    color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 17px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .shell { max-width: 1240px; margin: 0 auto; padding: var(--step-6) var(--step-3) var(--step-6); }

  /*
   * Editorial masthead. The headline takes a short measure so it lands as one statement;
   * the supporting copy takes a longer one and sits beside it on wide viewports. Holding
   * both to the same narrow column would leave most of the fold empty for no reason.
   */
  .masthead {
    display: grid; gap: var(--step-4) var(--step-6);
    grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
    align-items: end;
    margin-bottom: var(--step-6);
    padding-bottom: var(--step-5);
    border-bottom: 1px solid var(--rule);
  }
  h1 {
    font-size: clamp(34px, 5vw, 56px);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.04;
    max-width: 14ch;
  }
  .masthead-copy { max-width: 56ch; }
  .lede { color: var(--muted); }
  .lede + .lede { margin-top: var(--step-2); }
  .lede a { color: var(--accent); }

  .band { margin-top: var(--step-6); }
  .band-head {
    display: flex; align-items: baseline; justify-content: space-between; gap: var(--step-2);
    padding-bottom: var(--step-2);
    border-bottom: 1px solid var(--rule-strong);
    margin-bottom: var(--step-4);
  }
  .band-title { font-size: 24px; font-weight: 500; letter-spacing: -0.01em; }
  .band-count { color: var(--muted); font-size: 15px; }

  .grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--step-4) var(--step-3);
  }

  .cell-link {
    display: flex; flex-direction: column; gap: var(--step-2);
    color: inherit; text-decoration: none;
    border-radius: 6px;
  }
  .cell-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

  /* The render is the content; the frame stays quiet so the artifact carries the cell. */
  .cell-art {
    display: block; overflow: hidden;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--surface);
    aspect-ratio: 16 / 10;
  }
  .cell-art img {
    width: 100%; height: 100%; display: block;
    object-fit: cover; object-position: top left;
  }
  .cell-link:hover .cell-art { border-color: var(--accent); }

  .cell-meta { display: flex; flex-direction: column; gap: 2px; }
  .cell-label {
    font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); font-weight: 600;
  }
  .cell-name { font-size: 16px; }

  .colophon {
    margin-top: var(--step-7);
    padding-top: var(--step-3);
    border-top: 1px solid var(--rule);
    color: var(--muted);
    font-size: 15px;
    max-width: 62ch;
  }
  .colophon a { color: var(--accent); }
  .colophon code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }

  @media (max-width: 900px) {
    .masthead { grid-template-columns: 1fr; align-items: start; }
    h1 { max-width: 20ch; }
  }
  @media (max-width: 640px) {
    .shell { padding: var(--step-5) var(--step-2) var(--step-5); }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <main class="shell">
    <div class="masthead">
      <h1>${total} grammars, drawn by hand</h1>
      <div class="masthead-copy">
        <p class="lede">One worked artifact per grammar — a single self-contained HTML file
          with hand-authored inline SVG. No diagram DSL, no charting library, no network
          request at view time.</p>
        <p class="lede">Colours resolve to the host project's design tokens and fall back to
          a documented neutral palette when there is none, which is what you are seeing here.
          Every artifact passes its deterministic linter with zero findings.</p>
      </div>
    </div>

${sections}

    <footer class="colophon">
      Generated from the committed corpus by <code>scripts/build-examples-gallery.mjs</code>.
      Diagram craft vendored from <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> (MIT).
    </footer>
  </main>
</body>
</html>
`;
}

// --- README block -----------------------------------------------------------------
// The README shows the same corpus as images. Generating it from the artifacts keeps the
// two in step: a new grammar shows up in both surfaces by existing, and neither carries a
// hand-kept list that can quietly fall behind.

const README = join(ROOT, "README.md");
const BEGIN = "<!-- BEGIN:examples-grid (generated by scripts/build-examples-gallery.mjs) -->";
const END = "<!-- END:examples-grid -->";
const HERO = { diagram: ["architecture", "medallion"], chart: ["bar", "quadrant"] };

const LIVE = "https://jangtrinh.github.io/design-os/examples";

/**
 * GitHub honours <picture> media queries, so each artifact shows in the reader's own
 * theme. Each image links straight to its own live page — someone scanning for the one
 * grammar they need should reach it in a single click, not by way of the index.
 */
function picture(kind, name, title, width) {
  const base = `docs/images/examples/${kind}s/${name}`;
  const img = `<picture><source media="(prefers-color-scheme: dark)" srcset="${base}-dark.png"><img src="${base}-light.png" width="${width}" alt="${escapeHtml(title)}"></picture>`;
  return `<a href="${LIVE}/${kind}s/${name}.html" title="${escapeHtml(title)} — open the live artifact">${img}</a>`;
}

function readmeBlock(groups) {
  const flat = groups.flatMap((g) => g.items.map((i) => ({ ...i, kind: g.kind })));
  const isHero = (i) => HERO[i.kind]?.includes(i.grammar);
  const heroes = flat.filter(isHero);
  const rest = flat.filter((i) => !isHero(i));

  const heroRows = [];
  for (let i = 0; i < heroes.length; i += 2) {
    const cells = heroes.slice(i, i + 2)
      .map((h) => `<td width="50%">${picture(h.kind, h.grammar, h.title, 460)}<br><sub><b>${escapeHtml(h.grammar)}</b> — ${escapeHtml(h.title)}</sub></td>`)
      .join("\n");
    heroRows.push(`<tr>\n${cells}\n</tr>`);
  }

  const restRows = [];
  for (let i = 0; i < rest.length; i += 3) {
    const cells = rest.slice(i, i + 3)
      .map((r) => `<td width="33%">${picture(r.kind, r.grammar, r.title, 300)}<br><sub><b>${escapeHtml(r.grammar)}</b></sub></td>`)
      .join("\n");
    restRows.push(`<tr>\n${cells}\n</tr>`);
  }

  return `${BEGIN}

<table>
${heroRows.join("\n")}
</table>

<details>
<summary><b>All ${flat.length} grammars rendered</b> — every one of these is a committed artifact that passes its linter with zero findings</summary>

<table>
${restRows.join("\n")}
</table>

</details>

${END}`;
}

const groups = collect();
const html = render(groups);
const block = readmeBlock(groups);

function syncReadme() {
  const current = readFileSync(README, "utf8");
  const start = current.indexOf(BEGIN);
  const stop = current.indexOf(END);
  if (start === -1 || stop === -1) return { changed: false, next: current, missing: true };
  const next = current.slice(0, start) + block + current.slice(stop + END.length);
  return { changed: next !== current, next, missing: false };
}

if (process.argv.includes("--check")) {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
  const readme = syncReadme();
  const stale = [];
  if (current !== html) stale.push("site/examples/index.html");
  if (readme.missing) stale.push("README.md (examples-grid markers not found)");
  else if (readme.changed) stale.push("README.md examples grid");
  if (stale.length > 0) {
    console.error(`stale: ${stale.join(", ")} — run 'node scripts/build-examples-gallery.mjs' and commit the result`);
    process.exit(1);
  }
  console.log("examples gallery + README grid: up to date");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html);

/**
 * Publish the artifacts next to the gallery, with a way back out.
 *
 * The nav is injected here rather than committed into the artifacts, because
 * `no-external-ref` permits only same-document `#` fragments and data: URIs — a relative
 * link to the index would fail the very gate these files are meant to demonstrate. So the
 * committed artifact stays self-contained and portable, and the published copy gains the
 * one thing a hosted page needs that a portable file does not: an exit.
 *
 * It carries its own colours rather than the artifact's role tokens, so one nav renders
 * identically above a diagram and a chart.
 */
function navBar(kind, item, siblings) {
  const index = siblings.findIndex((s) => s.grammar === item.grammar);
  const prev = siblings[index - 1];
  const next = siblings[index + 1];
  const step = (target, label, rel) =>
    target
      ? `<a class="dos-step" rel="${rel}" href="./${target.file}" title="${escapeHtml(target.title)}">${label}</a>`
      : `<span class="dos-step is-off" aria-disabled="true">${label}</span>`;

  return `<style>
  /*
   * The artifact centres its content with a flex body. Injecting the bar as a
   * body child therefore made it a flex *sibling* — nav parked to the left of the diagram.
   * Restore normal flow and centre the content block on its own margins instead.
   */
  body { display: block !important; padding-top: 0 !important; }
  body > .frame { margin-inline: auto; }

  .dos-bar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 24px;
    padding: 0 24px;
    min-height: 56px;
    margin-bottom: 32px;
    background: var(--paper-chrome);
    border-bottom: 1px solid var(--rule-chrome);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px;
    color: var(--ink-chrome);
  }
  .dos-bar { --paper-chrome: #fbfaf8; --ink-chrome: #1a1a17; --muted-chrome: #6f6f66;
             --rule-chrome: #e6e3dd; --accent-chrome: #b4531f; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .dos-bar {
      --paper-chrome: #14140f; --ink-chrome: #f2efe9; --muted-chrome: #a3a096;
      --rule-chrome: #2e2e26; --accent-chrome: #e08c4a;
    }
  }
  :root[data-theme="dark"] .dos-bar {
    --paper-chrome: #14140f; --ink-chrome: #f2efe9; --muted-chrome: #a3a096;
    --rule-chrome: #2e2e26; --accent-chrome: #e08c4a;
  }

  /* 44px minimum hit area on every control, per the tap-target floor. */
  .dos-bar a, .dos-step {
    display: inline-flex; align-items: center; min-height: 44px;
    text-decoration: none; color: var(--accent-chrome);
  }
  .dos-bar a:hover { text-decoration: underline; }
  .dos-bar a:focus-visible { outline: 2px solid var(--accent-chrome); outline-offset: -2px; border-radius: 4px; }

  .dos-where { color: var(--muted-chrome); display: inline-flex; align-items: center; gap: 8px; }
  .dos-grammar { color: var(--ink-chrome); font-weight: 600; }
  .dos-steps { margin-left: auto; display: flex; gap: 20px; }
  .dos-step.is-off { color: var(--muted-chrome); opacity: 0.45; }

  @media (max-width: 640px) {
    .dos-bar { gap: 16px; padding: 0 16px; }
    .dos-where { display: none; }
  }
  @media print { .dos-bar { display: none; } }
</style>
<nav class="dos-bar" aria-label="Example gallery">
  <a class="dos-home" href="../index.html">&larr; Gallery</a>
  <span class="dos-where">${kind === "diagram" ? "Diagram" : "Chart"} <span class="dos-grammar">${escapeHtml(item.grammar)}</span></span>
  <span class="dos-steps">${step(prev, "&larr; Prev", "prev")}${step(next, "Next &rarr;", "next")}</span>
</nav>
`;
}

// Pages publishes `site/` only, so the renders the grid points at have to live there too.
const IMAGES = join(ROOT, "docs", "images", "examples");
for (const { kind, items } of groups) {
  const thumbs = join(OUT_DIR, "thumbs", `${kind}s`);
  mkdirSync(thumbs, { recursive: true });
  for (const item of items) {
    for (const theme of ["light", "dark"]) {
      const from = join(IMAGES, `${kind}s`, `${item.grammar}-${theme}.png`);
      if (existsSync(from)) copyFileSync(from, join(thumbs, `${item.grammar}-${theme}.png`));
    }
  }
}

for (const { kind, dir, items } of groups) {
  const dest = join(OUT_DIR, `${kind}s`);
  mkdirSync(dest, { recursive: true });
  for (const item of items) {
    const source = readFileSync(join(dir, item.file), "utf8");
    const published = source.replace(/<body([^>]*)>/i, (m) => `${m}\n${navBar(kind, item, items)}`);
    writeFileSync(join(dest, item.file), published);
  }
}

const readme = syncReadme();
if (readme.missing) {
  console.warn("README.md has no examples-grid markers — skipped the image grid");
} else if (readme.changed) {
  writeFileSync(README, readme.next);
  console.log("examples gallery: updated the README image grid");
}

const total = groups.reduce((sum, g) => sum + g.items.length, 0);
console.log(`examples gallery: wrote ${OUT_FILE} (${total} artifacts)`);
