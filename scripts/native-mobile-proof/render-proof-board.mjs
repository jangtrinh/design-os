import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const TIER_NAMES = [
  "Routing & admission",
  "Generated build & run",
  "Simulator visual & responsive",
  "Physical iPhone & VoiceOver",
  "Physical iPad & mixed input",
  "Owner acceptance",
];

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const manifestDigest = (manifest) => createHash("sha256").update(JSON.stringify(manifest)).digest("hex");

function evidenceList(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) return '<span class="empty">No evidence claimed</span>';
  return `<ul>${evidence.map((item) => {
    const path = escapeHtml(item.path);
    const image = item.path.toLowerCase().endsWith(".png")
      ? `<img src="${path}" alt="Visual witness for ${escapeHtml(item.path.split("/").at(-1))}" loading="lazy">`
      : "";
    return `<li><a href="${path}"><code>${escapeHtml(item.sha256.slice(0, 12))}</code> ${path}${image}</a></li>`;
  }).join("")}</ul>`;
}

function tier3Dispositions(tier) {
  if (tier.id !== 3) return "";
  const witnesses = tier.witnesses ?? {};
  const behavior = witnesses.behaviorDisposition;
  const visual = witnesses.visualDisposition;
  if (typeof behavior !== "string" || typeof visual !== "string") return "";
  const reason = typeof witnesses.visual?.reason === "string"
    ? `<p class="visual-reason">${escapeHtml(witnesses.visual.reason)}</p>`
    : "";
  return `<section class="tier3-dispositions" aria-label="Tier 3 dispositions">
    <p class="disposition" data-behavior-disposition="${escapeHtml(behavior)}">Behavior: ${escapeHtml(behavior)}</p>
    <p class="disposition" data-visual-disposition="${escapeHtml(visual)}">Visual: ${escapeHtml(visual)}</p>${reason ? `\n    ${reason}` : ""}
  </section>`;
}

function tier6Dispositions(tier) {
  if (tier.id !== 6 || !Array.isArray(tier.witnesses?.ownerScreenVerdicts)) return "";
  const verdicts = tier.witnesses.ownerScreenVerdicts.map((verdict) => `<li data-screen-id="${escapeHtml(verdict.screenId)}">
      <strong>${escapeHtml(verdict.screenId)}</strong> · ${escapeHtml(verdict.disposition)}
      <span>Light: ${escapeHtml(verdict.lightReviewBasis)} · Dark: ${escapeHtml(verdict.darkReviewBasis)}</span>
    </li>`).join("");
  return `<section class="tier6-dispositions" aria-label="Tier 6 owner screen verdicts"><ul>${verdicts}</ul></section>`;
}

function tierCell(arm, tierId) {
  const tier = arm.tiers.find((item) => item.id === tierId);
  if (!tier) return '<td data-tier="missing"><strong>FAIL</strong><p>Tier missing.</p></td>';
  const dispositions = `${tier3Dispositions(tier)}${tier6Dispositions(tier)}`;
  return `<td data-tier="${tier.id}" data-status="${escapeHtml(tier.status)}">
    <div class="status"><span aria-hidden="true"></span>${escapeHtml(tier.status)}</div>
    <p class="claim">${escapeHtml(tier.authorizedClaim)}</p>
    <p class="environment">${escapeHtml(tier.environment)}</p>${dispositions ? `\n${dispositions}` : ""}
    ${evidenceList(tier.evidence)}
  </td>`;
}

