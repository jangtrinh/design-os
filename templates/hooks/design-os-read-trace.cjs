#!/usr/bin/env node
// design-os-read-trace — Claude Code hook (PreToolUse + PostToolUse). Appends one JSON line per
// relevant tool call to <project>/.design-os/trace/reads.jsonl; `ui trace summarize <project>`
// turns that file into numbers. Records paths, byte counts and event kinds ONLY — never file
// contents or prompts, and never touches `.env*` files. Append-only, silent, exits 0 on every
// path: a tracing hook must never block or slow the session it observes. One self-contained file
// on purpose: it is copied to a host and registered by path, so it cannot import siblings.
//
// Register (both events; PostToolUse is what records mutations):
//   "PreToolUse":  [{ "matcher": "Read|Glob|Grep|Bash|Skill", "hooks": [{ "type": "command",
//                     "command": "node <path>/design-os-read-trace.cjs" }] }],
//   "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash", "hooks": [{ "type": "command",
//                     "command": "node <path>/design-os-read-trace.cjs" }] }]
//
// Records:
//   read    {t, kind:"read", tool, path, bytes, session}   Read/Glob/Grep/`cat`-style Bash under a traced
//                                                          prefix, or an es-designer skill file
//   mutate  {t, kind:"mutate", tool, path, session}        a write INSIDE the project tree, outside
//                                                          .design-os/ and node_modules/ (Write/Edit/..., or
//                                                          Bash: redirect, tee, rm/mv/cp/touch/mkdir/..., sed -i)
//   skill   {t, kind:"skill", name, session}               the Skill tool
//   gate    {t, kind:"gate", command, session}             `ui gate` / `slop-detect`, directly or inside the
//                                                          script that `npm run` / `node <file>` / `bash <file>` runs
//
// Traced read prefixes: knowledge/, templates/, README.md, design/, brand/, .specify/, docs/ — plus any
// comma-separated paths in DESIGN_OS_TRACE_PREFIXES. Not mutations: writes to /dev/null, $TMPDIR or any path
// outside the project, `.design-os/` trace dirs, `npm install`, `git status`. Not detectable: a write made by
// a script's own code (`node build.mjs` writing files) — only its command line is visible here.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PREFIXES = ['knowledge/', 'templates/', 'README.md', 'design/', 'brand/', '.specify/', 'docs/'];
const MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const GATE_RE = /(^|[\s;&|/])(ui\s+gate|slop-detect)(\s|$)/;
const SCRIPT_GATE_RE = /\bui\b['"\s,[\]]{1,6}gate\b|slop-detect/;
const READ_CMDS = new Set(['cat', 'head', 'tail', 'less', 'more', 'bat']);
const RUNNERS = new Set(['node', 'bash', 'sh', 'zsh', 'python', 'python3', 'tsx', 'bun', 'deno', 'ts-node']);
const PKG_RUNNERS = new Set(['npm', 'pnpm', 'yarn']);
const SKIP_WORDS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec']);
const ALL_ARGS = new Set(['rm', 'mv', 'touch', 'mkdir', 'rmdir', 'unlink', 'patch', 'tee']);
const LAST_ARG = new Set(['cp', 'ln', 'install']);
const SKIP_FIRST = new Set(['chmod', 'chown']);
const MAX_SCRIPT_BYTES = 200 * 1024;

function prefixes() {
  const extra = (process.env.DESIGN_OS_TRACE_PREFIXES || '').split(',').map((p) => p.trim()).filter(Boolean);
  return DEFAULT_PREFIXES.concat(extra);
}

function tracked(rel, list) {
  if (path.basename(rel).startsWith('.env')) return false;
  if (rel.includes('/es-designer/')) return true;
  return list.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p.endsWith('/') ? p : p + '/'));
}

function relativize(root, target) {
  const abs = path.isAbsolute(target) ? target : path.join(root, target);
  const rel = path.relative(root, abs);
  return { abs, rel: (rel.startsWith('..') ? abs : rel).split(path.sep).join('/') };
}

function sizeOf(abs) {
  try { const st = fs.statSync(abs); return st.isFile() ? st.size : 0; } catch { return 0; }
}

