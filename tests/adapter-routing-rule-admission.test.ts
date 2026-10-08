import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildRoutingRule } from "../src/adapters/wrapper-shapes-shared.js";
import { checkWrappers } from "../src/core/adapter-wrapper-lint.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const original = buildRoutingRule(resolve("templates"), resolve("knowledge"));
function lint(content: string) {
  const cwd = mkdtempSync(join(tmpdir(), "routing-rule-admission-"));
  dirs.push(cwd);
  const relative = ".claude/rules/design-os-routing.md";
  const path = join(cwd, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return checkWrappers(cwd, { adapters: [relative] });
}

describe("generated routing rule frontmatter admission", () => {
  it("accepts generated rule and CRLF", () => {
    expect(lint(original).status).toBe("pass");
    expect(lint(original.replaceAll("\n", "\r\n")).status).toBe("pass");
  });
  it.each([
    ['invalid closing delimiter', original.replace('trigger: always_on\n---', 'trigger: always_on\n---broken')],
    ['unclosed description quote', original.replace(/^description:.*$/m, 'description: "unfinished')],
    ['quoted paths key', original.replace('trigger: always_on', 'trigger: always_on\n"paths": "src/**"')],
    ['quoted duplicate trigger', original.replace('trigger: always_on', 'trigger: always_on\n"trigger": manual')],
    ['unknown activation key', original.replace('trigger: always_on', 'trigger: always_on\nactivation: manual')],
    ['indented trigger', original.replace('trigger: always_on', '  trigger: always_on')],
    ['missing description', original.replace(/^description:.*\n/m, '')],
  ])("refuses %s", (_name, content) => {
    expect(lint(content).status).toBe("fail");
  });
});
