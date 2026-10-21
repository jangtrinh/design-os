# Attribution and provenance

This skill was written from the public `knowledge/` files of this repository and the public `ui`
command surface. It is not a copy or a derivative of any other skill. Examples are synthetic.

| Source | Use here | Licence / treatment |
| --- | --- | --- |
| This repository's `knowledge/` (`build-loop.md`, `taste-rubric.md`, `design-tells.md`, `content-design.md`, `page-structures.md`, `generation-craft-defaults.md`) | The procedure, rules and look items are written from these files | PolyForm Shield 1.0.0, same licence as this repository |
| This repository's `ui` command signatures (`src/core/command-signatures.ts`) | Source of the generated [contract.md](contract.md) | PolyForm Shield 1.0.0 |
| [Hairline](https://github.com/lucasmarkes/hairline), `skills/hairline-create/` | Tool-product skill pattern: small router, judgment in Markdown, mechanical validation, visual check | MIT, Copyright (c) 2026 Lucas Marques; pattern adapted, no text or code copied; notice below |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Target-size floor (2.5.8) and the accessibility vocabulary the `ui` linters cite | W3C document used as reference; no text copied |
| Voice and tone, error-message and i18n guidance cited by `content-design.md` (Mailchimp, Shopify Polaris, Atlassian, Salesforce Lightning, GOV.UK, Nielsen Norman Group, ICU MessageFormat) | Referenced only through `content-design.md` | Names and ideas referenced; no prose copied |
| [Playwright](https://github.com/microsoft/playwright) | Optional browser automation used by `look.mjs` | Apache-2.0; provisioned by the user, never bundled or installed by this skill |

## Host mechanisms behind "Roles on your runtime"

Each row of the table in [SKILL.md](SKILL.md) was checked against the host's own documentation on
2026-10-21. These are interface references only; no text was copied. Re-check after a major host update.

| Host | Official page | What was verified |
| --- | --- | --- |
| Claude Code | [Subagents](https://code.claude.com/docs/en/sub-agents) | A subagent runs in its own context window without the conversation history; it is invoked by name or `@` mention or by automatic delegation; `tools` restricts it to read tools |
| Codex | [Subagents](https://developers.openai.com/codex/subagents) (redirects to [learn.chatgpt.com](https://learn.chatgpt.com/docs/agent-configuration/subagents)) | Subagents run in their own agent thread and are spawned when the user asks or when `AGENTS.md` or a skill instructs it; built-in `worker` and `explorer` roles; they inherit the parent's sandbox, so read-only is by instruction |
| Gemini CLI | [Subagents](https://geminicli.com/docs/core/subagents/) | Subagents have independent history and are invoked by automatic delegation or `@name`; custom ones live in `.gemini/agents/`; `codebase_investigator` is built in and read-oriented |
| Antigravity | [Subagents](https://antigravity.google/docs/subagents) | The parent invokes a subagent into a concurrent session that does not inherit conversation history; `tools` is an explicit allowlist |
| Any other host | none | Not verified: the skill says to use a fresh session of that runtime |

A clean validate or look run is evidence about facts that scripts can measure. It is not a claim of
accessibility conformance, brand fit or design quality.

## Hairline permission notice

MIT License

Copyright (c) 2026 Lucas Marques

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
