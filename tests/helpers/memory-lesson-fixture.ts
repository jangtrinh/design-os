import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../src/cli.js";
import { canonicalHash, canonicalStringify } from "../../src/core/ds-manifest.js";

export function captureMemory(args: string[]) {
  let out = "", err = "";
  const stdout = process.stdout.write, stderr = process.stderr.write;
  process.stdout.write = ((chunk: unknown) => { out += String(chunk); return true; }) as typeof stdout;
  process.stderr.write = ((chunk: unknown) => { err += String(chunk); return true; }) as typeof stderr;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = stdout; process.stderr.write = stderr; }
  return { code, out, err };
}

export function ownerMemoryFixture(names: string[] = Array.from({ length: 40 }, (_, i) => `Component/${i + 1}`)) {
  const dir = mkdtempSync(join(tmpdir(), "owner-learning-"));
  const init = captureMemory(["ds", "init", "owner", "--persona", "liquid-glass", "--intent", "Owner application", "--bare", "--dir", dir,
    "--persona-data", new URL("../../knowledge/personas/personas.json", import.meta.url).pathname]);
  if (init.code !== 0) throw new Error(init.out + init.err);
  const registry = { version: "1.0.0", components: names.map((name) => ({ name, category: "control", markup: "<button>Continue</button>", tokensUsed: [] })) };
  writeFileSync(join(dir, "design/component-registry.json"), canonicalStringify(registry));
  const manifestPath = join(dir, "design/ds.manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.registryHash = canonicalHash(registry);
  writeFileSync(manifestPath, canonicalStringify(manifest));
  const revision = canonicalHash({ compiledHash: manifest.compiledHash, registryHash: manifest.registryHash, generation: manifest.generation });
  const cmd = (args: string[]) => captureMemory(["memory", ...args, "--dir", dir]);
  const record = (type: string, data: unknown, extra: string[] = []) => {
    const result = cmd(["record", type, "--data", JSON.stringify(data), ...extra, "--no-registry", "--json"]);
    if (result.code !== 0) throw new Error(result.out + result.err);
    return JSON.parse(result.out).data.id as string;
  };
  writeFileSync(join(dir, "decision.md"), "Owner asks for short button labels in dense forms.\n");
  const fingerprint = JSON.parse(captureMemory(["memory", "fingerprint", join(dir, "decision.md"), "--json"]).out).data.fingerprint;
  const evidenceId = record("manual_edit", { summary: "Owner asks for short button labels." }, ["--artifact-ref", "decision.md", "--fingerprint", fingerprint]);
  const propose = (text = "Use short labels in dense forms.", kind = "project", target?: string) => record("lesson_proposed", {
    text, scope: { kind, ...(target === undefined ? {} : { target }) }, dsRevision: revision,
  }, ["--refs", evidenceId]);
  const review = (lessonId: string, decision = "accept") => {
    const reason = "Owner reviewed the concrete lesson.";
    const approvalRef = `${lessonId}-${decision}.json`;
    writeFileSync(join(dir, approvalRef), JSON.stringify({ lessonId, dsRevision: revision, decision, actor: "owner-test", reason }));
    const approvalFingerprint = JSON.parse(captureMemory(["memory", "fingerprint", join(dir, approvalRef), "--json"]).out).data.fingerprint;
    return record("lesson_reviewed", { lessonId, decision, reason, approvalRef, approvalFingerprint }, ["--actor", "owner-test", "--refs", lessonId]);
  };
  return { dir, cmd, record, revision, propose, review, manifestPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
