// contract-render.mjs — renders contract.md from the JSON of `ui schema --json`. One implementation, two
// callers: the repo script scripts/designer-skill-contract.mjs (writes and checks the shipped file) and
// validate.mjs (re-renders from the `ui` actually installed and compares). Pure, offline, deterministic.
import { createHash } from "node:crypto";

/** The commands the skill tells the agent to run, in reading order. `name:sub` selects a subcommand. */
export const CONTRACT_COMMANDS = [
  "gate", "validate-layout", "a11y-lint", "taste-lint", "tell-lint", "content-lint", "autofix", "token-coverage",
  "ds:context", "registry:list", "registry:lookup", "memory:context",
];

function signatureOf(schema, ref) {
  const [name, sub] = ref.split(":");
  const command = schema.data?.commands?.[name];
  const signature = sub ? command?.subcommands?.[sub] : command?.signature;
  if (!signature) throw new Error(`ui schema has no command '${ref.replace(":", " ")}'`);
  return signature;
}

/** Deterministic Markdown body (no header) for the given schema JSON. */
export function renderContractBody(schema) {
  const out = [
    "# Generated command contract",
    "",
    "Generated from `src/core/command-signatures.ts` through `ui schema --json`. Do not edit: validate.mjs",
    "re-renders this file from the installed `ui` and refuses an edited or stale copy. Flags not listed here do not exist.",
    "",
  ];
  for (const ref of CONTRACT_COMMANDS) {
    const sig = signatureOf(schema, ref);
    const positionals = sig.positionals.map((p) => (p.required ? p.name : `[${p.name}]`)).join(" ");
    out.push(`## ui ${ref.replace(":", " ")}`, "", sig.summary, "", `Usage: \`ui ${ref.replace(":", " ")}${positionals ? " " + positionals : ""}${sig.flags.length ? " [flags]" : ""}\``, "");
    if (sig.flags.length > 0) {
      out.push("| Flag | Type | Meaning |", "| --- | --- | --- |");
      for (const f of sig.flags) {
        const kind = f.values ? f.values.join("\\|") : f.type;
        out.push(`| \`--${f.name}\`${f.required ? " (required)" : ""} | ${kind} | ${f.summary.replace(/\|/g, "\\|")} |`);
      }
      out.push("");
    }
    out.push(`Error codes: ${sig.errorCodes.map((c) => `\`${c}\``).join(", ") || "none"}`, "");
  }
  return out.join("\n");
}

/** The whole file: `<!-- sha256: <hex of every byte after this line> -->` then the body. */
export function renderContract(schema) {
  const body = renderContractBody(schema);
  return `<!-- sha256: ${createHash("sha256").update(body).digest("hex")} -->\n${body}`;
}

/** Normalise a contract read from disk: LF line endings and no UTF-8 BOM. */
export const normalizeContractText = (text) => text.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
