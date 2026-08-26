/**
 * Render a page and write down what the engine saw.
 *
 * Everything nondeterministic lives here and nowhere else. The rules that judge
 * a capture are pure functions of the JSON, testable on fixtures with no browser
 * in the room — the same quarantine `ui vr` uses, where the host produces the
 * screenshots and the kernel only compares them.
 *
 * The read runs entirely as one injected expression rather than as hundreds of
 * CDP round-trips: a page of 500 nodes would otherwise take 2,000 calls, and the
 * time would be spent in protocol overhead rather than in rendering.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { openSession } from "./browser-session.js";
import { CAPTURE_VERSION } from "./runtime-capture.js";
import type { RuntimeCapture, CapturedNode } from "./runtime-capture.js";

export interface CaptureOptions {
  browserPath: string;
  /** http(s):// URL, or a local file path. */
  target: string;
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
  /** How long to let entrance animations finish before reading. */
  settleMs?: number;
  port?: number;
}

/** Long enough for a typical entrance animation, short enough to stay usable. */
const DEFAULT_SETTLE_MS = 700;

/**
 * The page-side reader, as a single expression.
 *
 * Kept as a string on purpose: it runs in the PAGE, not in this process, and
 * bundling it as real TypeScript would put it through a toolchain that assumes
 * the opposite. The properties read are exactly what the seven rendered rules
 * need — nothing is collected "in case".
 */
const READ_EXPRESSION = `(() => {
  const out = [];
  const refOf = (el) => {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName !== 'HTML') {
      const cls = (cur.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean)[0];
      const sameTag = cur.parentElement
        ? Array.from(cur.parentElement.children).filter((s) => s.tagName === cur.tagName)
        : [cur];
      const idx = sameTag.length > 1 ? '[' + sameTag.indexOf(cur) + ']' : '';
      parts.unshift(cur.tagName.toLowerCase() + (cls ? '.' + cls : '') + idx);
      cur = cur.parentElement;
    }
    return ['html', ...parts].join(' > ');
  };
  const WANTED = [
    'color','background-color','background-image','font-size','font-weight','font-family',
    'line-height','letter-spacing','text-align','text-transform','font-style',
    'opacity','visibility','display','overflow','overflow-x','overflow-y',
    'border-top-width','border-right-width','border-bottom-width','border-left-width',
    'border-color','border-radius','box-shadow','transition','animation-name','animation-iteration-count',
    'padding-top','padding-right','padding-bottom','padding-left',
    'margin-top','margin-right','margin-bottom','margin-left','gap',
  ];
  for (const el of document.querySelectorAll('body, body *')) {
    const cs = getComputedStyle(el);
    const computed = {};
    for (const p of WANTED) computed[p] = cs.getPropertyValue(p);
    const r = el.getBoundingClientRect();
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue)
      .join(' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const node = {
      ref: refOf(el),
      tag: el.tagName.toLowerCase(),
      parentRef: el.parentElement && el.parentElement.tagName !== 'HTML' ? refOf(el.parentElement) : undefined,
      computed,
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
    };
    if (own) node.text = own;
    if (el.tagName === 'IMG') {
      node.image = { complete: el.complete, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight };
    }
    if (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) {
      node.scroll = {
        scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth, clientHeight: el.clientHeight,
      };
    }
    out.push(node);
  }
  return JSON.stringify(out);
})()`;

/**
 * Render `target` and return the capture.
 *
 * Throws on a browser or protocol failure; the caller reports the tier
 * NOT-EVALUATED rather than passing the document.
 */
export async function capturePage(opts: CaptureOptions): Promise<RuntimeCapture> {
  const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS;
  const session = await openSession({
    browserPath: opts.browserPath,
    port: opts.port,
    viewport: opts.viewport,
  });

  const consoleErrors: string[] = [];
  // Subscribe BEFORE navigating: an exception thrown during load is exactly the
  // one worth catching, and a listener attached afterwards misses it.
  session.cdp.on("Runtime.exceptionThrown", (params) => {
    const details = params["exceptionDetails"] as { text?: string; exception?: { description?: string } } | undefined;
    const text = details?.exception?.description ?? details?.text;
    if (typeof text === "string") consoleErrors.push(text);
  });
  session.cdp.on("Log.entryAdded", (params) => {
    const entry = params["entry"] as { level?: string; text?: string } | undefined;
    if (entry?.level === "error" && typeof entry.text === "string") consoleErrors.push(entry.text);
  });

  try {
    const url = /^https?:\/\//i.test(opts.target)
      ? opts.target
      : pathToFileURL(opts.target).href;

    await session.cdp.send("Page.navigate", { url });
    // Settle: entrance animations that never resolve are the whole point of
    // content-hidden-at-rest, so the read happens AFTER the page has had its
    // chance rather than at first paint.
    await new Promise((r) => setTimeout(r, settleMs));

    const evaluated = await session.cdp.send("Runtime.evaluate", {
      expression: READ_EXPRESSION,
      returnByValue: true,
      awaitPromise: false,
    });
    const result = evaluated["result"] as { value?: string } | undefined;
    const raw = result?.value;
    if (typeof raw !== "string") throw new Error("the page did not return a capture");
    const nodes = JSON.parse(raw) as CapturedNode[];

    return {
      version: CAPTURE_VERSION,
      target: opts.target,
      engine: {
        browser: session.engine,
        viewport: session.viewport,
        settleMs,
      },
      nodes,
      consoleErrors,
    };
  } finally {
    // Every exit path, success or failure. A teardown that only runs on success
    // leaves an orphan holding the port, which the next run reports as a
    // conflict it did not cause.
    await session.close();
  }
}

/** Read a capture written by an earlier step. Never throws on bad JSON. */
export function readCaptureFile(path: string): { capture?: RuntimeCapture; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return { error: `could not read capture: ${(err as Error).message}` };
  }
  return { capture: parsed as RuntimeCapture };
}
