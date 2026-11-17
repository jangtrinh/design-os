import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, runAsync } from "../src/cli.js";
import { transformSnapshot } from "../src/core/designmd-html-snapshot.js";
import { extractCssUrls, inlineLocalSnapshotAssets } from "../src/core/designmd-snapshot-assets.js";
import { locateBrowser } from "../src/core/rendered/browser-session.js";
import { captureDomSnapshot } from "../src/core/rendered/capture-dom-snapshot.js";
import { cdpUnavailableReason } from "../src/core/rendered/cdp-client.js";
import { validatePromptPlan } from "../src/core/prompt-plan-model.js";
import { validPromptPlan } from "./fixtures/prompt-plan/prompt-plan-fixture.js";

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function captureSync(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c: unknown) => { out += String(c); return true; };
  process.stderr.write = (c: unknown) => { err += String(c); return true; };
  try {
    return { code: run(args), out, err };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

async function captureAsync(args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c: unknown) => { out += String(c); return true; };
  process.stderr.write = (c: unknown) => { err += String(c); return true; };
  try {
    return { code: await runAsync(args), out, err };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe("extractCssUrls", () => {
  it("extracts unquoted, single-quoted, double-quoted, escaped quotes, and stays O(N) on 20k unclosed url(", () => {
    const css = [
      ".a { background: url(foo/bar.png) no-repeat, URL('a\\'b.jpg'); }",
      '.b { mask: url("icons/check\\"1.svg"); }',
    ].join("\n");
    const urls = extractCssUrls(css);
    expect(urls.map((u) => u.url)).toEqual(["foo/bar.png", "a'b.jpg", 'icons/check"1.svg']);
    for (const m of urls) {
      expect(css.slice(m.startIndex, m.endIndex)).toBe(m.fullMatch);
    }

    const start = performance.now();
    expect(extractCssUrls("url(".repeat(20_000))).toEqual([]);
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe("inlineLocalSnapshotAssets", () => {
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );

  it("inlines <img src>, <style> url(...), inline style url(...), and SVG <image href>", () => {
    const dir = makeTmpDir("snap-assets-");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "hero.png"), TINY_PNG);
    writeFileSync(join(dir, "assets", "logo.svg"), '<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");
    const html = [
      "<html><head><style>.bg { background: url('./assets/hero.png?v=1'); }</style></head>",
      '<body><img src="assets/hero.png" srcset="/assets/hero.png 1x"><div style="background:url(assets/logo.svg)"></div>',
      '<svg><image href="assets/logo.svg"></image></svg>',
      '<img src="https://cdn.example.com/remote.png"></body></html>',
    ].join("");
    const res = inlineLocalSnapshotAssets(html, { baseDir: dir });
    expect(res.inlinedAssets).toBe(5);
    expect(res.skippedAssets).toBe(0);
    expect(res.html).toContain("data:image/png;base64,");
    expect(res.html).toContain("data:image/svg+xml;base64,");
    expect(res.html).toContain('src="https://cdn.example.com/remote.png"');
  });

  it("respects maxAssetBytes, rejects lexical path traversal, and rejects symlinks escaping baseDir", () => {
    const root = makeTmpDir("snap-guard-");
    const siteDir = join(root, "site");
    mkdirSync(siteDir, { recursive: true });
    writeFileSync(join(root, "secret.png"), TINY_PNG);
    symlinkSync(join(root, "secret.png"), join(siteDir, "evil.png"));
    writeFileSync(join(siteDir, "big.png"), Buffer.alloc(1024, 1));
    const html = '<img src="../secret.png"><img src="evil.png"><img src="big.png">';
    const res = inlineLocalSnapshotAssets(html, { baseDir: siteDir, maxAssetBytes: 100 });
    expect(res.inlinedAssets).toBe(0);
    expect(res.skippedAssets).toBe(3);
    expect(res.html).toContain('src="../secret.png"');
    expect(res.html).toContain('src="evil.png"');
    expect(res.html).toContain('src="big.png"');
  });
});

describe("transformSnapshot — dev-overlay cleanup & unlockScroll", () => {
  it("strips dev overlays while preserving style rules from data-vite-dev-id tags", () => {
    const html = [
      '<html><head><style data-vite-dev-id="/src/app.css">.card{color:red}</style></head><body>',
      "<vite-error-overlay><div class=\"err\">boom</div></vite-error-overlay>",
      "<nextjs-portal><div>portal</div></nextjs-portal>",
      '<div data-nextjs-dialog-overlay="true"><span>nested</span></div>',
      '<div id="webpack-dev-server-client-overlay">overlay</div>',
      "<main>real content</main></body></html>",
    ].join("");
    const res = transformSnapshot(html, [], "https://example.com", { unlockScroll: true });
    expect(res.removed.devOverlays).toBe(4);
    expect(res.html).not.toContain("vite-error-overlay");
    expect(res.html).not.toContain("nextjs-portal");
    expect(res.html).not.toContain("data-nextjs-dialog-overlay");
    expect(res.html).not.toContain("webpack-dev-server-client-overlay");
    expect(res.html).not.toContain("data-vite-dev-id");
    expect(res.html).toContain("<style>.card{color:red}</style>");
    expect(res.html).toContain('<style data-ease-snapshot="unlock-scroll">');
    expect(res.html).toContain("<main>real content</main>");
  });
});

describe("ui designmd snapshot — static upgrades & render error handling", () => {
  it("runs synchronously with --inline-assets across HTML and --css chunks + --unlock-scroll", () => {
    const dir = makeTmpDir("snap-cli-");
    mkdirSync(join(dir, "styles"), { recursive: true });
    writeFileSync(join(dir, "pic.svg"), "<svg></svg>", "utf8");
    writeFileSync(join(dir, "bg.svg"), "<svg id=\"bg\"></svg>", "utf8");
    const cssPath = join(dir, "styles", "app.css");
    writeFileSync(cssPath, "body { background: url(/bg.svg); }", "utf8");
    const htmlPath = join(dir, "index.html");
    writeFileSync(htmlPath, '<html><head></head><body><img src="pic.svg"></body></html>', "utf8");
    const res = captureSync([
      "designmd", "snapshot", htmlPath, "--origin", "https://example.com",
      "--css", cssPath, "--inline-assets", "--unlock-scroll", "--json",
    ]);
    expect(res.code).toBe(0);
    const json = JSON.parse(res.out) as {
      ok: boolean;
      data: { html: string; inlinedAssets: number; removed: { devOverlays: number } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.inlinedAssets).toBe(2);
    expect(json.data.html).toContain("data:image/svg+xml;base64,");
    expect(json.data.html).not.toContain("https://example.com/bg.svg");
    expect(json.data.html).toContain("overflow:visible!important");
  });

  it("returns RENDER_UNAVAILABLE when --render points to nonexistent --browser", async () => {
    const dir = makeTmpDir("snap-render-err-");
    const htmlPath = join(dir, "index.html");
    writeFileSync(htmlPath, "<html><body>ok</body></html>", "utf8");
    const res = await captureAsync([
      "designmd", "snapshot", htmlPath, "--render", "--browser", "/nonexistent/chrome", "--json",
    ]);
    expect(res.code).toBe(1);
    const json = JSON.parse(res.out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("RENDER_UNAVAILABLE");
  });
});

function browserSandboxBlockedReason(browserPath: string | undefined): string | undefined {
  if (browserPath === undefined) return undefined;
  const profileDir = mkdtempSync(join(tmpdir(), "probe-snap-chrome-"));
  try {
    const r = spawnSync(
      browserPath,
      ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${profileDir}`, "--dump-dom", "about:blank"],
      { encoding: "utf8", timeout: 5_000 },
    );
    if (r.status === 0) return undefined;
    return `browser failed headless probe (${r.signal ?? r.status ?? "unknown"})`;
  } catch (e) {
    return `browser probe error (${(e as Error).message})`;
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }
}

describe("live CDP captureDomSnapshot", () => {
  const browser = locateBrowser().path;
  const cdpBlocked = cdpUnavailableReason();
  const launchBlocked = cdpBlocked === undefined ? browserSandboxBlockedReason(browser) : undefined;
  const cannotRunLive = browser === undefined || cdpBlocked !== undefined || launchBlocked !== undefined;

  it.skipIf(cannotRunLive)("captures CSSOM rules, canvases, and srcdoc iframes", async () => {
    const dir = makeTmpDir("snap-live-");
    const page = join(dir, "page.html");
    writeFileSync(
      page,
      [
        "<!doctype html><html><head><style>.box{color:rgb(1,2,3)}</style></head><body>",
        '<canvas id="c" width="10" height="10"></canvas>',
        '<iframe srcdoc="<style>.inner{color:red}</style><p>from-iframe</p>"></iframe>',
        "<script>const ctx=document.getElementById('c').getContext('2d');ctx.fillRect(0,0,10,10);</script>",
        "</body></html>",
      ].join(""),
      "utf8",
    );
    const res = await captureDomSnapshot({ browserPath: browser!, target: page, settleMs: 200 });
    expect(res.stats.cssomRules).toBeGreaterThan(0);
    expect(res.stats.canvasesInlined).toBe(1);
    expect(res.stats.iframesFlattened).toBe(1);
    expect(res.html).toContain('<img id="c"');
    expect(res.html).toContain('data-inlined-iframe="true"');
    expect(res.html).toContain("from-iframe");
  }, 60_000);
});

describe("prompt-plan active-ds-token-leakage linter", () => {
  it("flags raw hex literals in palette/typography when activeDesignSystem is true under generate/enhance", () => {
    const plan = validPromptPlan();
    const vs = plan["visualSystem"] as Record<string, unknown>;
    vs["activeDesignSystem"] = true;
    vs["palette"] = "primary brand #ff5500 over neutral surface";
    const result = validatePromptPlan(plan);
    expect(result.ready).toBe(false);
    expect(result.findings.some((f) => f.checkId === "active-ds-token-leakage" && f.severity === "error")).toBe(true);
  });

  it("allows semantic token roles and replicate mode with activeDesignSystem", () => {
    const semanticPlan = validPromptPlan();
    (semanticPlan["visualSystem"] as Record<string, unknown>)["activeDesignSystem"] = true;
    expect(validatePromptPlan(semanticPlan).ready).toBe(true);

    const replicatePlan = validPromptPlan();
    replicatePlan["promptMode"] = "replicate";
    const vs = replicatePlan["visualSystem"] as Record<string, unknown>;
    vs["designSystemRef"] = "design/design.tokens.json";
    vs["palette"] = "verbatim reference #ff5500 palette";
    expect(validatePromptPlan(replicatePlan).ready).toBe(true);
  });
});
