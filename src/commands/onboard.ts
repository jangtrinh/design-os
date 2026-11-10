/**
 * `ui onboard` command — this project's setup readiness checklist.
 *
 * The third leg of the doctor/onboard/guide triad (see
 * studio repo: specs/019-onboarding-first-run/overview.md): `ui doctor` asks "is the tool
 * healthy?", `ui onboard` asks "is THIS project set up, and what's next?",
 * `ui guide` asks "what can I do?". Deterministic and read-only — it never
 * mutates the filesystem and never installs anything; it only reports what
 * is missing and the exact command to fix it. Always exits 0 (informational,
 * like `design-os evolution`).
 */
import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { runOnboardAnswer } from "./onboard-answer.js";
import { ONBOARD_HELP } from "./onboard-help.js";
import { runOnboardQuestions } from "./onboard-questions.js";
import { runStatus } from "./onboard-status.js";
import { cwd as processCwd } from "node:process";

export { ONBOARD_HELP };

const CMD = "onboard";
const SUBCOMMANDS = ["status", "questions", "answer"] as const;

export const onboardCommand = {
  name: CMD,
  summary: "Show this project's setup checklist and what to do next",
  hasSubcommands: true,
  help: ONBOARD_HELP,

  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case undefined:
      case "status": return runStatus(parsed);
      case "questions": return runOnboardQuestions(parsed, processCwd());
      case "answer": return runOnboardAnswer(parsed, processCwd());
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Subcommands: ${SUBCOMMANDS.join(", ")}. Run 'ui onboard --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
