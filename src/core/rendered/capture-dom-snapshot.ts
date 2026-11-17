/**
 * Live browser DOM + CSSOM snapshot capture via zero-dep CDP.
 *
 * Drives an already-installed Chrome/Chromium/Edge through `openSession`,
 * optionally converts readable `<canvas>` nodes into `<img>` data URIs,
 * flattens same-origin/srcdoc `<iframe>` trees, and bundles live CSSOM rules.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openSession } from "./browser-session.js";

export interface DomSnapshotCaptureOptions {
  browserPath: string;
  target: string;
  viewport?: { width: number; height: number };
  settleMs?: number;
  inlineCanvas?: boolean;
  flattenIframes?: boolean;
  unlockScroll?: boolean;
}

export interface DomSnapshotCaptureResult {
  html: string;
  origin: string;
  engine: string;
  stats: {
    cssomRules: number;
    canvasesInlined: number;
    iframesFlattened: number;
  };
}

const DEFAULT_SETTLE_MS = 700;

function buildCaptureExpression(inlineCanvas: boolean, flattenIframes: boolean): string {
  return `(() => {
    const stats = { cssomRules: 0, canvasesInlined: 0, iframesFlattened: 0 };
    const inlineCanvases = (doc) => {
      if (${String(inlineCanvas)} !== true) return;
      for (const canvas of Array.from(doc.querySelectorAll('canvas'))) {
        try {
          const dataUrl = canvas.toDataURL('image/png');
          if (!dataUrl || dataUrl === 'data:,') continue;
          const img = doc.createElement('img');
          img.src = dataUrl;
          if (canvas.id) img.id = canvas.id;
          if (canvas.className) img.className = canvas.className;
          if (canvas.style.cssText) img.style.cssText = canvas.style.cssText;
          const rect = canvas.getBoundingClientRect();
          if (canvas.hasAttribute('width') || rect.width > 0) {
            img.width = Number(canvas.getAttribute('width')) || Math.round(rect.width);
          }
          if (canvas.hasAttribute('height') || rect.height > 0) {
            img.height = Number(canvas.getAttribute('height')) || Math.round(rect.height);
          }
          canvas.replaceWith(img);
          stats.canvasesInlined++;
        } catch { /* tainted or detached canvas */ }
      }
    };

    const flattenIframeDoc = (doc) => {
      inlineCanvases(doc);
      if (${String(flattenIframes)} !== true) return;
      for (const iframe of Array.from(doc.querySelectorAll('iframe'))) {
        try {
          const idoc = iframe.contentDocument;
          if (!idoc || !idoc.documentElement) continue;
          flattenIframeDoc(idoc);
          for (const st of Array.from(idoc.querySelectorAll('style'))) {
            const clone = document.createElement('style');
            clone.setAttribute('data-inlined-iframe-style', 'true');
            clone.textContent = st.textContent || '';
            document.head.appendChild(clone);
          }
          const wrapper = doc.createElement('div');
          wrapper.setAttribute('data-inlined-iframe', 'true');
          if (iframe.id) wrapper.id = iframe.id;
          if (iframe.className) wrapper.className = iframe.className;
          if (iframe.style.cssText) wrapper.style.cssText = iframe.style.cssText;
          wrapper.innerHTML = idoc.body ? idoc.body.innerHTML : idoc.documentElement.innerHTML;
          iframe.replaceWith(wrapper);
          stats.iframesFlattened++;
        } catch { /* cross-origin iframe stays intact */ }
      }
    };

    flattenIframeDoc(document);

    const cssParts = [];
    const capturedSheets = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        const lines = [];
        for (const r of Array.from(rules)) {
          lines.push(r.cssText);
          stats.cssomRules++;
        }
        if (lines.length > 0) cssParts.push(lines.join('\\n'));
        if (sheet.ownerNode) capturedSheets.push(sheet.ownerNode);
      } catch { /* cross-origin stylesheet cannot read cssRules */ }
    }

    for (const node of capturedSheets) {
      if (node.tagName === 'STYLE' && node.hasAttribute('data-vite-dev-id')) {
        node.remove();
      } else if (node.tagName === 'LINK' && (node.getAttribute('rel') || '').toLowerCase() === 'stylesheet') {
        const href = node.getAttribute('href') || '';
        if (!/^(\\/\\/|https?:)/i.test(href) || href.startsWith(location.origin)) {
          node.remove();
        }
      }
    }

    if (cssParts.length > 0) {
      const existing = document.getElementById('extracted-cssom-bundle');
      if (existing) existing.remove();
      const bundle = document.createElement('style');
      bundle.id = 'extracted-cssom-bundle';
      bundle.textContent = cssParts.join('\\n');
      (document.head || document.documentElement).appendChild(bundle);
    }

    const origin = location.origin && location.origin !== 'null'
      ? location.origin
      : 'https://local.snapshot';
    return {
      html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML,
      origin,
      stats,
    };
  })()`;
}

export async function captureDomSnapshot(
  opts: DomSnapshotCaptureOptions,
): Promise<DomSnapshotCaptureResult> {
  const url = /^(https?|file):\/\//i.test(opts.target)
    ? opts.target
    : pathToFileURL(resolve(opts.target)).href;

  const session = await openSession({
    browserPath: opts.browserPath,
    viewport: opts.viewport,
  });

  try {
    await session.cdp.send("Page.enable");
    const loaded = new Promise<void>((resolveLoad) => {
      const off = session.cdp.on("Page.loadEventFired", () => {
        off();
        resolveLoad();
      });
    });
    await session.cdp.send("Page.navigate", { url });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 10_000))]);
    await new Promise((r) => setTimeout(r, opts.settleMs ?? DEFAULT_SETTLE_MS));

    const expression = buildCaptureExpression(
      opts.inlineCanvas !== false,
      opts.flattenIframes !== false,
    );
    const evaluated = await session.cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });

    const value = (evaluated["result"] as { value?: unknown } | undefined)?.value;
    if (value === null || typeof value !== "object") {
      throw new Error("live DOM snapshot did not return an HTML payload");
    }
    const rec = value as {
      html?: unknown;
      origin?: unknown;
      stats?: { cssomRules?: unknown; canvasesInlined?: unknown; iframesFlattened?: unknown };
    };
    if (typeof rec.html !== "string" || typeof rec.origin !== "string") {
      throw new Error("live DOM snapshot returned malformed payload");
    }

    return {
      html: rec.html,
      origin: rec.origin,
      engine: session.engine,
      stats: {
        cssomRules: Number(rec.stats?.cssomRules ?? 0),
        canvasesInlined: Number(rec.stats?.canvasesInlined ?? 0),
        iframesFlattened: Number(rec.stats?.iframesFlattened ?? 0),
      },
    };
  } finally {
    await session.close();
  }
}
