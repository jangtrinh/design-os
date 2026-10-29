let dockState = { open: false, busy: false, activeHarnessId: "auto", harnesses: [], recentRuns: [], telemetry: null };

const AFFINITIES = [
  { name: "Ổi", role: "Research", img: "/fruits-3d/guava.png", cli: "Claude Code" },
  { name: "Măng Cụt", role: "Consulting", img: "/fruits-3d/mangosteen.png", cli: "Antigravity" },
  { name: "Sầu Riêng", role: "Recruiting", img: "/fruits-3d/durian.png", cli: "xAI Grok" },
  { name: "Thanh Long", role: "Executive", img: "/fruits-3d/dragon-fruit.png", cli: "Claude Code" },
  { name: "Bưởi", role: "Engineering", img: "/fruits-3d/melon.png", cli: "OpenAI Codex" },
  { name: "Vú Sữa", role: "Operations", img: "/fruits-3d/peach.png", cli: "Antigravity" },
  { name: "Xoài", role: "Sales", img: "/fruits-3d/mango.png", cli: "Claude Code" },
  { name: "Chôm Chôm", role: "Marketing", img: "/fruits-3d/raspberry.png", cli: "xAI Grok" },
  { name: "Vải", role: "Support", img: "/fruits-3d/lychee.png", cli: "Orca" }
];

const CLEAN_LABELS = {
  auto: "Auto",
  claude: "Claude Code",
  agy: "Antigravity",
  codex: "OpenAI Codex",
  grok: "xAI Grok",
  orca: "Orca",
  local: "Local"
};

function injectDockStyles() {
  if (typeof document === "undefined" || document.getElementById("oi-cli-dock-styles")) return;
  const style = document.createElement("style");
  style.id = "oi-cli-dock-styles";
  style.textContent = `
    .oi-sidebar-cli-link { display: flex; align-items: center; justify-content: space-between; width: 100%; height: 32px; padding: 0 8px; margin-top: 2px; border-radius: 8px; font-family: inherit; font-size: 13.5px; color: oklch(var(--foreground) / 0.8); text-decoration: none; cursor: pointer; transition: background 0.12s ease, color 0.12s ease; }
    .oi-sidebar-cli-link:hover { background: var(--theme-surface-hover, rgba(0,0,0,0.04)); color: oklch(var(--foreground)); }
    .oi-sidebar-cli-left { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
    [data-testid="ai-provider-settings"] > div:not(#oi-cli-settings-host):not(:first-child) { display: none !important; }
    .oi-opt-group { margin-top: 24px; }
    .oi-opt-group + .oi-opt-group { margin-top: 40px; }
    .oi-opt-heading { font-size: 14px; font-weight: 600; color: oklch(var(--foreground)); margin: 0 0 12px 0; }
    .oi-opt-card { background: oklch(var(--background)); border: 1px solid oklch(var(--border)); border-radius: 16px; overflow: hidden; }
    .oi-opt-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-bottom: 1px solid oklch(var(--border) / 0.6); }
    .oi-opt-row:last-child { border-bottom: none; }
    .oi-opt-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .oi-opt-left img { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
    .oi-opt-title { font-size: 14px; font-weight: 500; color: oklch(var(--foreground)); line-height: 1.35; }
    .oi-opt-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: oklch(var(--muted-foreground)); margin-top: 2px; }
    .oi-opt-dot { width: 6px; height: 6px; border-radius: 9999px; background: #10b981; flex-shrink: 0; }
    .oi-opt-dot.muted { background: oklch(var(--muted-foreground) / 0.4); }
    .oi-opt-btn { height: 32px; padding: 0 14px; border-radius: 9999px; font-family: inherit; font-size: 12px; font-weight: 500; border: 1px solid oklch(var(--border)); background: oklch(var(--background)); color: oklch(var(--foreground)); cursor: pointer; transition: background 0.15s ease; white-space: nowrap; }
    .oi-opt-btn:hover { background: oklch(var(--muted) / 0.6); }
    .oi-opt-active-lbl { font-size: 12px; color: oklch(var(--muted-foreground)); padding: 0 6px; }
  `;
  document.head.appendChild(style);
}

