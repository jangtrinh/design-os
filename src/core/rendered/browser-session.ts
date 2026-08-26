/**
 * Find a browser that is already installed, drive it, and always put it back.
 *
 * Nothing is downloaded and nothing is installed. When no browser is found the
 * tier is NOT-EVALUATED with the environment variable to set — never a silent
 * pass, and never an install.
 *
 * Isolation is not optional. The session gets its own `--user-data-dir` under a
 * temp path and its own port, so it cannot touch the operator's profile, their
 * cookies, or a browser they are using. Teardown runs on every exit path.
 */
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, browserVersion, CdpError } from "./cdp-client.js";
import type { CdpSession } from "./cdp-client.js";

/** Where a browser might already live, per platform. Never an install target. */
const CANDIDATES: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export interface LocateResult {
  path?: string;
  /** Why nothing was found, phrased as the next action to take. */
  reason?: string;
}

/**
 * Locate a browser: explicit flag, then the conventional env vars, then the
 * platform's usual paths.
 *
 * The env vars are the ones CI images already set, so a runner that has Chrome
 * needs no design:os-specific configuration.
 */
export function locateBrowser(
  explicit?: string,
  env: NodeJS.ProcessEnv = process.env,
  /**
   * Platform paths to try. A parameter, not a constant read, so the
   * nothing-found branch is reachable in a test on a machine that HAS a browser
   * — otherwise that branch is unreachable here and its message untested.
   */
  candidates: readonly string[] = CANDIDATES[process.platform] ?? [],
): LocateResult {
  const tried: string[] = [];
  const consider = (p: string | undefined): string | undefined => {
    if (p === undefined || p === "") return undefined;
    tried.push(p);
    return existsSync(p) ? p : undefined;
  };

  const found =
    consider(explicit) ??
    consider(env["CHROME_PATH"]) ??
    consider(env["PUPPETEER_EXECUTABLE_PATH"]) ??
    candidates.map((p) => consider(p)).find((p) => p !== undefined);

  if (found !== undefined) return { path: found };
  return {
    reason:
      `no browser found (tried ${tried.length} path(s)); set CHROME_PATH to a Chrome, ` +
      `Chromium or Edge binary, or pass --browser <path>`,
  };
}

export interface SessionOptions {
  browserPath: string;
  /**
   * Debug port. Omit it — and normally DO omit it.
   *
   * A fixed port made the session compete with itself: Chrome's renderer and GPU
   * children can hold the port for a moment after the parent exits, so a second
   * capture on the same port hung for the full launch timeout. Passing 0 lets
   * the OS assign one and Chrome writes it to DevToolsActivePort in its own
   * profile directory, which removes the conflict class rather than timing
   * around it.
   */
  port?: number;
  viewport?: { width: number; height: number; deviceScaleFactor?: number };
}

export interface Session {
  cdp: CdpSession;
  /** Engine identity, for the capture stamp. */
  engine: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  close: () => Promise<void>;
}

const DEFAULT_VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 1 };
/** 0 = let the OS choose. See SessionOptions.port. */
const DEFAULT_PORT = 0;
const LAUNCH_TIMEOUT_MS = 20_000;

/**
 * Wait for the browser to announce its port, then for the endpoint to answer.
 *
 * Chrome writes the port it actually bound to `DevToolsActivePort` inside its
 * user-data-dir. Reading it is what makes port 0 usable, and with it the whole
 * port-conflict class disappears.
 */
async function waitForDebugger(
  requestedPort: number,
  profileDir: string,
  child: ChildProcess,
): Promise<{ wsUrl: string; engine: string }> {
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  let lastError = "browser did not open its debugger port";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new CdpError(`browser exited immediately (code ${child.exitCode})`);
    const port = requestedPort === 0 ? readActivePort(profileDir) : requestedPort;
    if (port !== undefined) {
      try {
        return await browserVersion(port);
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new CdpError(`${lastError} within ${LAUNCH_TIMEOUT_MS}ms`);
}

/** The port Chrome actually bound, or undefined until it has written the file. */
function readActivePort(profileDir: string): number | undefined {
  try {
    const first = readFileSync(join(profileDir, "DevToolsActivePort"), "utf8").split("\n")[0];
    const port = Number.parseInt(first ?? "", 10);
    return Number.isFinite(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Launch an isolated headless browser and attach.
 *
 * The caller MUST await `close()` on every path. Teardown that only runs on
 * success leaves an orphan holding a port, which the next run then reports as a
 * conflict it did not cause.
 */
export async function openSession(opts: SessionOptions): Promise<Session> {
  const port = opts.port ?? DEFAULT_PORT;
  const viewport = { ...DEFAULT_VIEWPORT, ...opts.viewport };
  const profileDir = mkdtempSync(join(tmpdir(), "design-os-render-"));

  const child = spawn(
    opts.browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      `--window-size=${viewport.width},${viewport.height}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: false },
  );

  /**
   * Stop cleanly, then hard, then WAIT for the process to actually be gone.
   *
   * Returning before the child exits leaves the debugging port held for a moment
   * after `close()` resolves — so a second capture on the same port fails with a
   * conflict the first run caused. SIGTERM first; escalate to SIGKILL only if it
   * is ignored.
   */
  const cleanup = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });
      try {
        child.kill("SIGTERM");
      } catch {
        // Already gone.
      }
      const hardKill = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone.
        }
      }, 2000);
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
      clearTimeout(hardKill);
    }
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // A profile we cannot remove is litter, not a failure of the run.
    }
  };

  let cdp: CdpSession;
  let engine: string;
  try {
    const version = await waitForDebugger(port, profileDir, child);
    engine = version.engine;
    cdp = await connect(version.wsUrl);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: false,
    });
  } catch (err) {
    // Compose, never replace: a failure inside teardown must not swallow the
    // error that caused the teardown. This repo has paid for that four times.
    await cleanup();
    throw err;
  }

  return {
    cdp,
    engine,
    viewport,
    close: async () => {
      cdp.close();
      await cleanup();
    },
  };
}
