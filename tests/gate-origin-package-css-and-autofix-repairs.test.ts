/**
 * `ui gate --origin`: CSS imported from an installed package, and the origin of the
 * repairs behind `autofix-not-clean`.
 *
 * Real data first: on a React + Tailwind v4 site, `src/index.css` does
 * `@import "shadcn/tailwind.css"` and `@import "tw-animate-css"`. The shimmer and
 * scroll-fade variables those packages declare (`--_spread`, `--shimmer-*`, …) were
 * labelled AUTHORED — about 105 of 149 authored errors on one view — because the
 * attributor only knew `--src`, `--kit` and a fixed list of framework names. Any CSS
 * that resolves to a node_modules package is the framework's, found by following the
 * project's own imports: no hand-listed paths.
 *
 * And `autofix-not-clean` was one authored error whatever it would repair: an
 * unguarded `:hover` the kit wrote, an `<img>` fallback convention that belongs to the
 * raw-HTML template. Each pending repair now carries its own origin.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

let dir: string;
let tokens: string;
let src: string;
let kit: string;
const put = (rel: string, contents: string): string => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, contents, "utf8");
  return p;
};

const page = (css: string[], body: string): string =>
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Home</title>\n' +
  `<style>\n${css.join("\n")}\n</style>\n</head>\n<body>\n<div id="root"><main><h1>Home</h1>${body}</main></div>\n</body>\n</html>\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-gate-pkg-"));
  tokens = put("tokens.json", JSON.stringify({ color: { ink: { $type: "color", $value: "#0e1726" } } }));
  src = join(dir, "src");
  kit = join(src, "components", "ui");
  // The project's own stylesheet pulls two packages in, plus a relative file.
  put("src/index.css", '@import "tailwindcss";\n@import "skelkit/tailwind.css";\n@import "./theme.css";\n.hero { --dissolve-to: 0; opacity: var(--dissolve-to); }\n');
  put("src/theme.css", ":root { --color-ink: #0e1726; }\n");
  // A side-effect import from the app entry is the other way a package's CSS arrives.
  put("src/main.tsx", 'import "animkit";\nimport "./index.css";\nexport {};\n');
  put("src/home.tsx", 'export const H = () => <section className="hero lead">Home</section>;\n');
  put("src/components/ui/button.tsx", 'export const cls = "hover:bg-accent px-4";\n');
  // Installed packages. Only the two the project imports may be attributed.
  put("node_modules/skelkit/package.json", '{"name":"skelkit","exports":{"./tailwind.css":"./dist/tailwind.css"}}');
  put("node_modules/skelkit/dist/tailwind.css", ".shimmer { --_spread: 120px; background-size: var(--_spread) 100%; }\n");
  put("node_modules/animkit/package.json", '{"name":"animkit","style":"dist/animkit.css"}');
  put("node_modules/animkit/dist/animkit.css", ".fade-in { --animkit-enter-opacity: 0; opacity: var(--animkit-enter-opacity); }\n");
  // Installed but never imported: what it declares is NOT the framework's on this page.
  put("node_modules/unrelated/package.json", '{"name":"unrelated"}');
  put("node_modules/unrelated/ghost.css", ".ghost { --ghost-gap: 4px; }\n");
});

const gate = (file: string) =>
  capture(["gate", file, "--tokens", tokens, "--token-coverage-floor", "0", "--json", "--src", src, "--kit", kit]);
type Finding = Record<string, unknown>;
const findingsOf = (d: { families: Record<string, { findings: Finding[] }> }): Finding[] =>
  Object.values(d.families).flatMap((f) => f.findings);
const naming = (fs: Finding[], name: string): Finding[] =>
  fs.filter((f) => `${String(f["message"])} ${String(f["originReason"] ?? "")}`.includes(name));

describe("ui gate --origin: CSS from an imported node_modules package is framework", () => {
  const CSS = [
    ":root { --color-ink: #0e1726; }",
    "body { color: var(--color-ink); }",
    ".shimmer { background-size: var(--_spread) 100%; }",
    ".fade-in { opacity: var(--animkit-enter-opacity); }",
    ".ghost { gap: var(--ghost-gap); }",
    ".hero { opacity: var(--dissolve-to); }",
  ];
  const body = '<p class="shimmer fade-in ghost hero">Welcome to the home page of this project.</p>';

  it("a variable declared by a package that src/index.css @imports is framework, naming the package", () => {
    const d = JSON.parse(gate(put("p.html", page(CSS, body))).out).data;
    const spread = naming(findingsOf(d), "--_spread");
    expect(spread.length).toBeGreaterThan(0); // the probe can see the finding at all
    for (const f of spread) {
      expect(f["origin"]).toBe("framework");
      expect(String(f["originReason"])).toMatch(/skelkit/);
    }
  });

  it("a package imported for its side effect from a JS entry counts too", () => {
    const d = JSON.parse(gate(put("p.html", page(CSS, body))).out).data;
    const enter = naming(findingsOf(d), "--animkit-enter-opacity");
    expect(enter.length).toBeGreaterThan(0);
    for (const f of enter) expect(f["origin"]).toBe("framework");
  });

  it("an installed package the project never imports is NOT a source: its names stay authored", () => {
    const d = JSON.parse(gate(put("p.html", page(CSS, body))).out).data;
    const ghost = naming(findingsOf(d), "--ghost-gap");
    expect(ghost.length).toBeGreaterThan(0);
    for (const f of ghost) expect(f["origin"]).toBe("authored");
  });

  it("the project's own variable stays authored and still fails the gate", () => {
    const r = gate(put("p.html", page(CSS, body)));
    const d = JSON.parse(r.out).data;
    const own = naming(findingsOf(d), "--dissolve-to");
    expect(own.length).toBeGreaterThan(0);
    for (const f of own) expect(f["origin"]).toBe("authored");
    expect(r.code).toBe(1);
  });
});

describe("ui gate --origin: autofix-not-clean carries the origin of each pending repair", () => {
  // `hover:bg-accent` is written only in the kit; its compiled rule is unguarded.
  const KIT_HOVER = [".hover\\:bg-accent:hover { background-color: var(--color-ink); }"];
  const autofixOf = (d: { families: Record<string, { findings: Finding[] }> }): Finding[] => d.families["autofix"]?.findings ?? [];

  it("a kit :hover repair and the raw-HTML <img> fallback are not authored errors", () => {
    const r = gate(put("p.html", page(KIT_HOVER, '<img src="/hero.jpg" alt=""><button class="hover:bg-accent">Open</button>')));
    const d = JSON.parse(r.out).data;
    const af = autofixOf(d);
    expect(af.length).toBeGreaterThan(0); // both repairs are still reported
    expect(af.map((f) => String(f["message"])).join(" ")).toMatch(/hover-media-guard/);
    expect(af.map((f) => String(f["message"])).join(" ")).toMatch(/img-onerror/);
    for (const f of af) expect(f["origin"]).not.toBe("authored");
    expect(af.find((f) => String(f["message"]).includes("hover-media-guard"))?.["origin"]).toBe("kit");
  });

  it("a variant's context class (`:is(.dark *)`) is not the rule's subject: the kit utility stays kit", () => {
    // The app toggles the theme with class="dark", so `dark` IS in the authored sources —
    // but in `.dark\:hover\:bg-accent:is(.dark *):hover` it only names the context.
    put("src/theme-toggle.tsx", 'export const t = () => document.documentElement.classList.add("dark");\nexport const R = () => <div className="dark" />;\n');
    put("src/components/ui/button.tsx", 'export const cls = "dark:hover:bg-accent px-4";\n');
    const css = [".dark\\:hover\\:bg-accent:is(.dark *):hover { background-color: var(--color-ink); }"];
    const r = gate(put("p.html", page(css, '<button class="dark:hover:bg-accent">Open</button>')));
    const hover = autofixOf(JSON.parse(r.out).data).filter((f) => String(f["message"]).includes("hover-media-guard"));
    expect(hover.length).toBe(1);
    expect(hover[0]?.["origin"]).toBe("kit");
  });

  it("an unguarded :hover the authored code writes keeps its repair authored", () => {
    put("src/card.tsx", 'export const C = () => <a className="hover:underline">x</a>;\n');
    const css = [".hover\\:underline:hover { text-decoration-line: underline; }"];
    const r = gate(put("p.html", page(css, '<a class="hover:underline" href="/x">Read the full story</a>')));
    const d = JSON.parse(r.out).data;
    const hover = autofixOf(d).filter((f) => String(f["message"]).includes("hover-media-guard"));
    expect(hover.length).toBe(1);
    expect(hover[0]?.["origin"]).toBe("authored");
    expect(r.code).toBe(1);
  });
});
