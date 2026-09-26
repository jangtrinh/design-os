#!/usr/bin/env node
// design-os-read-trace — Claude Code hook (PreToolUse + PostToolUse). Appends one JSON line per
// relevant tool call to <project>/.design-os/trace/reads.jsonl; `ui trace summarize <project>`
// turns that file into numbers. Records paths, byte counts and event kinds ONLY — never file
// contents, prompts or command text — and never touches `.env*` files. Append-only, silent,
// exits 0 on every path: a tracing hook must never block or slow the session it observes.
//
// Register (both events; PostToolUse is what records mutations):
//   "PreToolUse":  [{ "matcher": "Read|Glob|Grep|Bash|Skill", "hooks": [{ "type": "command",
//                     "command": "node <path>/design-os-read-trace.cjs" }] }],
//   "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash", "hooks": [{ "type": "command",
//                     "command": "node <path>/design-os-read-trace.cjs" }] }]
//
// Records:
//   read    {t, kind:"read", tool, path, bytes, session}   Read/Glob/Grep/`cat`-style Bash under
//                                                          knowledge/, templates/, design/, README.md,
//                                                          or an es-designer skill file
//   mutate  {t, kind:"mutate", tool, session}              Write/Edit/... or a mutating Bash command
//   skill   {t, kind:"skill", name, session}               the Skill tool
//   gate    {t, kind:"gate", session}                      `ui gate` / `slop-detect` in Bash
const fs = require('fs');
const path = require('path');

const TRACKED_PREFIXES = ['knowledge/', 'templates/', 'design/'];
const MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const GATE_RE = /(^|[\s;&|/])(ui\s+gate|slop-detect)(\s|$)/;
const MUTATING_BASH_RE = new RegExp(
  '(^|[\\s;&|(])(rm|mv|cp|mkdir|touch|tee|chmod|patch|truncate|ln|' +
  'npm\\s+(i|install|uninstall|update)|git\\s+(add|commit|checkout|reset|apply|stash|rm|mv|merge|rebase|restore))(\\s|$)' +
  '|sed\\s+(-[a-zA-Z]*i|--in-place)|(^|[^0-9&>])>{1,2}\\s*[^&\\s]'
);
// A redirect into /dev/null discards output and changes nothing on disk; drop it before matching.
const DEV_NULL_REDIRECT_RE = /(^|[^>])&?\d*>{1,2}\s*\/dev\/null(?=[\s;&|)]|$)/g;
const READ_BASH_RE = /(^|[\s;&|(])(cat|head|tail|less|more|bat|sed\s+-n)\s/;

function tracked(rel) {
  if (path.basename(rel).startsWith('.env')) return false;
  return rel === 'README.md' || TRACKED_PREFIXES.some((p) => rel.startsWith(p)) || rel.includes('/es-designer/');
}

function relativize(root, target) {
  const abs = path.isAbsolute(target) ? target : path.join(root, target);
  const rel = path.relative(root, abs);
  return { abs, rel: (rel.startsWith('..') ? abs : rel).split(path.sep).join('/') };
}

function sizeOf(abs) {
  try { const st = fs.statSync(abs); return st.isFile() ? st.size : 0; } catch { return 0; }
}

function decide(input, root) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const post = input.hook_event_name === 'PostToolUse';
  const out = [];
  if (post) {
    if (MUTATING_TOOLS.has(tool)) out.push({ kind: 'mutate', tool });
    else if (tool === 'Bash' && typeof ti.command === 'string' && !GATE_RE.test(ti.command) &&
             MUTATING_BASH_RE.test(ti.command.replace(DEV_NULL_REDIRECT_RE, '$1 '))) out.push({ kind: 'mutate', tool });
    return out;
  }
  if (tool === 'Skill') {
    const name = ti.skill || ti.name;
    if (typeof name === 'string') out.push({ kind: 'skill', name });
  } else if (tool === 'Read' && typeof ti.file_path === 'string') {
    const { abs, rel } = relativize(root, ti.file_path);
    if (tracked(rel)) out.push({ kind: 'read', tool, path: rel, bytes: sizeOf(abs) });
  } else if ((tool === 'Glob' || tool === 'Grep') && typeof ti.path === 'string') {
    const { rel } = relativize(root, ti.path);
    if (tracked(rel.endsWith('/') ? rel : rel + '/') || tracked(rel)) out.push({ kind: 'read', tool, path: rel, bytes: 0 });
  } else if (tool === 'Bash' && typeof ti.command === 'string') {
    if (GATE_RE.test(ti.command)) {
      out.push({ kind: 'gate' });
    } else if (READ_BASH_RE.test(ti.command)) {
      for (const token of ti.command.split(/\s+/)) {
        if (!token || token.startsWith('-') || /^[|;&<>]/.test(token)) continue;
        const { abs, rel } = relativize(root, token.replace(/^["']|["']$/g, ''));
        if (tracked(rel) && sizeOf(abs) > 0) out.push({ kind: 'read', tool, path: rel, bytes: sizeOf(abs) });
      }
    }
  }
  return out;
}

function main() {
  let input;
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return; }
  if (!input || typeof input !== 'object') return;
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const records = decide(input, root);
  if (records.length === 0) return;
  const file = path.join(root, '.design-os', 'trace', 'reads.jsonl');
  const t = new Date().toISOString();
  const session = typeof input.session_id === 'string' ? input.session_id : undefined;
  const data = records.map((r) => JSON.stringify({ t, ...r, session })).join('\n') + '\n';
  try { fs.appendFileSync(file, data); }
  catch { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, data); }
}

try { main(); } catch { /* a tracing hook never blocks */ }
process.exit(0);