const escapeHtml = (str) => String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function updateCliDockState(cliStatus) {
  if (!cliStatus) return;
  Object.assign(dockState, {
    activeHarnessId: cliStatus.activeHarnessId || dockState.activeHarnessId,
    harnesses: cliStatus.harnesses || dockState.harnesses,
    recentRuns: cliStatus.recentRuns || dockState.recentRuns,
    telemetry: cliStatus.telemetry || dockState.telemetry
  });
  if (typeof window !== "undefined" && window.__berryBridge) window.__berryBridge.selectedHarnessId = dockState.activeHarnessId;
  renderCliDock(true);
}

async function selectHarness(harnessId) {
  dockState.activeHarnessId = harnessId;
  if (window.__berryBridge) window.__berryBridge.selectedHarnessId = harnessId;
  renderCliDock(true);
  try {
    const res = await fetch("/api/cli/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ harnessId }) });
    if (res.ok) updateCliDockState(await res.json());
  } catch {}
}

function buildSettingsPanelHtml() {
  const rows = (dockState.harnesses || []).filter((h) => h.id !== "local");
  return `<div data-testid="oi-cli-panel">
    <section class="oi-opt-group">
      <div class="oi-opt-card" data-slot="options-group-card">
        ${rows.map((h) => {
          const isSel = h.id === dockState.activeHarnessId;
          const isReady = h.installed || h.id === "auto";
          const name = CLEAN_LABELS[h.id] || h.label;
          const statusText = isSel ? "In use" : (isReady ? "Connected" : "Not installed");
          return `<div class="oi-opt-row" data-slot="option-item">
            <div>
              <div class="oi-opt-title">${escapeHtml(name)}</div>
              <div class="oi-opt-status"><span class="oi-opt-dot ${isSel || isReady ? "" : "muted"}"></span><span>${statusText}</span></div>
            </div>
            <div>
              ${isSel ? `<span class="oi-opt-active-lbl">In use</span>` : `<button class="oi-opt-btn" data-harness="${h.id}">Select</button>`}
            </div>
          </div>`;
        }).join("")}
      </div>
    </section>
    <section class="oi-opt-group">
      <h2 class="oi-opt-heading" data-slot="options-group-title">Companion routing</h2>
      <div class="oi-opt-card" data-slot="options-group-card">
        ${AFFINITIES.map((a) => `<div class="oi-opt-row" data-slot="option-item">
          <div class="oi-opt-left">
            <img src="${a.img}" alt="${a.name}" />
            <div>
              <div class="oi-opt-title">${a.name}</div>
              <div class="oi-opt-status"><span>${a.role}</span></div>
            </div>
          </div>
          <span class="oi-opt-active-lbl">${a.cli}</span>
        </div>`).join("")}
      </div>
    </section>
  </div>`;
}

export function renderCliDock(force = false) {
  if (typeof document === "undefined") return;
  injectDockStyles();

  const libBtn = Array.from(document.querySelectorAll(".home-sidebar-layout button, .home-sidebar-layout a")).find((el) => el.textContent?.trim() === "Library");
  const libRow = libBtn?.closest("li, div") || libBtn;
  if (libRow && libRow.parentElement) {
    let navItem = document.getElementById("oi-sidebar-cli-settings-link");
    if (!navItem || force) {
      if (!navItem) {
        navItem = Object.assign(document.createElement("a"), { id: "oi-sidebar-cli-settings-link", className: "oi-sidebar-cli-link", href: "/settings/ai-provider" });
        navItem.setAttribute("data-testid", "oi-cli-toggle");
        libRow.insertAdjacentElement("afterend", navItem);
      }
      navItem.innerHTML = `<span class="oi-sidebar-cli-left"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg><span>CLI Core</span></span>`;
    }
  }

  const aiProviderHost = document.querySelector('[data-testid="ai-provider-settings"]');
  if (aiProviderHost) {
    let container = document.getElementById("oi-cli-settings-host");
    if (!container || force) {
      if (!container) {
        container = Object.assign(document.createElement("div"), { id: "oi-cli-settings-host" });
        aiProviderHost.insertBefore(container, aiProviderHost.children[1] || null);
      }
      container.innerHTML = buildSettingsPanelHtml();
      container.querySelectorAll("[data-harness]").forEach((b) => b.addEventListener("click", () => selectHarness(b.getAttribute("data-harness"))));
    }
  }
}

export async function mountCliTerminalDock() {
  if (typeof window === "undefined") return;
  renderCliDock(true);
  new MutationObserver(() => renderCliDock(false)).observe(document.body, { childList: true, subtree: true });
  try {
    const res = await fetch("/api/cli/status");
    if (res.ok) updateCliDockState(await res.json());
  } catch {}
}