export function renderNativeMobileProofBoard(manifest) {
  const digest = manifestDigest(manifest);
  const ios = manifest.arms.find((arm) => arm.capabilityId === "native-ios");
  const ipad = manifest.arms.find((arm) => arm.capabilityId === "native-ipados");
  const rows = TIER_NAMES.map((name, index) => `<tr>
    <th scope="row"><span>${index + 1}</span>${escapeHtml(name)}</th>
    ${tierCell(ios, index + 1)}
    ${tierCell(ipad, index + 1)}
  </tr>`).join("");
  const failures = manifest.knownFailures.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
<html lang="en" data-manifest-sha256="${digest}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DESIGN:OS native mobile proof</title>
<style>
:root{color-scheme:dark;--ink:#f2efe8;--muted:#aaa59a;--line:#3b3935;--panel:#181817;--pass:#8ed7aa;--fail:#ff8d7f;--pending:#e6bd69;--idle:#99948b}*{box-sizing:border-box}body{margin:0;background:#0d0d0c;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}main{width:min(1460px,calc(100% - 32px));margin:auto;padding:52px 0 80px}header{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:48px;border-top:1px solid var(--ink);padding-top:18px;margin-bottom:44px}.eyebrow,.stamp{font:600 11px/1.4 ui-monospace,SFMono-Regular,monospace;letter-spacing:.11em;text-transform:uppercase;color:var(--muted)}h1{font:500 clamp(42px,7vw,94px)/.92 Georgia,serif;letter-spacing:-.055em;margin:18px 0 24px;max-width:10ch}.boundary{font:650 12px/1.4 ui-monospace,SFMono-Regular,monospace;color:var(--pending);border-left:3px solid var(--pending);padding-left:12px}.intro{color:var(--muted);font-size:16px;line-height:1.6;max-width:56ch}.meta{align-self:end;border-top:1px solid var(--line);padding-top:16px}.meta dl{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin:0;font-size:13px}.meta dt{color:var(--muted)}.meta dd{margin:0;font-family:ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.known{border:1px solid var(--fail);padding:16px 18px;margin:0 0 24px}.known h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--fail);margin:0 0 8px}.known ul{margin:0;padding-left:18px;color:#f4c1ba}table{width:100%;border-collapse:collapse;table-layout:fixed}caption{text-align:left;padding:0 0 12px;color:var(--muted);font-size:13px}thead th{font:600 12px/1.4 ui-monospace,SFMono-Regular,monospace;text-transform:uppercase;letter-spacing:.08em;text-align:left;border-bottom:1px solid var(--ink);padding:14px 16px}thead th:first-child{width:19%}thead small{display:block;color:var(--muted);text-transform:none;letter-spacing:0;margin-top:4px}tbody th,tbody td{vertical-align:top;text-align:left;border-bottom:1px solid var(--line);padding:20px 16px}tbody th{font-size:14px;font-weight:600}tbody th span{display:block;color:var(--muted);font:11px ui-monospace,SFMono-Regular,monospace;margin-bottom:8px}.status{font:700 12px ui-monospace,SFMono-Regular,monospace;letter-spacing:.06em}.status span{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--idle);margin-right:8px}[data-status="PASS"] .status{color:var(--pass)}[data-status="PASS"] .status span{background:var(--pass)}[data-status="FAIL"] .status{color:var(--fail)}[data-status="FAIL"] .status span{background:var(--fail)}[data-status="PENDING"] .status{color:var(--pending)}[data-status="PENDING"] .status span{background:var(--pending)}.claim{font-size:14px;line-height:1.5;margin:12px 0 8px}.environment,.empty,.visual-reason{font-size:12px;line-height:1.5;color:var(--muted)}.tier3-dispositions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px;border-left:2px solid var(--pending);margin:12px 0;padding-left:10px}.disposition{font:700 11px/1.4 ui-monospace,SFMono-Regular,monospace;margin:0}.visual-reason{grid-column:1/-1;margin:2px 0 0}td ul{list-style:none;padding:0;margin:12px 0 0;font-size:11px;line-height:1.55}td img{display:block;width:100%;max-height:380px;object-fit:contain;background:var(--panel);margin-top:8px;border:1px solid var(--line)}a{color:inherit;text-underline-offset:3px}footer{display:flex;justify-content:space-between;gap:24px;margin-top:28px;color:var(--muted);font:11px/1.5 ui-monospace,SFMono-Regular,monospace}@media(max-width:860px){header{grid-template-columns:1fr}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;clip:rect(0 0 0 0)}tbody tr{border-top:1px solid var(--ink);padding:18px 0}tbody th,tbody td{border:0;padding:10px 4px}tbody td:before{content:attr(data-status) " · " attr(data-tier);font:10px ui-monospace,SFMono-Regular,monospace;color:var(--muted)}footer{display:block}}
.tier6-dispositions{border-left:2px solid var(--pass);margin:12px 0;padding-left:10px}.tier6-dispositions ul{margin:0}.tier6-dispositions li{margin:0 0 8px}.tier6-dispositions strong,.tier6-dispositions span{display:block}.tier6-dispositions strong{font:700 11px/1.4 ui-monospace,SFMono-Regular,monospace}.tier6-dispositions span{color:var(--muted)}
</style></head><body><main>
<header><section><p class="eyebrow">DESIGN:OS / native evidence / pilot 01</p><h1>Proof before promise.</h1><p class="boundary">AVAILABLE · PROVISIONAL · QUALIFIED DELIVERY FORBIDDEN</p><p class="intro">Two held-out SwiftUI products. Six independent evidence tiers. A lower-tier pass never authorizes a higher-tier claim.</p></section><aside class="meta"><p class="stamp">Integrity manifest</p><dl><dt>Routing base commit</dt><dd>${escapeHtml(manifest.routingBaseGitSha)}</dd><dt>Proof identity</dt><dd>${digest}</dd><dt>Generated</dt><dd>${escapeHtml(manifest.generatedAt)}</dd></dl></aside></header>
<section class="known" aria-labelledby="known-title"><h2 id="known-title">Known failures remain visible</h2><ul>${failures}</ul></section>
<table><caption>PASS, FAIL, PENDING, or NOT RUN — no aggregate score.</caption><thead><tr><th>Evidence tier</th><th>iOS<small>${escapeHtml(ios.artifact)}</small></th><th>iPadOS<small>${escapeHtml(ipad.artifact)}</small></th></tr></thead><tbody>${rows}</tbody></table>
<footer><span>Owner verdicts are separate per exact artifact hash.</span><span>Manifest SHA-256 ${digest}</span></footer>
</main></body></html>`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const manifestPath = positional[0] ?? "showcase/native-mobile-proof-pilot/proof-manifest.json";
  const outputPath = positional[1] ?? "showcase/native-mobile-proof-pilot/proof-board.html";
  const html = renderNativeMobileProofBoard(JSON.parse(readFileSync(manifestPath, "utf8")));
  if (args.includes("--check")) {
    const current = readFileSync(outputPath, "utf8");
    if (current !== html) { process.stderr.write(`ERROR proof board drift: ${outputPath}\n`); process.exitCode = 1; }
    else process.stdout.write(`OK proof board current: ${outputPath}\n`);
  } else {
    writeFileSync(outputPath, html);
    process.stdout.write(`WROTE ${outputPath}\n`);
  }
}
