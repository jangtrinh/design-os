/**
 * The registry door writes a binding only when its token is written; an unreadable sealed registry is refused, not
 * counted as empty; `--reset-registry` removes everything a registry import wrote; a role the store cannot take is
 * refused before anything is sealed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRulings } from "../src/core/owner-rulings/ruling-store.js";
import { fingerprintOf } from "../src/core/owner-rulings/fingerprint.js";
import { newProject } from "./figma-ingest-helpers.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf, projectWith, submit } from "./project-kinds-helpers.js";
import { ingest, json, sealRegistry, smallScan } from "./ds-import-registry-helpers.js";

/** A token file with one typeable colour and one value the importer cannot type, plus a registry binding both. */
function bound(tokensUsed: string[]): { tokens: string; registry: string; project: string } {
  const { registry } = ingest(smallScan());
  const doc = JSON.parse(readFileSync(registry, "utf8")) as { version: string; components: Record<string, unknown>[] };
  const file = join(newProject(), "component-registry.json");
  writeFileSync(file, JSON.stringify({ version: doc.version, components: doc.components.map((c, i) => (i === 0 ? { ...c, tokensUsed } : c)) }));
  const tokens = join(newProject(), "tokens.json");
  writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff", weird: "zzz" } }));
  return { tokens, registry: file, project: projectWith({ "package.json": "{}" }) };
}
/** A kernel-shaped registry file whose components are not a list: readable, but not provably empty. */
const CORRUPT = JSON.stringify({ version: "1", components: "oops" });
const importArgs = (t: { tokens: string; registry: string; project: string }, extra: string[] = []): string[] => ["ds", "import", t.tokens, "--registry", t.registry, "--dir", t.project, "--json", ...extra];
function answerAll(project: string, choice: string): void {
  const answers = keyOf(project).filter((k) => k.kind === "untypeable-tokens").map((k) => ({ fingerprint: k.fingerprint, choice }));
  expect(submit(project, answers).code).toBe(0);
}

