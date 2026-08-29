import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const CLI = join(ROOT, "dist", "cli.js");
const OUTPUT = process.argv[2] ?? join(ROOT, "showcase/native-mobile-proof-pilot/evidence/tier-01-routing.json");
const sha256 = (body) => createHash("sha256").update(body).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
  return { code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
};
const json = (text) => JSON.parse(text);
const digestFile = (root, path) => {
  const body = readFileSync(join(root, path));
  return { path, sha256: sha256(body) };
};

const consumer = mkdtempSync(join(tmpdir(), "design-os-native-consumer-"));
try {
  const init = run(process.execPath, [CLI, "init", "--all", "--cwd", consumer, "--json"]);
  if (init.code !== 0) throw new Error(`clean consumer init failed: ${init.stderr || init.stdout}`);
  const installed = [
    ".claude/commands/ui/native-ios.md",
    ".claude/commands/ui/native-ipados.md",
    ".claude/skills/design-os-native-ios-craft/SKILL.md",
    ".claude/skills/design-os-native-ipados-craft/SKILL.md",
    ".agent/workflows/ui-native-ios.md",
    ".agent/workflows/ui-native-ipados.md",
    ".agent/skills/design-os-native-ios-craft/SKILL.md",
    ".agent/skills/design-os-native-ipados-craft/SKILL.md",
    "AGENTS.ease-design.json",
    "AGENTS.md",
  ].map((path) => digestFile(consumer, path));

  const fixtures = ["native-ios-words", "native-ipados-words"];
  const activations = fixtures.map((name) => {
    const requestPath = join(ROOT, "tests/fixtures/capability-activation", `${name}.json`);
    const result = run(process.execPath, [CLI, "knowledge", "activate", requestPath, "--dir", ROOT, "--json"]);
    if (result.code !== 0) throw new Error(`${name} activation failed: ${result.stderr || result.stdout}`);
    return { request: json(readFileSync(requestPath, "utf8")), receipt: json(result.stdout).data };
  });

  const hostilePath = join(consumer, "generic-apple-mobile.json");
  const hostileRequest = {
    kind: "capability-activation-request",
    version: 1,
    rawRequest: "Build an Apple mobile app",
    requestedSurface: "native-mobile",
    inputKind: "words",
    selectionEvidence: { kind: "quoted-request", quote: "Apple mobile app", role: "requested-artifact" },
  };
  writeFileSync(hostilePath, `${JSON.stringify(hostileRequest, null, 2)}\n`);
  const hostile = run(process.execPath, [CLI, "knowledge", "activate", hostilePath, "--dir", ROOT, "--json"]);
  if (hostile.code === 0) throw new Error("generic Apple mobile activation must fail closed");

  const focused = run("npx", ["vitest", "run",
    "tests/native-mobile-arms.test.ts",
    "tests/capability-profile-resolution.test.ts",
    "tests/capability-pilot-receipt.test.ts",
    "tests/cmd-init-built-binary.test.ts",
    "--reporter=json"]);
  if (focused.code !== 0) throw new Error(`focused native gates failed: ${focused.stderr || focused.stdout}`);
  const focusedResult = json(focused.stdout);
  const git = run("git", ["rev-parse", "HEAD"]);
  const node = run(process.execPath, ["--version"]);
  const npm = run("npm", ["--version"]);
  const xcode = run("xcodebuild", ["-version"]);
  const macos = run("sw_vers", ["-productVersion"]);

  const report = {
    kind: "design-os.native-mobile-routing-evidence",
    version: 1,
    capturedAt: new Date().toISOString(),
    routingBaseGitSha: git.stdout,
    environment: { node: node.stdout, npm: npm.stdout, macOS: macos.stdout, xcode: xcode.stdout.replaceAll("\n", " / ") },
    cleanConsumer: {
      initCommand: "ui init --all --cwd <fresh-temp-dir> --json",
      installedArtifacts: installed,
    },
    activations,
    hostileCases: [{
      request: hostileRequest,
      result: json(hostile.stdout),
      expected: "UNKNOWN_CAPABILITY; caller must clarify native-ios versus native-ipados",
    }],
    focusedGate: {
      files: focusedResult.testResults.map((item) => relative(ROOT, item.name)),
      totalTests: focusedResult.numTotalTests,
      passedTests: focusedResult.numPassedTests,
      failedTests: focusedResult.numFailedTests,
      success: focusedResult.success,
    },
  };
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`WROTE ${relative(ROOT, OUTPUT)} (${report.focusedGate.passedTests}/${report.focusedGate.totalTests} tests)\n`);
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
