/**
 * On a sealed design system a register runs the markup through the design system's usage lint and
 * the owner-promoted token-ban rules before anything is written. An `error` finding refuses the
 * register; a warning is printed and does not. The same verdicts hold when the markup arrives on stdin.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../src/core/registry-store.js";
import {
  CLEAN_MARKUP, FAKE_MONOSPACE, WARNING_ONLY_MARKUP, cleanupProjects, sealedProject, snapshot,
} from "./registry-provenance-harness.js";
import type { Captured, Project } from "./registry-provenance-harness.js";

// In-process stdin: the markup reader's seam is replaced by a payload the test sets.
let stdinPayload = "";
vi.mock("../src/core/stdin-reader.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/core/stdin-reader.js")>()),
  readAllStdin: () => stdinPayload,
}));

afterEach(() => cleanupProjects());

const REF = ["--source-ref", "src/widget.svelte:1-3"];
const errorOf = (r: Captured): { code: string; message: string } =>
  (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
const FAKE = readFileSync(FAKE_MONOSPACE, "utf8");
const PROMOTED_BAN = JSON.stringify({ rules: [{ id: "no-mono", kind: "token-ban", severity: "error", message: "no mono in UI", source: "monospace ban", tokens: ["font-mono"] }] });

function putRules(p: Project, text: string): void {
  mkdirSync(join(p.designDir, "rules"), { recursive: true });
  writeFileSync(join(p.designDir, "rules", "_adherence.rules.json"), text);
}

describe("markup lint on a sealed store", () => {
  it("fake monospace markup: no ref is REGISTRY_MISSING_SOURCE_REF", () => {
    const p = sealedProject();
    const before = snapshot(p.designDir);
    const r = p.register(["--json"], { markup: FAKE_MONOSPACE });
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("REGISTRY_MISSING_SOURCE_REF");
    expect(snapshot(p.designDir)).toEqual(before);
  });

  it("fake monospace markup with a valid ref: REGISTRY_MARKUP_DRIFT naming both findings, nothing written", () => {
    const p = sealedProject();
    const before = snapshot(p.designDir);
    const r = p.register([...REF, "--json"], { markup: FAKE_MONOSPACE });
    expect(r.code).toBe(1);
    const e = errorOf(r);
    expect(e.code).toBe("REGISTRY_MARKUP_DRIFT");
    expect(e.message).toContain("off-system-font");
    expect(e.message).toContain("hardcoded-color");
    expect(e.message).toMatch(/line 2/); // each finding carries its line
    expect(snapshot(p.designDir)).toEqual(before);
  });

  it("text mode prints the code and each finding on stderr", () => {
    const r = sealedProject().register(REF, { markup: FAKE_MONOSPACE });
    expect(r.code).toBe(1);
    expect(r.err).toContain("REGISTRY_MARKUP_DRIFT");
    expect(r.err).toContain("off-system-font");
    expect(r.err).toContain("hardcoded-color");
  });

  it("lints a synthetic approval too: approval skips the source, not the design system", () => {
    const p = sealedProject();
    const r = p.register(["--synthetic-approved", "--reason", "no source", "--json"], { markup: FAKE_MONOSPACE });
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("REGISTRY_MARKUP_DRIFT");
  });

  it("clean markup with a valid ref registers and stores the provenance", () => {
    const p = sealedProject();
    const r = p.register(REF);
    expect(r.code, r.err).toBe(0);
    expect(loadRegistry(p.registryFile).components.find((c) => c.name === "Table/Fake")?.provenance?.kind).toBe("code");
  });

  it("a warning (off-system-token) is printed and does not block", () => {
    const p = sealedProject();
    writeFileSync(join(p.root, "warn.html"), WARNING_ONLY_MARKUP);
    const r = p.register(REF, { markup: join(p.root, "warn.html") });
    expect(r.code, r.err).toBe(0);
    expect(r.out + r.err).toContain("off-system-token");
  });

  it("a promoted token-ban rule with error severity refuses the register", () => {
    const p = sealedProject();
    putRules(p, PROMOTED_BAN);
    writeFileSync(join(p.root, "ban.html"), `${CLEAN_MARKUP}<p class="font-mono">b</p>\n`);
    const r = p.register([...REF, "--json"], { markup: join(p.root, "ban.html") });
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("REGISTRY_MARKUP_DRIFT");
    expect(errorOf(r).message).toContain("token-ban/no-mono");
  });

  it("an invalid promoted rules file stops the register with the loader's code and writes nothing", () => {
    const p = sealedProject();
    putRules(p, "{ not json");
    const before = snapshot(p.designDir);
    const r = p.register([...REF, "--json"]);
    expect(r.code).toBe(1);
    expect(errorOf(r).code).toBe("ADHERENCE_BAD_JSON");
    expect(snapshot(p.designDir)).toEqual(before);
  });

  it("a ref that does not verify is refused before the markup is linted", () => {
    const r = sealedProject().register(["--source-ref", "src/nope.svelte:1-2", "--json"], { markup: FAKE_MONOSPACE });
    expect(errorOf(r).code).toBe("REGISTRY_BAD_SOURCE_REF");
  });
});

describe("markup on stdin gives the same verdicts as a file", () => {
  const viaStdin = (p: Project, markup: string, extra: string[]): Captured => {
    stdinPayload = markup;
    return p.register([...extra, "--json"], { markup: "-" });
  };

  it("without a ref: REGISTRY_MISSING_SOURCE_REF", () => {
    expect(errorOf(viaStdin(sealedProject(), FAKE, [])).code).toBe("REGISTRY_MISSING_SOURCE_REF");
  });

  it("with a valid ref: REGISTRY_MARKUP_DRIFT naming both findings, nothing written", () => {
    const p = sealedProject();
    const before = snapshot(p.designDir);
    const e = errorOf(viaStdin(p, FAKE, REF));
    expect(e.code).toBe("REGISTRY_MARKUP_DRIFT");
    expect(e.message).toContain("off-system-font");
    expect(e.message).toContain("hardcoded-color");
    expect(snapshot(p.designDir)).toEqual(before);
  });

  it("clean markup with a valid ref registers", () => {
    const p = sealedProject();
    const r = viaStdin(p, CLEAN_MARKUP, REF);
    expect(r.code, r.out).toBe(0);
    expect(loadRegistry(p.registryFile).components.find((c) => c.name === "Table/Fake")?.provenance?.sourceRef).toBe("src/widget.svelte:1-3");
  });
});

describe("built binary", () => {
  const DIST_CLI = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist", "cli.js");

  it("refuses fake markup piped on real stdin: missing ref, then drift, then success when clean", () => {
    expect(existsSync(DIST_CLI), `dist/cli.js missing — run "npm run build"`).toBe(true);
    const p = sealedProject();
    const ui = (extra: string[], input: string) => spawnSync("node", [
      DIST_CLI, "registry", "register", "Table/Fake", "--category", "data", "--markup", "-", "--file", p.registryFile, "--json", ...extra,
    ], { encoding: "utf8", input, cwd: p.root });
    const code = (r: ReturnType<typeof ui>): string => (JSON.parse(r.stdout) as { error: { code: string } }).error.code;
    const missing = ui([], FAKE);
    expect(missing.status).toBe(1);
    expect(code(missing)).toBe("REGISTRY_MISSING_SOURCE_REF");
    const drift = ui(REF, FAKE);
    expect(drift.status).toBe(1);
    expect(code(drift)).toBe("REGISTRY_MARKUP_DRIFT");
    const ok = ui(REF, CLEAN_MARKUP);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
  });
});
