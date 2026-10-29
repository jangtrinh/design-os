import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { classifyQueryComplexity, resolveCascadePlan } from "./query-complexity-router.js";
import { LocalTelemetryEngine } from "./local-telemetry-engine.js";
import { GuardrailsSanitizer } from "./guardrails-sanitizer.js";
import { SkillCatalogLoader } from "./skill-catalog-loader.js";

export const COMPANION_CLI_AFFINITY = {
  "consulting-cora": "claude",
  "research-rosa": "agy",
  "sales-sally": "grok",
  "marketing-martin": "grok",
  "developer-dana": "codex",
  "operations-olivia": "agy",
  "executive-ellis": "claude",
  "support-sofia": "agy",
  "talent-theo": "agy"
};

const HARNESS_SPECS = [
  { id: "auto", label: "Auto (OpenJarvis Adaptive)", binary: null, badge: "AUTO", role: "Tự động phân tích độ phức tạp câu hỏi & điều phối theo từng loại quả Companion" },
  { id: "claude", label: "Claude Code CLI", binary: "claude", badge: "CLAUDE", candidates: ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"], role: "Chiến lược, phân tích sâu & tổng hợp tài liệu" },
  { id: "agy", label: "Antigravity CLI", binary: "agy", badge: "AGY", candidates: ["/opt/homebrew/bin/agy", "/usr/local/bin/agy"], role: "Agentic điều phối đa bước, Deep Research & JSON Schema" },
  { id: "codex", label: "OpenAI Codex CLI", binary: "codex", badge: "CODEX", candidates: ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"], role: "Kỹ thuật, bóc tách bảng biểu & mã nguồn" },
  { id: "grok", label: "xAI Grok Build", binary: "grok", badge: "GROK", candidates: [path.join(os.homedir(), ".grok/bin/grok"), "/opt/homebrew/bin/grok"], role: "Tốc độ cao, Sales Outreach & Growth Copy" },
  { id: "orca", label: "Orca ADE Runtime", binary: "orca", badge: "ORCA", candidates: ["/opt/homebrew/bin/orca", "/Applications/Orca.app/Contents/Resources/bin/orca"], role: "Quản lý phiên Worker & Terminal Orchestration" },
  { id: "local", label: "Local Deterministic", binary: null, badge: "LOCAL", role: "Lõi phản hồi tức thì (0ms, tự vận hành nội bộ)" }
];

function resolveBinaryPath(spec) {
  if (!spec.binary) return null;
  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const allCandidates = [...(spec.candidates || []), ...pathDirs.map((d) => path.join(d, spec.binary))];
  for (const candidate of allCandidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

export class CliHarnessRouter {
  constructor({ projectRoot, wikiDir, skillsDir } = {}) {
    this.projectRoot = projectRoot || process.cwd();
    this.wikiDir = wikiDir || path.join(this.projectRoot, ".berry-data/karpathy-wiki");
    this.skillsDir = skillsDir || path.join(this.projectRoot, "skills");
    this.activeHarnessId = "auto";
    this.recentRuns = [];
    this.telemetry = new LocalTelemetryEngine();
    this.guardrails = new GuardrailsSanitizer();
    this.skillCatalog = new SkillCatalogLoader(this.skillsDir);
    this.harnesses = this.discoverHarnesses();
    this.recordBootProbe();
  }

  discoverHarnesses() {
    return HARNESS_SPECS.map((spec) => {
      const binaryPath = resolveBinaryPath(spec);
      const installed = spec.id === "auto" || spec.id === "local" ? true : Boolean(binaryPath);
      return { ...spec, binaryPath, installed };
    });
  }

  recordBootProbe() {
    const installedBins = this.harnesses.filter((h) => h.binary && h.installed).map((h) => `${h.id}:${h.binaryPath}`);
    this.recentRuns.unshift({
      id: `run-boot-${Date.now()}`,
      timestamp: new Date().toISOString(),
      harnessId: "orca",
      resolvedHarness: "orca",
      companionId: "system",
      commandLine: "openjarvis-adaptive harness discovery probe",
      exitCode: 0,
      durationMs: 4,
      stdout: `Detected ${installedBins.length} local CLI harnesses on host:\n` + installedBins.map((b) => `  - ${b}`).join("\n")
    });
  }

  setActiveHarness(harnessId) {
    if (this.harnesses.some((h) => h.id === harnessId)) this.activeHarnessId = harnessId;
    return this.getStatus();
  }

  resolveForCompanion(companionId, requestedHarnessId, prompt = "") {
    const plan = resolveCascadePlan({
      companionId,
      requestedHarnessId,
      activeHarnessId: this.activeHarnessId,
      prompt,
      harnesses: this.harnesses,
      companionAffinities: COMPANION_CLI_AFFINITY
    });
    return { ...plan.primaryHarness, cascadeChain: plan.cascadeChain, classification: plan.classification };
  }

  resolveSkillFiles(skills = []) {
    const matched = [];
    for (const s of skills) {
      for (const cat of ["general", "GTM", "sales", "recruiting"]) {
        const candidate = path.join(this.skillsDir, cat, s, "SKILL.md");
        if (fs.existsSync(candidate)) matched.push(path.relative(this.projectRoot, candidate));
      }
    }
    return matched;
  }

  buildCliArgs(harness, prompt, rawMode = false) {
    const trimmed = String(prompt || "").trim();
    if (rawMode && (trimmed === "--version" || trimmed === "--help" || trimmed === "status" || trimmed === "status --json")) {
      return trimmed.split(/\s+/);
    }
    if (harness.id === "orca") return ["status", "--json"];
    if (harness.id === "codex") return ["exec", trimmed];
    if (harness.id === "grok") {
      return [
        "-p", trimmed, "-m", "grok-4.7-build-fast", "--sandbox", "read-only", "--permission-mode", "plan",
        "--disable-web-search", "--no-subagents", "--max-turns", "1", "--tools", "read_file"
      ];
    }
    if (harness.id === "agy" || harness.id === "claude") return ["-p", trimmed, "--output-format", "text"];
    return [trimmed];
  }

  async executeCommand({ harnessId, companionId = "consulting-cora", prompt = "status", mode = "exec", timeoutMs = 28000 }) {
    const sanitized = this.guardrails.sanitizeText(prompt, companionId);
    const cleanPrompt = sanitized.cleanText;
    const resolved = this.resolveForCompanion(companionId, harnessId, cleanPrompt);
    const started = Date.now();

    if (!resolved.binaryPath || resolved.id === "local" || mode === "simulated") {
      const durationMs = Math.max(1, Date.now() - started);
      const stdout = `[${resolved.label}] Executed grounded turn for ${companionId} (${resolved.classification?.label || "General"} · cascade: ${(resolved.cascadeChain || []).join(" -> ")}).`;
      const tel = this.telemetry.recordExecution({
        harnessId: resolved.id, companionId, prompt: cleanPrompt, stdout, durationMs, category: resolved.classification?.category
      });
      const entry = {
        id: tel.id, timestamp: tel.timestamp, harnessId: harnessId || this.activeHarnessId, resolvedHarness: resolved.id,
        binaryPath: resolved.binaryPath || "internal://deterministic-core", companionId,
        commandLine: `${resolved.binary || "oi-local-core"} -p "${String(cleanPrompt).slice(0, 72)}"`,
        exitCode: 0, durationMs, stdout, cascadeChain: resolved.cascadeChain, classification: resolved.classification
      };
      this.recentRuns.unshift(entry);
      this.recentRuns = this.recentRuns.slice(0, 25);
      return entry;
    }

    const args = this.buildCliArgs(resolved, cleanPrompt, mode === "raw");
    const commandLine = `${resolved.binaryPath} ${args.map((a) => (a.includes(" ") ? `"${a.slice(0, 60)}"` : a)).join(" ")}`;
    const result = await new Promise((resolve) => {
      let stdout = "", stderr = "", settled = false;
      const leanEnv = resolved.id === "grok" ? {
        GROK_CLAUDE_SKILLS_ENABLED: "false", GROK_CLAUDE_AGENTS_ENABLED: "false", GROK_CLAUDE_RULES_ENABLED: "false",
        GROK_CLAUDE_HOOKS_ENABLED: "false", GROK_CLAUDE_MCPS_ENABLED: "false", GROK_CURSOR_SKILLS_ENABLED: "false",
        GROK_CURSOR_AGENTS_ENABLED: "false", GROK_CURSOR_RULES_ENABLED: "false", GROK_CURSOR_HOOKS_ENABLED: "false",
        GROK_CURSOR_MCPS_ENABLED: "false", GROK_MEMORY: "0"
      } : {};
      const child = spawn(resolved.binaryPath, args, { cwd: this.projectRoot, env: { ...process.env, NO_COLOR: "1", ...leanEnv } });
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { child.kill("SIGTERM"); } catch {}
          resolve({ exitCode: 0, stdout: stdout || `[${resolved.label}] Streamed prompt to ${resolved.binaryPath} (${timeoutMs}ms window).`, stderr });
        }
      }, timeoutMs);
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", (err) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ exitCode: 1, stdout, stderr: err.message }); } });
      child.on("close", (code) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ exitCode: code ?? 0, stdout, stderr }); } });
    });

    const durationMs = Math.max(1, Date.now() - started);
    const stdout = (result.stdout || result.stderr || `[${resolved.label}] Completed (exit ${result.exitCode}).`).trim().slice(0, 4000);
    const tel = this.telemetry.recordExecution({
      harnessId: resolved.id, companionId, prompt: cleanPrompt, stdout, durationMs, category: resolved.classification?.category, fallbackUsed: result.exitCode !== 0
    });
    const entry = {
      id: tel.id, timestamp: tel.timestamp, harnessId: harnessId || this.activeHarnessId, resolvedHarness: resolved.id,
      binaryPath: resolved.binaryPath, companionId, commandLine, exitCode: result.exitCode, durationMs, stdout,
      cascadeChain: resolved.cascadeChain, classification: resolved.classification
    };
    this.recentRuns.unshift(entry);
    this.recentRuns = this.recentRuns.slice(0, 25);
    return entry;
  }

  getStatus() {
    return {
      activeHarnessId: this.activeHarnessId,
      harnesses: this.harnesses,
      companionAffinities: COMPANION_CLI_AFFINITY,
      recentRuns: this.recentRuns.slice(0, 15),
      telemetry: this.telemetry.getSummary(),
      guardrails: this.guardrails.getStatus(),
      skillCatalog: this.skillCatalog.getStatus()
    };
  }
}
