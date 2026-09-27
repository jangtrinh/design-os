import type { ParsedArgs } from "../core/cli-args.js";
import { errJson, errText } from "../core/output.js";
import { runTemplatesCatalogue, runTemplatesLint } from "./templates-catalogue.js";

export const templatesCommand = {
  name: "templates",
  summary: "Emit and lint the template description catalogue",
  hasSubcommands: true,
  help: `ui templates — template discovery description catalogue

Usage:
  ui templates catalogue [--out <file>] [--check] [--json]
  ui templates lint [<catalogue.json>] [--json]

catalogue reads each registered template's frontmatter description and writes
schemas/template-descriptions.json (default --out). It is the only code that
parses template frontmatter; the kernel reads the JSON at runtime.
--check writes nothing: exit 1 when the file breaks its schema or has drifted
from the templates. lint validates shape, order, uniqueness and registry coverage.

Errors: BAD_ARG | UNKNOWN_FLAG | SCHEMA_UNAVAILABLE | TEMPLATE_UNREADABLE | BAD_JSON`,
  run(parsed: ParsedArgs) {
    if (parsed.subcommand === "catalogue") return runTemplatesCatalogue(parsed);
    if (parsed.subcommand === "lint") return runTemplatesLint(parsed);
    const message = "expected 'ui templates catalogue' or 'ui templates lint'";
    return parsed.json ? errJson("templates", "BAD_ARG", message) : errText(`ui: ${message}\n`);
  },
};
