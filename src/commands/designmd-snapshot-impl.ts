/** `ui designmd snapshot` — static & rendered self-contained preview HTML implementation. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { errJson, errText, okJson } from "../core/output.js";
import { transformSnapshot } from "../core/designmd-html-snapshot.js";
import { inlineLocalCssAssets, inlineLocalSnapshotAssets } from "../core/designmd-snapshot-assets.js";
import { locateBrowser } from "../core/rendered/browser-session.js";
import { cdpUnavailableReason } from "../core/rendered/cdp-client.js";
import { captureDomSnapshot } from "../core/rendered/capture-dom-snapshot.js";
import type { CssChunk } from "../core/designmd-html-snapshot.js";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";

const CMD = "designmd snapshot";
interface LoadedCssChunk extends CssChunk { dir: string; }

function fail(useJson: boolean, code: string, msg: string): CommandResult {
  return useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);
}

function readFail(useJson: boolean, notFoundMsg: string, path: string, err: unknown): CommandResult {
  const isNotFound = err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
  const msg = isNotFound ? notFoundMsg : `cannot read '${path}': ${err instanceof Error ? err.message : String(err)}`;
  return fail(useJson, isNotFound ? "FILE_NOT_FOUND" : "READ_ERROR", msg);
}

function parseOrigin(raw: string | boolean | undefined, useJson: boolean): { origin?: string; err?: CommandResult } {
  if (typeof raw !== "string" || raw.length === 0) {
    return { err: fail(useJson, "BAD_ARG", "--origin <url> is required (e.g. --origin https://www.example.com)") };
  }
  try { return { origin: new URL(raw).origin }; } catch {
    return { err: fail(useJson, "BAD_ARG", `--origin must be a valid URL: '${raw}'`) };
  }
}

function parseIntFlag(raw: string | boolean | undefined, flag: string, min: number, useJson: boolean): { value?: number; err?: CommandResult } {
  if (raw === undefined) return {};
  const n = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number.parseInt(raw.trim(), 10) : NaN;
  return Number.isSafeInteger(n) && n >= min ? { value: n } : { err: fail(useJson, "BAD_ARG", `--${flag} must be an integer >= ${min}`) };
}

function parseViewport(raw: string | boolean | undefined, useJson: boolean): { viewport?: { width: number; height: number }; err?: CommandResult } {
  if (raw === undefined) return {};
  if (typeof raw !== "string" || !/^\d+x\d+$/.test(raw.trim())) {
    return { err: fail(useJson, "BAD_ARG", "--viewport must match <width>x<height> (e.g. 1280x800)") };
  }
  const [wStr, hStr] = raw.trim().split("x");
  const width = Number.parseInt(wStr ?? "", 10);
  const height = Number.parseInt(hStr ?? "", 10);
  return width > 0 && height > 0 ? { viewport: { width, height } } : { err: fail(useJson, "BAD_ARG", "--viewport dimensions must be positive integers") };
}

function boolFlag(raw: string | boolean | undefined, defaultVal: boolean): boolean {
  if (raw === undefined) return defaultVal;
  if (typeof raw === "boolean") return raw;
  return !/^(?:false|0|no|off)$/i.test(raw.trim());
}

function readCssChunks(cssArg: string | boolean | undefined, useJson: boolean): { chunks?: LoadedCssChunk[]; err?: CommandResult } {
  const chunks: LoadedCssChunk[] = [];
  if (typeof cssArg !== "string" || cssArg.length === 0) return { chunks };
  for (const part of cssArg.split(",")) {
    const p = part.trim();
    if (p.length === 0) continue;
    try {
      const abs = resolve(p);
      chunks.push({ name: basename(p), body: readFileSync(abs, "utf8"), dir: dirname(abs) });
    } catch (e) {
      return { err: readFail(useJson, `CSS file not found: '${p}'`, p, e) };
    }
  }
  return { chunks };
}

function finalizeSnapshot(
  rawHtml: string, cssChunks: LoadedCssChunk[], origin: string, parsed: ParsedArgs,
  defaultBaseDir: string, maxAssetBytes: number | undefined, extraMeta?: Record<string, unknown>,
): CommandResult {
  const useJson = parsed.json;
  let workingHtml = rawHtml;
  let workingChunks: CssChunk[] = cssChunks;
  let assetStats: { inlinedAssets: number; skippedAssets: number } | undefined;

  if (parsed.flags["inline-assets"] === true) {
    const baseDirArg = parsed.flags["base-dir"];
    const hasExplicitBase = typeof baseDirArg === "string" && baseDirArg.length > 0;
    const baseDir = hasExplicitBase ? resolve(baseDirArg) : defaultBaseDir;
    const inlined = inlineLocalSnapshotAssets(workingHtml, { baseDir, maxAssetBytes });
    workingHtml = inlined.html;
    let totalInlined = inlined.inlinedAssets;
    let totalSkipped = inlined.skippedAssets;
    workingChunks = cssChunks.map((chunk) => {
      const chunkUnderBase = !hasExplicitBase && (chunk.dir === baseDir || chunk.dir.startsWith(baseDir + sep));
      const cssRes = inlineLocalCssAssets(chunk.body, {
        baseDir: chunkUnderBase ? chunk.dir : baseDir,
        fallbackBaseDir: chunkUnderBase ? baseDir : undefined,
        maxAssetBytes,
      });
      totalInlined += cssRes.inlinedAssets;
      totalSkipped += cssRes.skippedAssets;
      return { name: chunk.name, body: cssRes.html };
    });
    assetStats = { inlinedAssets: totalInlined, skippedAssets: totalSkipped };
  }

  const { html: out, removed } = transformSnapshot(workingHtml, workingChunks, origin, {
    unlockScroll: parsed.flags["unlock-scroll"] === true,
  });
  const outPath = parsed.flags["out"];
  const payloadMeta = { removed, ...(assetStats ?? {}), ...(extraMeta ?? {}) };

  if (typeof outPath === "string" && outPath.length > 0) {
    try { writeFileSync(resolve(outPath), out, "utf8"); } catch (e) {
      return fail(useJson, "WRITE_ERROR", `cannot write '${outPath}': ${e instanceof Error ? e.message : String(e)}`);
    }
    return useJson
      ? okJson(CMD, { wrote: resolve(outPath), bytes: out.length, ...payloadMeta })
      : { exitCode: 0, stdout: `wrote ${out.length} bytes to ${outPath}\n` };
  }

  return useJson ? okJson(CMD, { html: out, ...payloadMeta }) : { exitCode: 0, stdout: out };
}

async function runRenderSnapshot(parsed: ParsedArgs, target: string): Promise<CommandResult> {
  const useJson = parsed.json;
  const runtimeBlocked = cdpUnavailableReason();
  if (runtimeBlocked !== undefined) return fail(useJson, "RENDER_UNAVAILABLE", runtimeBlocked);

  const browserFlag = typeof parsed.flags["browser"] === "string" ? parsed.flags["browser"] : undefined;
  const located = locateBrowser(browserFlag);
  if (located.path === undefined) return fail(useJson, "RENDER_UNAVAILABLE", located.reason ?? "no browser found");

  const vp = parseViewport(parsed.flags["viewport"], useJson);
  if (vp.err !== undefined) return vp.err;
  const wait = parseIntFlag(parsed.flags["wait-ms"], "wait-ms", 0, useJson);
  if (wait.err !== undefined) return wait.err;
  const maxBytes = parseIntFlag(parsed.flags["max-asset-bytes"], "max-asset-bytes", 1, useJson);
  if (maxBytes.err !== undefined) return maxBytes.err;

  let originOverride: string | undefined;
  if (parsed.flags["origin"] !== undefined) {
    const o = parseOrigin(parsed.flags["origin"], useJson);
    if (o.err !== undefined) return o.err;
    originOverride = o.origin;
  }

  const isUrl = /^(https?|file):\/\//i.test(target);
  const resolvedTarget = isUrl ? target : resolve(target);
  if (!isUrl && !existsSync(resolvedTarget)) return fail(useJson, "FILE_NOT_FOUND", `file not found: '${target}'`);

  const cssRes = readCssChunks(parsed.flags["css"], useJson);
  if (cssRes.err !== undefined) return cssRes.err;

  try {
    const captured = await captureDomSnapshot({
      browserPath: located.path, target: resolvedTarget, viewport: vp.viewport, settleMs: wait.value,
      inlineCanvas: boolFlag(parsed.flags["inline-canvas"], true),
      flattenIframes: boolFlag(parsed.flags["flatten-iframes"], true),
      unlockScroll: parsed.flags["unlock-scroll"] === true,
    });
    const baseDir = isUrl ? process.cwd() : dirname(resolvedTarget);
    return finalizeSnapshot(
      captured.html, cssRes.chunks ?? [], originOverride ?? captured.origin,
      parsed, baseDir, maxBytes.value, { engine: captured.engine, renderStats: captured.stats },
    );
  } catch (e) {
    return fail(useJson, "RENDER_UNAVAILABLE", `rendered snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function runSnapshot(parsed: ParsedArgs): CommandResult | Promise<CommandResult> {
  const useJson = parsed.json;
  const htmlPath = parsed.positionals[0];
  if (typeof htmlPath !== "string" || htmlPath.length === 0) {
    return fail(useJson, "BAD_ARG", "ui designmd snapshot requires <html-path> as first positional argument");
  }
  if (parsed.flags["render"] === true) return runRenderSnapshot(parsed, htmlPath);

  const originRes = parseOrigin(parsed.flags["origin"], useJson);
  if (originRes.err !== undefined) return originRes.err;
  const maxBytes = parseIntFlag(parsed.flags["max-asset-bytes"], "max-asset-bytes", 1, useJson);
  if (maxBytes.err !== undefined) return maxBytes.err;

  const resolvedHtml = resolve(htmlPath);
  let html: string;
  try {
    html = readFileSync(resolvedHtml, "utf8");
  } catch (e) {
    return readFail(useJson, `file not found: '${htmlPath}'`, htmlPath, e);
  }

  const cssRes = readCssChunks(parsed.flags["css"], useJson);
  if (cssRes.err !== undefined) return cssRes.err;

  return finalizeSnapshot(html, cssRes.chunks ?? [], originRes.origin!, parsed, dirname(resolvedHtml), maxBytes.value);
}