// `~`, `$HOME`, `${TMPDIR}` … expanded from the environment; null when a variable or substitution
// cannot be resolved (never guess where an unresolved path points).
function expand(raw, cwd) {
  if (/\$\(|`/.test(raw)) return null;
  let p = raw === '~' || raw.startsWith('~/') ? os.homedir() + raw.slice(1) : raw;
  let unresolved = false;
  p = p.replace(/\$\{?(\w+)\}?/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) unresolved = true;
    return v === undefined ? '' : v;
  });
  return unresolved || p === '' ? null : path.resolve(cwd, p);
}

// The project-relative path of a write that counts as a mutation, or null.
function mutationTarget(raw, root, cwd) {
  const abs = expand(raw, cwd);
  if (abs === null) return null;
  const rel = path.relative(root, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts[0] === '.design-os' || parts.includes('node_modules')) return null;
  return parts.join('/');
}

// Drop heredoc bodies — their text is data, not commands.
function stripHeredocs(cmd) {
  const out = [];
  let end = null;
  for (const line of cmd.split('\n')) {
    if (end !== null) { if (line.trim() === end) end = null; continue; }
    out.push(line);
    const m = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line);
    if (m) end = m[2];
  }
  return out.join('\n');
}

// Minimal shell scanner: words (quotes honoured) and operators. Enough to find redirect targets and
// per-command arguments; anything it cannot parse simply yields no target.
function tokenize(s) {
  const toks = [];
  const OP = /^(\d*)(&>>|&>|>>|>\||>&|>|<<<|<<|<|&&|\|\||;|\||&)/;
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { if (s[i] === '\n') toks.push({ op: ';' }); i++; continue; }
    const m = OP.exec(s.slice(i));
    if (m && (m[1] === '' || /^&?>/.test(m[2]))) { toks.push({ op: m[2] }); i += m[0].length; continue; }
    let word = '';
    while (i < s.length && !/[\s;&|<>]/.test(s[i])) {
      const c = s[i];
      if (c === '"' || c === "'") {
        const close = s.indexOf(c, i + 1);
        const stop = close === -1 ? s.length : close;
        word += s.slice(i + 1, stop);
        i = stop + 1;
      } else if (c === '\\' && i + 1 < s.length) { word += s[i + 1]; i += 2; } else { word += c; i++; }
    }
    toks.push({ word });
  }
  return toks;
}

// Split the token stream into simple commands: { argv, redirects: [target words] }.
function commands(cmd) {
  const out = [];
  let cur = { argv: [], redirects: [] };
  const flush = () => { if (cur.argv.length || cur.redirects.length) out.push(cur); cur = { argv: [], redirects: [] }; };
  const toks = tokenize(stripHeredocs(cmd));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.word !== undefined) { cur.argv.push(t.word); continue; }
    if (/^(<|<<|<<<)$/.test(t.op)) { i++; continue; } // input redirect / heredoc delimiter: not a write
    if (/>/.test(t.op)) {
      const next = toks[i + 1];
      if (next && next.word !== undefined) {
        i++;
        if (!(t.op === '>&' && /^(\d+|-)$/.test(next.word))) cur.redirects.push(next.word);
      }
      continue;
    }
    flush();
  }
  flush();
  return out;
}

function writeTargets(argv) {
  let i = 0;
  while (i < argv.length && (SKIP_WORDS.has(argv[i]) || /^\w+=/.test(argv[i]))) i++;
  const name = path.basename(argv[i] || '');
  const args = argv.slice(i + 1).filter((a) => !a.startsWith('-'));
  if (ALL_ARGS.has(name)) return args;
  if (LAST_ARG.has(name)) return args.slice(-1);
  if (SKIP_FIRST.has(name)) return args.slice(1);
  if ((name === 'sed' || name === 'perl') && argv.some((a) => /^-[a-zA-Z]*i|^--in-place/.test(a))) return args.slice(-1);
  if (name === 'dd') return argv.filter((a) => a.startsWith('of=')).map((a) => a.slice(3));
  return [];
}

function bashMutation(cmd, root, cwd) {
  for (const c of commands(cmd)) {
    if (path.basename(c.argv[0] || '') === 'cd' && c.argv[1]) { cwd = expand(c.argv[1], cwd) || cwd; continue; }
    for (const target of c.redirects.concat(writeTargets(c.argv))) {
      const rel = mutationTarget(target, root, cwd);
      if (rel !== null) return rel;
    }
  }
  return null;
}

// The command that ran a gate: a direct `ui gate` / `slop-detect`, or a wrapper (package script or
// script file) whose text runs one. Returns the matching command segment, or null.
function gateCommand(cmd, cwd) {
  const stripped = stripHeredocs(cmd);
  for (const raw of stripped.split(/&&|\|\||;|\n|\|/)) {
    const seg = raw.trim();
    if (GATE_RE.test(seg) || GATE_RE.test(' ' + seg)) return seg.slice(0, 160);
    const argv = tokenize(seg).map((t) => t.word).filter((w) => w !== undefined);
    if (argv.length && wrapperRunsGate(argv, cwd)) return seg.slice(0, 160);
  }
  return null;
}

function wrapperRunsGate(argv, cwd, depth = 0) {
  let i = 0;
  while (i < argv.length && (SKIP_WORDS.has(argv[i]) || /^\w+=/.test(argv[i]))) i++;
  const head = path.basename(argv[i] || '');
  const rest = argv.slice(i + 1).filter((a) => !a.startsWith('-'));
  let file = null;
  if (PKG_RUNNERS.has(head)) {
    const script = head === 'npm' && rest[0] === 'test' ? 'test' : rest[0] === 'run' || rest[0] === 'run-script' ? rest[1] : rest[0];
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      const body = pkg.scripts?.[script];
      if (typeof body !== 'string') return false;
      // one level of indirection: the script line may itself run a script file that runs the gate
      const inner = tokenize(body).map((t) => t.word).filter((w) => w !== undefined);
      return SCRIPT_GATE_RE.test(body) || (depth === 0 && inner.length > 0 && wrapperRunsGate(inner, cwd, 1));
    } catch { return false; }
  }
  if (RUNNERS.has(head) || head === 'npx') file = rest.find((a) => /\.\w+$/.test(a));
  else if (argv[i].includes('/')) file = argv[i];
  if (!file) return false;
  const abs = path.resolve(cwd, file);
  if (sizeOf(abs) === 0 || sizeOf(abs) > MAX_SCRIPT_BYTES) return false;
  try { return SCRIPT_GATE_RE.test(fs.readFileSync(abs, 'utf8')); } catch { return false; }
}

function decide(input, root) {
  const tool = input.tool_name;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' ? input.cwd : root;
  const list = prefixes();
  const out = [];
  if (input.hook_event_name === 'PostToolUse') {
    if (MUTATING_TOOLS.has(tool)) {
      const target = ti.file_path || ti.notebook_path;
      if (typeof target !== 'string') out.push({ kind: 'mutate', tool });
      else { const rel = mutationTarget(target, root, cwd); if (rel !== null) out.push({ kind: 'mutate', tool, path: rel }); }
    } else if (tool === 'Bash' && typeof ti.command === 'string') {
      const rel = bashMutation(ti.command, root, cwd);
      if (rel !== null) out.push({ kind: 'mutate', tool, path: rel });
    }
    return out;
  }
  if (tool === 'Skill') {
    const name = ti.skill || ti.name;
    if (typeof name === 'string') out.push({ kind: 'skill', name });
  } else if (tool === 'Read' && typeof ti.file_path === 'string') {
    const { abs, rel } = relativize(root, ti.file_path);
    if (tracked(rel, list)) out.push({ kind: 'read', tool, path: rel, bytes: sizeOf(abs) });
  } else if ((tool === 'Glob' || tool === 'Grep') && typeof ti.path === 'string') {
    const { rel } = relativize(root, ti.path);
    if (tracked(rel.endsWith('/') ? rel : rel + '/', list) || tracked(rel, list)) out.push({ kind: 'read', tool, path: rel, bytes: 0 });
  } else if (tool === 'Bash' && typeof ti.command === 'string') {
    const gate = gateCommand(ti.command, cwd);
    if (gate !== null) out.push({ kind: 'gate', command: gate });
    else {
      for (const c of commands(ti.command)) {
        const name = path.basename(c.argv[0] || '');
        if (!READ_CMDS.has(name) && !(name === 'sed' && c.argv[1] === '-n')) continue;
        for (const token of c.argv.slice(1)) {
          if (token.startsWith('-')) continue;
          const abs = expand(token, cwd);
          if (abs === null) continue;
          const { rel } = relativize(root, abs);
          if (tracked(rel, list) && sizeOf(abs) > 0) out.push({ kind: 'read', tool, path: rel, bytes: sizeOf(abs) });
        }
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
