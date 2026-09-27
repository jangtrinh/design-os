/** `ui brief` — the intake contract: lint a design brief, turn its gaps into questions. */
import { errJson, errText } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { runBriefLint } from "./brief-lint.js";
import { runBriefQuestions } from "./brief-questions.js";

const CMD = "brief";

export const BRIEF_HELP = `ui brief — the intake contract for a design brief

Usage:
  ui brief lint <brief.json> [--questions <out.json>] [--json]
  ui brief questions <questions.json> [--format claude|markdown] [--json]

Subcommands:
  lint       Validate the brief against schemas/design-brief.schema.json, apply the route rules
             (web-app | dashboard | mobile-app need screens[] with a state each, roles[], status),
             and print the D4 receipt. --questions writes one question per blocking field.
  questions  Render a questions.json for a runtime: 'claude' emits the AskUserQuestion payload
             (max 4 questions, recommended option first), 'markdown' emits a gap sheet.

D4 receipt: B = blocking fields, R = a blocking field changes the route or is one-way,
L = assumptions with confidence 'low'. CONTINUE when B <= 2 and no R and L <= 3, else BLOCKED.

Exit codes (lint): 0 CONTINUE · 1 schema error or bad input · 2 BLOCKED.

Error codes:
  BAD_ARG | UNKNOWN_FLAG | FILE_NOT_FOUND | BAD_JSON | WRITE_ERROR | BAD_QUESTIONS (questions)
`;

export const briefCommand = {
  name: CMD,
  summary: "Intake contract: lint a design brief, emit its blocking questions and the D4 CONTINUE|BLOCKED receipt",
  hasSubcommands: true,
  help: BRIEF_HELP,
  run(parsed: ParsedArgs): CommandResult {
    switch (parsed.subcommand) {
      case "lint": return runBriefLint(parsed);
      case "questions": return runBriefQuestions(parsed);
      case undefined: {
        const msg = "ui brief requires a subcommand (lint, questions). Run 'ui brief --help'.";
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
      default: {
        const msg = `unknown subcommand '${parsed.subcommand}'. Run 'ui brief --help'.`;
        return parsed.json ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
      }
    }
  },
};
