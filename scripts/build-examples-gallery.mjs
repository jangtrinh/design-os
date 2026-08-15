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

function card(kind, item) {
  return `        <li class="card">
          <a class="card-link" href="./${kind}s/${item.file}">
            <p class="card-grammar">${escapeHtml(item.grammar)}</p>
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            <p class="card-desc">${escapeHtml(item.desc)}</p>
          </a>
        </li>`;
}

function render(groups) {
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  const sections = groups.map((g) => `      <section class="group">
        <h2 class="group-title">${g.kind === "diagram" ? "Diagrams" : "Charts"} <span class="group-count">${g.items.length}</span></h2>
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
  :root {
    --paper: #fbfaf8; --surface: #ffffff; --ink: #1a1a17; --muted: #6f6f66;
    --rule: #e6e3dd; --accent: #b4531f;
  }
  @media (prefers-color-scheme: dark) {
    :root { --paper: #14140f; --surface: #1c1c17; --ink: #f2efe9; --muted: #a3a096;
            --rule: #2e2e26; --accent: #e08c4a; }
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); padding: 64px 24px;
         font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.5; }
  main { max-width: 1080px; margin: 0 auto; }
  .eyebrow { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--muted); }
  h1 { font-size: clamp(28px, 4vw, 40px); font-weight: 500; letter-spacing: -.02em; margin: 8px 0 16px; }
  .lede { color: var(--muted); max-width: 62ch; margin-bottom: 12px; }
  .note { font-size: 13px; color: var(--muted); max-width: 62ch; }
  .group { margin-top: 56px; }
  .group-title { font-size: 13px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
                 color: var(--muted); padding-bottom: 10px; border-bottom: 1px solid var(--rule); }
  .group-count { color: var(--accent); }
  .grid { list-style: none; display: grid; gap: 1px; background: var(--rule);
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          border: 1px solid var(--rule); border-top: none; }
  .card { background: var(--surface); }
  .card-link { display: block; padding: 20px; color: inherit; text-decoration: none; height: 100%; }
  .card-link:hover { background: color-mix(in oklch, var(--accent) 6%, var(--surface)); }
  .card-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .card-grammar { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .card-title { font-size: 16px; font-weight: 500; margin: 6px 0; }
  .card-desc { font-size: 13px; color: var(--muted); }
  footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--rule);
           font-size: 13px; color: var(--muted); }
  a { color: var(--accent); }
</style>
</head>
<body>
  <main>
    <p class="eyebrow">DESIGN:OS</p>
    <h1>Diagram and chart gallery</h1>
    <p class="lede">${total} worked artifacts, one per grammar. Each is a single self-contained HTML file
      with hand-authored inline SVG — no diagram DSL, no charting library, no network request.</p>
    <p class="note">Every artifact here passes its deterministic linter with zero findings: owned SVG,
      resolving accessible name, no script, no external reference, and no colour outside the design
      system. Colours bind to the project's tokens and fall back to a documented neutral palette when
      no design system is present, which is what you are seeing here.</p>

${sections}

    <footer>
      Generated from the committed corpus by <code>scripts/build-examples-gallery.mjs</code>.
      Diagram craft vendored from <a href="https://github.com/cathrynlavery/diagram-design">diagram-design</a> (MIT).
    </footer>
  </main>
</body>
</html>
`;
}

const groups = collect();
const html = render(groups);

if (process.argv.includes("--check")) {
  const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, "utf8") : "";
  if (current !== html) {
    console.error("examples gallery is stale — run 'node scripts/build-examples-gallery.mjs' and commit the result");
    process.exit(1);
  }
  console.log("examples gallery: up to date");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html);

// Copy the artifacts themselves next to the gallery so Pages, which publishes `site/`
// only, serves working links rather than 404s.
for (const { kind, dir, items } of groups) {
  const dest = join(OUT_DIR, `${kind}s`);
  mkdirSync(dest, { recursive: true });
  for (const item of items) copyFileSync(join(dir, item.file), join(dest, item.file));
}

const total = groups.reduce((sum, g) => sum + g.items.length, 0);
console.log(`examples gallery: wrote ${OUT_FILE} (${total} artifacts)`);