describe("a binding is written only when its token is written", () => {
  it("a binding to a token an answer left out is dropped from the record, counted, and named; the other bindings stay", () => {
    const t = bound(["colors.primary", "colors.weird"]);
    expect(json(capture(importArgs(t)).out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    answerAll(t.project, "exclude");
    const r = capture(importArgs(t));
    expect(r.code, r.out).toBe(0);
    const data = json(r.out).data!;
    expect(data["ledger"].bindingsLeftOut).toBe(1);
    expect(data["bindingsLeftOutItems"]).toEqual([{ record: sealRegistry(t.project).components[0]!.name, token: "colors.weird" }]);
    expect(sealRegistry(t.project).components[0]!.tokensUsed).toEqual(["colors.primary"]);
    expect(capture(["ds", "status", "--dir", t.project, "--json"]).code).toBe(0);
  });
  it("a token kept raw is not at its path, so the binding to it is dropped too", () => {
    const t = bound(["colors.weird"]);
    capture(importArgs(t));
    answerAll(t.project, "keep-raw");
    const r = capture(importArgs(t));
    expect(r.code, r.out).toBe(0);
    expect(json(r.out).data!["ledger"].bindingsLeftOut).toBe(1);
    expect(sealRegistry(t.project).components[0]!.tokensUsed).toEqual([]);
  });
  it("the text output names ten and points at --json", () => {
    const t = bound(["colors.weird"]);
    capture(importArgs(t));
    answerAll(t.project, "exclude");
    const text = capture(["ds", "import", t.tokens, "--registry", t.registry, "--dir", t.project]).out;
    expect(text).toContain("registry bindings left out: 1");
    expect(text).toContain("→ colors.weird");
  });
  it("a binding to a token that is not in the token file at all is refused BAD_REGISTRY, naming the record and the token, and nothing is written", () => {
    const t = bound(["colors.missing"]);
    const before = hashTree(t.project);
    const r = capture(importArgs(t));
    expect(r.code).toBe(1);
    const e = json(r.out).error!;
    expect(e.code).toBe("BAD_REGISTRY");
    expect(e.message).toContain("colors.missing");
    expect(e.message).toContain("binds the token");
    expect(e.message).toContain("same ui ingest-figma-ds run");
    expect(hashTree(t.project)).toBe(before);
    expect(existsSync(join(t.project, ".design-os"))).toBe(false);
  });
  it("a registry whose bindings are all in the file imports as before, with no binding fields", () => {
    const t = bound(["colors.primary"]);
    capture(importArgs(t));
    answerAll(t.project, "exclude");
    const data = json(capture(importArgs(t)).out).data!;
    expect(data["bindingsLeftOutItems"]).toBeUndefined();
    expect(data["ledger"].bindingsLeftOut).toBeUndefined();
    expect(sealRegistry(t.project).components[0]!.tokensUsed).toEqual(["colors.primary"]);
  });
});

describe("a sealed registry that cannot be read is refused, not counted as empty", () => {
  const sealed = (): { project: string; tokens: string; registry: string } => {
    const { tokens, registry } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--registry", registry, "--dir", project]).code).toBe(0);
    return { project, tokens, registry };
  };
  it("--force over a registry whose components are not a list: BAD_SEALED_REGISTRY with the next action, and nothing changes", () => {
    const { project, tokens, registry } = sealed();
    writeFileSync(join(project, "design", "component-registry.json"), CORRUPT);
    const before = hashTree(project);
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--force", "--json"]);
    expect(json(r.out).error!.code).toBe("BAD_SEALED_REGISTRY");
    expect(json(r.out).error!.message).toContain("--reset-registry");
    expect(hashTree(project)).toBe(before);
  });
  it("a file that is a JSON document but not a registry is refused too", () => {
    const { project, tokens } = sealed();
    writeFileSync(join(project, "design", "component-registry.json"), JSON.stringify({ version: "1" }));
    // the tokens file exists, so --force is what lets the import get as far as the registry
    const r = capture(["ds", "import", tokens, "--dir", project, "--force", "--json"]);
    expect(json(r.out).error!.code).toBe("BAD_SEALED_REGISTRY");
  });
  it("--reset-registry is the explicit way out: it replaces the unreadable registry and the store verifies", () => {
    const { project, tokens, registry } = sealed();
    writeFileSync(join(project, "design", "component-registry.json"), CORRUPT);
    const r = capture(["ds", "import", tokens, "--registry", registry, "--dir", project, "--force", "--reset-registry", "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
  });
});

describe("--reset-registry removes everything a registry import wrote", () => {
  it("--force --reset-registry alone leaves no stale index or shard, and `ui ds status` is ok", () => {
    const { tokens, registry } = ingest(smallScan());
    const project = projectWith({ "package.json": "{}" });
    expect(capture(["ds", "import", tokens, "--registry", registry, "--dir", project]).code).toBe(0);
    expect(existsSync(join(project, "design", "registry", "index.json"))).toBe(true);
    const r = capture(["ds", "import", tokens, "--dir", project, "--force", "--reset-registry", "--json"]);
    expect(r.code, r.out).toBe(0);
    expect(existsSync(join(project, "design", "registry"))).toBe(false);
    expect(sealRegistry(project).components).toEqual([]);
    expect(capture(["ds", "status", "--dir", project, "--json"]).code).toBe(0);
  });
});

describe("a role the store cannot take is refused before anything is sealed", () => {
  it("an unknown role in a recorded answer: BAD_ROLE, nothing written under design/", () => {
    const project = projectWith({ "package.json": "{}" });
    const src = join(newProject(), "tokens.json");
    writeFileSync(src, JSON.stringify({ colors: { primary: "#3366ff", "card-popover": "#ffffff", "primary-secondary": "#eeeeee" } }));
    expect(json(capture(["ds", "import", src, "--dir", project, "--json"]).out).error!.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    const key = keyOf(project).find((k) => k.kind === "ambiguous-roles")!;
    appendRulings(project, [{
      kind: "ambiguous-roles", fingerprint: fingerprintOf("ambiguous-roles", key.perMemberAnswer!.members), choice: "review-individually",
      covers: key.perMemberAnswer!.members, members: Object.fromEntries(key.perMemberAnswer!.members.map((m, i) => [m, i === 0 ? "banana" : "none"])),
      actor: "owner", at: "2026-11-11T09:00:00Z",
    }]);
    const r = capture(["ds", "import", src, "--dir", project, "--json"]);
    expect(json(r.out).error!.code).toBe("BAD_ROLE");
    expect(json(r.out).error!.message).toContain("Nothing was written");
    expect(existsSync(join(project, "design", "design.tokens.json"))).toBe(false);
  });
});
