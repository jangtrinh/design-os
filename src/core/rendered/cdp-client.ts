/**
 * A Chrome DevTools Protocol client with zero dependencies.
 *
 * The rule this repo runs on is not "never use a browser" — it is **never take a
 * browser dependency**. `ui vr` states the split: *"the binary never renders"*,
 * it compares screenshots the host produced, with a hand-written PNG codec so no
 * npm image library is needed. `png-codec.ts` is the precedent for owning a
 * primitive instead of importing one.
 *
 * puppeteer was rejected for concrete reasons, not taste: it downloads Chromium
 * over the network at install, and it version-skews rendering between machines,
 * which breaks *"identical on every runtime"* and makes one command give two
 * verdicts. This drives a browser that is ALREADY on the machine.
 *
 * Node ships a global `WebSocket` and `fetch`, so CDP — JSON-RPC over one socket
 * — needs nothing installed. The `es:lazy` ladder puts stdlib before installed
 * dep, and here it points straight at this.
 */

/** A CDP session bound to one page target. */
export interface CdpSession {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** Subscribe to a CDP event. Returns an unsubscribe function. */
  on: (method: string, handler: (params: Record<string, unknown>) => void) => () => void;
  close: () => void;
}

export class CdpError extends Error {
  constructor(message: string, public readonly method?: string) {
    super(message);
    this.name = "CdpError";
  }
}

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  method: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Per-call ceiling. A hung page must fail the command, not hang the process. */
const CALL_TIMEOUT_MS = 15_000;

/**
 * Why CDP cannot run here, or `undefined` when it can.
 *
 * `WebSocket` became a global in Node 22. This package supports `>=20`, so on Node 20 the
 * rendered tier simply cannot open a debugger socket — and the honest answer is to say so
 * by name rather than to throw a bare `ReferenceError` from inside a rule run.
 *
 * Found on CI, not locally: the whole family passed on a Node 22 laptop and failed on the
 * Node 20 job, which is exactly the gap between a supported version and a tested one.
 * Reported as NOT-EVALUATED, never as a pass — the rendered tier's seven rules do not get
 * to count as clean because the runtime could not run them.
 */
export function cdpUnavailableReason(): string | undefined {
  return typeof globalThis.WebSocket === "function"
    ? undefined
    : `this Node build has no global WebSocket (needs Node 22+; running ${process.version})`;
}

/** Ask the browser where its debugger socket is, and what it is. */
export async function browserVersion(port: number): Promise<{ wsUrl: string; engine: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new CdpError(`browser did not answer /json/version (HTTP ${res.status})`);
  const body = (await res.json()) as Record<string, unknown>;
  const wsUrl = body["webSocketDebuggerUrl"];
  const engine = body["Browser"];
  if (typeof wsUrl !== "string" || typeof engine !== "string") {
    throw new CdpError("/json/version answered without a debugger URL");
  }
  return { wsUrl, engine };
}

/**
 * Open a session on a fresh page target.
 *
 * `flatten: true` puts target messages on the same socket, which is what lets one
 * connection serve both browser-level and page-level calls.
 */
export async function connect(wsUrl: string): Promise<CdpSession> {
  const unavailable = cdpUnavailableReason();
  if (unavailable !== undefined) throw new CdpError(unavailable, "connect");
  const ws = new WebSocket(wsUrl);
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, Array<(params: Record<string, unknown>) => void>>();
  let nextId = 0;
  const sessionRef: { id?: string } = {};
  let closed = false;

  await new Promise<void>((resolve, reject) => {
    const onOpen = (): void => resolve();
    const onError = (): void => reject(new CdpError(`could not open a debugger socket at ${wsUrl}`));
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onError, { once: true });
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    const id = msg["id"];
    if (typeof id !== "number") {
      // An EVENT, not a reply. Console errors arrive this way and nowhere else:
      // without a listener `script-error` is a rule that can never fire, which a
      // probe caught only because deleting the domain enables left the suite green.
      const method = msg["method"];
      if (typeof method === "string") {
        for (const h of listeners.get(method) ?? []) h((msg["params"] as Record<string, unknown>) ?? {});
      }
      return;
    }
    const waiter = pending.get(id);
    if (waiter === undefined) return;
    pending.delete(id);
    clearTimeout(waiter.timer);
    const error = msg["error"] as { message?: string } | undefined;
    if (error !== undefined) {
      waiter.reject(new CdpError(error.message ?? "CDP call failed", waiter.method));
      return;
    }
    waiter.resolve((msg["result"] as Record<string, unknown>) ?? {});
  });

  ws.addEventListener("close", () => {
    closed = true;
    for (const [, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(new CdpError("the debugger socket closed mid-call", waiter.method));
    }
    pending.clear();
  });

  const raw = async (
    method: string,
    params: Record<string, unknown> = {},
    withSession = true,
  ): Promise<Record<string, unknown>> => {
    if (closed) throw new CdpError("the debugger socket is closed", method);
    const id = ++nextId;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new CdpError(`no reply within ${CALL_TIMEOUT_MS}ms`, method));
      }, CALL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, method, timer });
      ws.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(withSession && sessionRef.id !== undefined ? { sessionId: sessionRef.id } : {}),
        }),
      );
    });
  };

  const target = await raw("Target.createTarget", { url: "about:blank" }, false);
  const attached = await raw(
    "Target.attachToTarget",
    { targetId: target["targetId"], flatten: true },
    false,
  );
  sessionRef.id = attached["sessionId"] as string;

  // Domains this client uses. Runtime and Log are required for EVENTS, not for
  // calls: Runtime.evaluate and Page.navigate work without any enable, which a
  // probe proved by deleting both and staying green. What that green actually
  // meant was that console errors were never being collected at all.
  //
  // DOM and CSS are deliberately NOT enabled. The feasibility probe hit their
  // trap — CSS.getComputedStyleForNode returns `undefined`, with no error,
  // unless both are on — but this implementation avoids the area entirely by
  // reading through ONE injected expression rather than four calls per node.
  for (const domain of ["Runtime", "Log"]) await raw(`${domain}.enable`);

  return {
    send: (method, params) => raw(method, params),
    on: (method, handler) => {
      const list = listeners.get(method) ?? [];
      list.push(handler);
      listeners.set(method, list);
      return () => listeners.set(method, (listeners.get(method) ?? []).filter((h) => h !== handler));
    },
    close: () => {
      closed = true;
      try {
        ws.close();
      } catch {
        // Already gone; closing twice is not an error worth surfacing.
      }
    },
  };
}
