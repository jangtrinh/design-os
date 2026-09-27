import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";
import { deriveCopyLanguage } from "../src/core/brief-copy-language.js";
import { CLAUDE_HEADER_MAX, CLAUDE_MAX_OPTIONS, CLAUDE_MAX_QUESTIONS } from "../src/core/brief-questions-format.js";

const FIX = join(process.cwd(), "tests", "fixtures", "brief");

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

interface Q { id: string; field: string; header: string; routeChanging: boolean; recommended: string | null; recommendedReason?: string; options: { label: string }[] }
/** Runs `ui brief lint` on a fixture and returns the questions file it wrote. */
function questionsFor(name: string): { file: string; questions: Q[] } {
  const file = join(mkdtempSync(join(tmpdir(), "brief-q-")), "questions.json");
  capture(["brief", "lint", join(FIX, `${name}.json`), "--questions", file, "--json"]);
  return { file, questions: JSON.parse(readFileSync(file, "utf8")).questions };
}

describe("copyLanguage derivation from the script of rawRequest", () => {
  it.each([
    ["Build the usage screen for Platform Admin", "en"],
    ["X\u00e2y d\u1ef1ng m\u00e0n h\u00ecnh qu\u1ea3n l\u00fd ng\u01b0\u1eddi d\u00f9ng cho qu\u1ea3n tr\u1ecb vi\u00ean", "vi"],
    ["Build the trang qu\u1ea3n l\u00fd screen for admins and more words here", "mixed"],
    ["Cr\u00e9er l'\u00e9cran r\u00e9sum\u00e9 pour caf\u00e9", "en"],
    ["", "en"],
  ])("%s → %s", (raw, language) => {
    expect(deriveCopyLanguage(raw).language).toBe(language);
  });
});

describe("questions.json", () => {
  it("one question per blocking field, with a rule-derived default only where a rule exists", () => {
    const { questions } = questionsFor("webapp-needs-language");
    expect(questions.map((q) => q.field)).toEqual(["screens[users].states", "copyLanguage"]);
    expect(questions[0]).toMatchObject({ recommended: "empty, loading, error, full", routeChanging: false });
    expect(questions[1]).toMatchObject({ recommended: "Vietnamese", header: "Language" });
    expect(questions[1]!.recommendedReason).toMatch(/rawRequest script: \d+ of \d+ words/);
  });
  it("questions without a derivable default carry recommended: null", () => {
    const { questions } = questionsFor("webapp-many-questions");
    for (const q of questions.filter((x) => x.field === "roles" || x.field === "screens")) expect(q.recommended).toBeNull();
  });
  it("route-changing questions come first, order otherwise stable", () => {
    const { questions } = questionsFor("webapp-many-questions");
    expect(questions.map((q) => q.field)).toEqual([
      "screens", "roles", "status", "assumption:surface", "copyLanguage", "assumption:flows",
    ].sort((a, b) => Number(!isRoute(a)) - Number(!isRoute(b))));
    expect(questions.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6"]);
  });
});
const isRoute = (f: string): boolean => ["screens", "roles", "status", "assumption:surface"].includes(f);

describe("ui brief questions --format claude", () => {
  it("emits the AskUserQuestion shape: header <= 12, 2-4 options, recommended first", () => {
    const { file } = questionsFor("webapp-needs-language");
    const r = capture(["brief", "questions", file, "--format", "claude"]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.out);
    expect(payload.remaining).toBe(0);
    for (const q of payload.questions) {
      expect(q.header.length).toBeLessThanOrEqual(CLAUDE_HEADER_MAX);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(CLAUDE_MAX_OPTIONS);
      expect(q.multiSelect).toBe(false);
    }
    expect(payload.questions[1].options[0].label).toBe("Vietnamese (Recommended)");
    expect(payload.questions[1].options.filter((o: { label: string }) => o.label.includes("(Recommended)"))).toHaveLength(1);
  });
  it("caps at 4 questions per call and reports the rest instead of dropping them", () => {
    const { file, questions } = questionsFor("webapp-many-questions");
    expect(questions.length).toBe(6);
    const payload = JSON.parse(capture(["brief", "questions", file, "--format", "claude"]).out);
    expect(payload.questions).toHaveLength(CLAUDE_MAX_QUESTIONS);
    expect(payload.remaining).toBe(2);
    expect(payload.remainingIds).toEqual(["q5", "q6"]);
  });
  it("truncates an over-long header and keeps the recommended option when trimming to 4", () => {
    const file = join(mkdtempSync(join(tmpdir(), "brief-q-")), "q.json");
    const opts = ["a", "b", "c", "d", "e"].map((label) => ({ label, description: label }));
    writeFileSync(file, JSON.stringify({ kind: "brief-questions", version: 1, surface: "web-app", d4: {}, questions: [
      { id: "q1", field: "f", header: "a-very-long-header", question: "?", routeChanging: false, recommended: "e", options: opts },
    ] }));
    const q = JSON.parse(capture(["brief", "questions", file, "--format", "claude"]).out).questions[0];
    expect(q.header).toBe("a-very-long-");
    expect(q.header.length).toBeLessThanOrEqual(CLAUDE_HEADER_MAX);
    expect(q.options.map((o: { label: string }) => o.label)).toEqual(["e (Recommended)", "a", "b", "c"]);
  });
});

describe("ui brief questions --format markdown", () => {
  it("emits a gap sheet with the receipt, checkboxes, the derived-default note and an Answer line", () => {
    const { file } = questionsFor("webapp-needs-language");
    const r = capture(["brief", "questions", file, "--format", "markdown"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^# Brief gap sheet/);
    expect(r.out).toMatch(/Decision: CONTINUE \(B=2, R=no, L=1\)/);
    expect(r.out).toMatch(/- \[ \] Vietnamese \(Recommended\)/);
    expect(r.out).toMatch(/Default derived from: rawRequest script/);
    expect(r.out.match(/^Answer: /gm)).toHaveLength(2);
  });
  it("zero questions still renders a sheet that says so", () => {
    const { file } = questionsFor("dashboard-complete");
    expect(capture(["brief", "questions", file, "--format", "markdown"]).out).toMatch(/No open questions\./);
  });
});

describe("ui brief questions — input errors", () => {
  it("bad --format and a file that is not a questions file exit 1", () => {
    const { file } = questionsFor("webapp-needs-language");
    expect(JSON.parse(capture(["brief", "questions", file, "--format", "html", "--json"]).out).error.code).toBe("BAD_ARG");
    const wrong = join(FIX, "dashboard-complete.json");
    const r = capture(["brief", "questions", wrong, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_QUESTIONS");
  });
  it("a subcommand is required", () => {
    expect(capture(["brief", "--json"]).code).toBe(1);
  });
});
