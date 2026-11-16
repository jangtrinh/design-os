/**
 * Probe (once) for installed Google Chrome — what Playwright `channel: "chrome"` needs.
 *
 * Used by `describe.skipIf(!hasChrome())` so a CI runner WITHOUT Chrome degrades gracefully
 * (the browser suite skips) instead of hard-failing. GitHub `ubuntu-latest` ships Chrome, so
 * there the probe passes and the real rendered audit runs.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let cached: boolean | undefined;

export function hasChrome(): boolean {
  if (cached === undefined) cached = detect();
  return cached;
}

function detect(): boolean {
  // macOS
  let foundCandidate = existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  // Windows
  if (!foundCandidate) {
    for (const p of [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ]) {
      if (existsSync(p)) {
        foundCandidate = true;
        break;
      }
    }
  }
  // Linux / PATH — channel:chrome resolves google-chrome(-stable).
  if (!foundCandidate) {
    const which = process.platform === "win32" ? "where" : "which";
    for (const bin of ["google-chrome", "google-chrome-stable", "chrome"]) {
      const r = spawnSync(which, [bin], { encoding: "utf8" });
      if (r.status === 0 && r.stdout.trim().length > 0) {
        foundCandidate = true;
        break;
      }
    }
  }
  if (!foundCandidate) return false;

  // Verify that Playwright channel 'chrome' can actually launch in this environment
  // (guards against unprivileged container sandbox restrictions or broken installs).
  const probe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import { chromium } from "playwright"; const b = await chromium.launch({ channel: "chrome", headless: true }); await b.close();',
    ],
    { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8", timeout: 10_000 },
  );
  return probe.status === 0;
}
