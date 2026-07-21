import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

// In-process CLI capture (mirrors cmd-doctor.test.ts / cmd-guide.test.ts).
function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "ease-onboard-"));
}

interface OnboardJson {
  ok: boolean;
  data: { steps: { id: string; state: string; optional: boolean }[]; ready: boolean };
}

describe("ui onboard — empty project", () => {
  it("every core step is pending, ready:false, and exit code is 0", () => {
    const dir = tmp();
    const { code, out } = captureRun(["onboard", "--cwd", dir, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as OnboardJson;
    expect(json.ok).toBe(true);
    expect(json.data.ready).toBe(false);
    const byId = Object.fromEntries(json.data.steps.map((s) => [s.id, s]));
    expect(byId["adapters"]?.state).toBe("pending");
    expect(byId["git"]?.state).toBe("pending"); // git is a prerequisite — its absence blocks READY
    expect(byId["ds"]?.state).toBe("pending");
    expect(byId["soul"]?.state).toBe("pending");
    expect(byId["heartbeat"]?.state).toBe("pending");
    expect(byId["agents"]?.optional).toBe(true);
    expect(byId["figma"]?.optional).toBe(true);
  });

  it("shows the honest text checklist with pending marks and hints", () => {
    const dir = tmp();
    const { out } = captureRun(["onboard", "--cwd", dir]);
    expect(out).toContain("[ ] design system");
    expect(out).toContain("run `ui ds init`");
    expect(out).toContain("SETUP");
    expect(out).toContain("ui guide");
  });
});

describe("ui onboard — fully set up project", () => {
  function setupDir(): string {
    const dir = tmp();
    mkdirSync(join(dir, ".claude"), { recursive: true });
    mkdirSync(join(dir, "design"), { recursive: true });
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, ".claude", "ease-design.json"), JSON.stringify({ version: 1 }), "utf8");
    writeFileSync(join(dir, "design", "ds.manifest.json"), JSON.stringify({ name: "acme" }), "utf8");
    writeFileSync(join(dir, "design", "soul.md"), "---\nstatus: ratified\n---\n\n# Design Soul\n", "utf8");
    writeFileSync(join(dir, "design", "heartbeat.json"), JSON.stringify({ tasks: [] }), "utf8");
    return dir;
  }

  it("marks the five core steps done and ready:true", () => {
    const dir = setupDir();
    const { code, out } = captureRun(["onboard", "--cwd", dir, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as OnboardJson;
    expect(json.data.ready).toBe(true);
    const byId = Object.fromEntries(json.data.steps.map((s) => [s.id, s]));
    expect(byId["adapters"]?.state).toBe("done");
    expect(byId["git"]?.state).toBe("done");
    expect(byId["ds"]?.state).toBe("done");
    expect(byId["soul"]?.state).toBe("done");
    expect(byId["heartbeat"]?.state).toBe("done");
  });

  it("shows a draft (unratified) soul as a warn, not done", () => {
    const dir = setupDir();
    writeFileSync(join(dir, "design", "soul.md"), "---\nstatus: draft\n---\n\n# Design Soul\n", "utf8");
    const { out } = captureRun(["onboard", "--cwd", dir, "--json"]);
    const json = JSON.parse(out) as OnboardJson;
    const soul = json.data.steps.find((s) => s.id === "soul");
    expect(soul?.state).toBe("warn");
  });

  it("shows READY in the text header", () => {
    const dir = setupDir();
    const { out } = captureRun(["onboard", "--cwd", dir]);
    expect(out).toContain("READY");
  });
});

describe("ui onboard — robustness", () => {
  it("does not crash when design/soul.md is a directory (still exits 0, soul pending)", () => {
    const dir = tmp();
    mkdirSync(join(dir, "design", "soul.md"), { recursive: true });
    const { code, out } = captureRun(["onboard", "--cwd", dir, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as OnboardJson;
    expect(json.data.steps.find((s) => s.id === "soul")?.state).toBe("pending");
  });
});

describe("ui onboard — --no-banner", () => {
  it("omits the wordmark when --no-banner is passed", () => {
    const dir = tmp();
    const withBanner = captureRun(["onboard", "--cwd", dir]).out;
    const withoutBanner = captureRun(["onboard", "--cwd", dir, "--no-banner"]).out;
    expect(withBanner).toContain("DESIGN");
    expect(withoutBanner.length).toBeLessThan(withBanner.length);
    expect(withoutBanner).toContain("onboarding");
  });

  it("never shows the banner in --json mode", () => {
    const dir = tmp();
    const { out } = captureRun(["onboard", "--cwd", dir, "--json"]);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe("ui onboard — exit code", () => {
  it("always exits 0, even on an empty/not-ready project", () => {
    const dir = tmp();
    expect(captureRun(["onboard", "--cwd", dir]).code).toBe(0);
    expect(captureRun(["onboard", "--cwd", dir, "--json"]).code).toBe(0);
  });
});
