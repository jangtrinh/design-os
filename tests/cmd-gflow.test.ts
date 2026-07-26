import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { stdout += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { stderr += String(chunk); return true; };
  try {
    return { exitCode: run(args), stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

function executable(path: string, source: string): void {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`, "utf8");
  chmodSync(path, 0o755);
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "dist", "cli.js"), ...args], {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => { resolvePromise({ code: code ?? 1, stdout, stderr }); });
  });
}

describe("ui gflow i2v", () => {
  let root: string;
  let bin: string;
  let originalPath: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ui-gflow-"));
    bin = join(root, "bin");
    mkdirSync(bin);
    originalPath = process.env.PATH;
    process.env.PATH = `${bin}:${originalPath ?? ""}`;
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  });

  it("runs only gflow video i2v, verifies the download, and extracts the next seed with ffmpeg", () => {
    const calls = join(root, "calls.jsonl");
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ bin: "gflow", args }) + "\\n");
const outDir = args[args.indexOf("--out-dir") + 1];
fs.mkdirSync(outDir, { recursive: true });
const video = path.join(outDir, "generated.mp4");
fs.writeFileSync(video, "video-bytes");
process.stdout.write(JSON.stringify({ jobId: "job-1", status: "complete" }));
`);
    executable(join(bin, "ffmpeg"), `
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ bin: "ffmpeg", args }) + "\\n");
if (args[0] === "-version") process.exit(0);
fs.writeFileSync(args[args.length - 1], "png-bytes");
`);

    const initial = join(root, "initial.png");
    const outDir = join(root, "clips");
    const seedOut = join(root, "next-seed.png");
    writeFileSync(initial, "seed", "utf8");

    const result = capture([
      "gflow", "i2v", "continue the same slow forward glide",
      "--initial-frame", initial,
      "--out-dir", outDir,
      "--seed-out", seedOut,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    const envelope = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({
      ok: true,
      command: "gflow i2v",
      data: {
        architecture: "A",
        video: join(outDir, "generated.mp4"),
        seed: seedOut,
        upstream: { jobId: "job-1", status: "complete" },
      },
    });

    const callLog = readFileSync(calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    const gflowCall = callLog.find((call) => call.bin === "gflow");
    const extractionCall = callLog.find((call) => call.bin === "ffmpeg" && call.args.includes("-sseof"));
    expect(gflowCall.args.slice(0, 2)).toEqual(["video", "i2v"]);
    expect(gflowCall.args).toContain("--json");
    expect(gflowCall.args).not.toContain("chain");
    expect(gflowCall.args).not.toContain("--end-frame");
    expect(extractionCall).toBeDefined();
    expect(extractionCall.args).toContain("-sseof");
    expect(extractionCall.args[extractionCall.args.indexOf("-sseof") + 1]).toBe("-1");
    expect(extractionCall.args).toContain("reverse");
  });

  it("rejects unsupported aspect ratios before invoking gflow", () => {
    const initial = join(root, "initial.png");
    writeFileSync(initial, "seed", "utf8");

    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", join(root, "clips"),
      "--aspect", "4:3",
      "--json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).error.code).toBe("BAD_ARG");
  });

  it("rejects unsupported model values before invoking gflow", () => {
    const initial = join(root, "initial.png");
    writeFileSync(initial, "seed", "utf8");
    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", join(root, "clips"),
      "--model", "omni-flash",
      "--json",
    ]);
    expect(JSON.parse(result.stdout).error.code).toBe("BAD_ARG");
  });

  it("isolates each download so stale or concurrent MP4s cannot be selected as this job's video", () => {
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out-dir") + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "generated.mp4"), "fresh-video");
process.stdout.write("{}");
`);
    executable(join(bin, "ffmpeg"), `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version") process.exit(0);
fs.writeFileSync(args[args.length - 1], "seed");
`);
    const initial = join(root, "initial.png");
    const outDir = join(root, "clips");
    mkdirSync(outDir);
    writeFileSync(join(outDir, "generated.mp4"), "stale-video", "utf8");
    writeFileSync(join(outDir, "unrelated.mp4"), "concurrent-video", "utf8");
    writeFileSync(initial, "seed", "utf8");

    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", outDir,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    const video = JSON.parse(result.stdout).data.video as string;
    expect(video).not.toBe(join(outDir, "unrelated.mp4"));
    expect(readFileSync(video, "utf8")).toBe("fresh-video");
    expect(readFileSync(join(outDir, "generated.mp4"), "utf8")).toBe("stale-video");
  });

  it("keeps videos and default seeds associated across parallel invocations", async () => {
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out-dir") + 1];
const prompt = args[4];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "generated.mp4"), prompt);
process.stdout.write(JSON.stringify({ prompt }));
`);
    executable(join(bin, "ffmpeg"), `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version") process.exit(0);
const input = args[args.indexOf("-i") + 1];
fs.writeFileSync(args[args.length - 1], fs.readFileSync(input));
`);
    const initial = join(root, "initial.png");
    const outDir = join(root, "clips");
    writeFileSync(initial, "seed", "utf8");
    const common = ["--initial-frame", initial, "--out-dir", outDir, "--json"];
    const env = { ...process.env, PATH: `${bin}:${originalPath ?? ""}` };

    const [first, second] = await Promise.all([
      runCli(["gflow", "i2v", "first-job", ...common], env),
      runCli(["gflow", "i2v", "second-job", ...common], env),
    ]);

    expect([first.code, second.code]).toEqual([0, 0]);
    const a = JSON.parse(first.stdout).data as { video: string; seed: string };
    const b = JSON.parse(second.stdout).data as { video: string; seed: string };
    expect(a.video).not.toBe(b.video);
    expect(a.seed).not.toBe(b.seed);
    expect(readFileSync(a.seed, "utf8")).toBe(readFileSync(a.video, "utf8"));
    expect(readFileSync(b.seed, "utf8")).toBe(readFileSync(b.video, "utf8"));
    expect(new Set([readFileSync(a.seed, "utf8"), readFileSync(b.seed, "utf8")])).toEqual(new Set(["first-job", "second-job"]));
  });

  it("rejects invalid local paths before invoking paid generation", () => {
    const calls = join(root, "gflow-called");
    executable(join(bin, "gflow"), `require("node:fs").writeFileSync(${JSON.stringify(calls)}, "called");`);
    const initialDirectory = join(root, "initial-directory");
    mkdirSync(initialDirectory);
    const blockedParent = join(root, "blocked-parent");
    writeFileSync(blockedParent, "not-a-directory", "utf8");

    const badInitial = capture([
      "gflow", "i2v", "move forward", "--initial-frame", initialDirectory,
      "--out-dir", join(root, "clips-a"), "--json",
    ]);
    expect(JSON.parse(badInitial.stdout).error.code).toBe("BAD_ARG");

    const badSeedParent = capture([
      "gflow", "i2v", "move forward", "--initial-frame", blockedParent,
      "--out-dir", join(root, "clips-b"), "--seed-out", join(blockedParent, "next.png"), "--json",
    ]);
    expect(JSON.parse(badSeedParent.stdout).error.code).toBe("FILE_IO_FAILED");

    const validInitial = join(root, "initial.png");
    const existingSeed = join(root, "existing-seed.png");
    writeFileSync(validInitial, "seed", "utf8");
    writeFileSync(existingSeed, "already-here", "utf8");
    const occupiedSeed = capture([
      "gflow", "i2v", "move forward", "--initial-frame", validInitial,
      "--out-dir", join(root, "clips-c"), "--seed-out", existingSeed, "--json",
    ]);
    expect(JSON.parse(occupiedSeed.stdout).error.code).toBe("FILE_IO_FAILED");

    const danglingSeed = join(root, "dangling-seed.png");
    symlinkSync(join(root, "missing-target.png"), danglingSeed);
    const danglingSeedResult = capture([
      "gflow", "i2v", "move forward", "--initial-frame", validInitial,
      "--out-dir", join(root, "clips-d"), "--seed-out", danglingSeed, "--json",
    ]);
    expect(JSON.parse(danglingSeedResult.stdout).error.code).toBe("FILE_IO_FAILED");
    expect(existsSync(calls)).toBe(false);
  });

  it("rejects non-file MP4 entries and cleans its private workspace", () => {
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out-dir") + 1];
fs.mkdirSync(path.join(outDir, "fake.mp4"), { recursive: true });
process.stdout.write("{}");
`);
    executable(join(bin, "ffmpeg"), `if (process.argv.slice(2)[0] === "-version") process.exit(0);`);
    const initial = join(root, "initial.png");
    const outDir = join(root, "clips");
    writeFileSync(initial, "seed", "utf8");

    const result = capture(["gflow", "i2v", "move forward", "--initial-frame", initial, "--out-dir", outDir, "--json"]);

    expect(JSON.parse(result.stdout).error.code).toBe("DOWNLOAD_MISSING");
    expect(readdirSync(outDir).filter((name) => name.startsWith(".ui-gflow-"))).toEqual([]);
  });

  it("creates the parent directory for a custom next-seed path", () => {
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const outDir = args[args.indexOf("--out-dir") + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "leg.mp4"), "video");
process.stdout.write("{}");
`);
    executable(join(bin, "ffmpeg"), `
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-version") process.exit(0);
fs.writeFileSync(args[args.length - 1], "seed");
`);
    const initial = join(root, "initial.png");
    const seedOut = join(root, "nested", "seeds", "next.png");
    writeFileSync(initial, "seed", "utf8");

    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", join(root, "clips"),
      "--seed-out", seedOut,
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data.seed).toBe(seedOut);
    expect(readdirSync(join(root, "nested", "seeds")).filter((name) => name.startsWith(".ui-gflow-seed-"))).toEqual([]);
  });

  it("preflights ffmpeg before spending a gflow credit", () => {
    const calls = join(root, "calls.jsonl");
    executable(join(bin, "gflow"), `
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(calls)}, "gflow\\n");
process.stdout.write("{}");
`);
    executable(join(bin, "ffmpeg"), `
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(calls)}, "ffmpeg\\n");
process.exit(127);
`);
    const initial = join(root, "initial.png");
    writeFileSync(initial, "seed", "utf8");
    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", join(root, "clips"),
      "--json",
    ]);
    expect(JSON.parse(result.stdout).error.code).toBe("DEPENDENCY_MISSING");
    expect(readFileSync(calls, "utf8")).toBe("ffmpeg\n");
  });

  it("rejects non-positive durations before invoking gflow", () => {
    const initial = join(root, "initial.png");
    writeFileSync(initial, "seed", "utf8");
    const result = capture([
      "gflow", "i2v", "move forward",
      "--initial-frame", initial,
      "--out-dir", join(root, "clips"),
      "--duration", "0",
      "--json",
    ]);
    expect(JSON.parse(result.stdout).error.code).toBe("BAD_ARG");
  });
});
