/**
 * Generates Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html
 * Run: node scripts/build-foundation-page-snippet.mjs
 * Then: node scripts/sync-badge-gates-to-snippets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { SNIPPETS_DIR } from "./snippet-paths.mjs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = require(path.join(root, "lib/academy-module-paths.js"));
const topics = require(path.join(root, "lib/academy-module-topics.js"));
const catalog = require(path.join(root, "lib/academy-applied-rps-catalog.js"));

const SITE = "https://www.alanranger.com";
const OUT = path.join(SNIPPETS_DIR, "academy-foundation-page-squarespace-snippet-v1.html");

const FOUNDATION_SECTIONS = [
  {
    icon: "◉",
    title: "15 camera settings",
    intro:
      "The technical foundations — exposure, aperture, shutter, ISO. These 15 cover every key setting.",
    callout: {
      text: "Tip: try the Exposure Calculator alongside these modules",
      href: SITE + "/outdoor-photography-exposure-calculator",
    },
    start: 0,
    count: 15,
  },
  {
    icon: "◉",
    title: "10 gear and accessories",
    intro: "Essential equipment guides — tripods, bags, filters, lenses and accessories.",
    start: 15,
    count: 10,
  },
  {
    icon: "◉",
    title: "10 composition guides",
    intro: "Composition rules, framing, leading lines, balance and finding your style.",
    start: 25,
    count: 10,
  },
  {
    icon: "◉",
    title: "10 photography genre topics",
    intro: "Macro, landscape, product, portrait, architecture, street and more.",
    start: 35,
    count: 10,
  },
  {
    icon: "◉",
    title: "15 practical assignments",
    intro: "Hands-on PDF assignments — open in a new tab and practice on location.",
    start: 45,
    count: 15,
  },
];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function displayTitle(raw) {
  return String(raw || "").replace(/^\d+\s+/, "");
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function foundationButtons(start, count) {
  let html = "";
  for (let i = 0; i < count; i += 1) {
    const idx = start + i;
    const p = paths.DEFINITIVE_MODULE_URLS[idx];
    const t = topics.FOUNDATION_MODULE_TOPICS[idx] || p;
    const global = idx + 1;
    const isPdf = p.endsWith(".pdf");
    html += `<a href="${SITE}${p}" class="ar-fp-mod-btn" data-fp-tracked="1" data-fp-path="${esc(p)}"${isPdf ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
    html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
    html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(displayTitle(t))}</span></span>`;
    html += `<span class="ar-fp-mod-btn__tile">#${pad2(global)}</span></a>`;
  }
  return html;
}

function appliedButtons() {
  let html = "";
  let global = 0;
  catalog.APPLIED_LEARNING_SECTIONS.forEach((sec) => {
    html += `<div class="ar-fp-sec"><div class="ar-fp-sec-head"><span>◧</span> ${esc(sec.label)}</div>`;
    html += `<div class="ar-fp-mod-grid">`;
    sec.items.forEach((item, i) => {
      global += 1;
      html += `<a href="${SITE}${item.path}" class="ar-fp-mod-btn" data-fp-path="${esc(item.path)}">`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(item.title)}</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">A${pad2(global)}</span></a>`;
    });
    html += `</div></div>`;
  });
  return html;
}

function rpsButtons() {
  let html = `<div class="ar-fp-sec"><div class="ar-fp-sec-head"><span>◈</span> RPS planning guides</div>`;
  html += `<p class="ar-fp-sec-intro">Step-by-step planning for your RPS distinction submissions.</p>`;
  html += `<div class="ar-fp-mod-grid">`;
  catalog.RPS_ITEMS.forEach((item, i) => {
    const tag = `R${pad2(i + 1)}`;
    if (item.live && item.path) {
      html += `<a href="${SITE}${item.path}" class="ar-fp-mod-btn" data-fp-path="${esc(item.path)}">`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(item.title)}</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tag}</span></a>`;
    } else {
      html += `<span class="ar-fp-mod-btn ar-fp-mod-btn--soon">`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">Coming soon</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tag}</span></span>`;
    }
  });
  html += `</div></div>`;
  return html;
}

let zone1 = "";
FOUNDATION_SECTIONS.forEach((sec) => {
  zone1 += `<div class="ar-fp-panel"><div class="ar-fp-sec-head"><span>${sec.icon}</span> ${esc(sec.title)}</div>`;
  zone1 += `<p class="ar-fp-sec-intro">${esc(sec.intro)}</p>`;
  if (sec.callout) {
    zone1 += `<div class="ar-fp-callout"><span>⚲</span> <a href="${sec.callout.href}">${esc(sec.callout.text)}</a></div>`;
  }
  zone1 += `<div class="ar-fp-mod-grid">${foundationButtons(sec.start, sec.count)}</div></div>`;
});

const articleModulesJson = JSON.stringify(
  paths.DEFINITIVE_MODULE_URLS.slice(0, 45).map((p, i) => ({
    p,
    t: topics.ARTICLE_TOPICS[i],
  }))
);
const foundationPathsJson = JSON.stringify(paths.DEFINITIVE_MODULE_URLS);

const snippet = `<!-- FP 1.0.0 — Foundation course map (/academy/online-photography-course) -->
<div id="ar-foundation-hub" class="ar-fp-wrap" data-ar-fp-version="FP 1.0.0" hidden aria-hidden="true">
<style>
#ar-foundation-hub{--ar-fp-orange:#E57200;--ar-fp-green:#166534;--ar-fp-gold:#c79a3b;--ar-fp-gold-l:#e6c067;--ar-fp-black:#0e0e0e;--ar-fp-panel:#161310;--ar-fp-border:#3a3328;--ar-fp-grey:#b8b8b8;--ar-fp-muted:#888;font-family:"proxima-nova","Helvetica Neue",Arial,sans-serif;line-height:1.5;color:#fff;max-width:1100px;margin:0 auto;padding:24px 12px 48px;display:flex;flex-direction:column;gap:16px;box-sizing:border-box}
#ar-foundation-hub[hidden]{display:none!important}
#ar-foundation-hub *,#ar-foundation-hub *::before,#ar-foundation-hub *::after{box-sizing:border-box}
.ar-fp-panel{background:var(--ar-fp-black);border-radius:14px;padding:24px 28px}
.ar-fp-panel.bordered{border:1px solid var(--ar-fp-gold)}
.ar-fp-hl-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
.ar-fp-hl-title{font-size:23px;font-weight:700}
.ar-fp-hl-sub{color:var(--ar-fp-grey);font-size:13px;margin-top:4px;max-width:560px}
.ar-fp-trial{background:#3a1d1d;border:1px solid #7a3b3b;border-radius:9px;padding:9px 16px;text-align:center;min-width:110px}
.ar-fp-trial .lbl{color:#f0a0a0;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.ar-fp-trial .big{font-size:17px;font-weight:700}
.ar-fp-member{background:#13251a;border:1px solid #2f6b46;border-radius:9px;padding:9px 16px;text-align:center;color:#7fd0a0;font-size:13px;font-weight:700}
.ar-fp-stats{display:flex;gap:12px;margin:18px 0 14px;flex-wrap:wrap}
.ar-fp-stat{flex:1;min-width:120px;background:var(--ar-fp-panel);border:1px solid var(--ar-fp-border);border-radius:9px;padding:12px 16px}
.ar-fp-stat .l{color:var(--ar-fp-orange);font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.ar-fp-stat .v{font-size:18px;font-weight:700;margin-top:2px}
.ar-fp-stat .v span{font-size:13px;color:var(--ar-fp-muted);font-weight:400}
.ar-fp-prow{display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px}
.ar-fp-prow .l{color:var(--ar-fp-grey)}.ar-fp-prow .r{color:var(--ar-fp-orange);font-weight:700}
.ar-fp-track{height:7px;background:rgba(255,255,255,.12);border-radius:4px;overflow:hidden}
.ar-fp-fill{height:7px;background:var(--ar-fp-orange);border-radius:4px;width:0}
.ar-fp-hint{color:var(--ar-fp-muted);font-size:12px;margin-top:5px}
.ar-fp-cta{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:18px}
.ar-fp-btn{font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;display:inline-block;text-decoration:none;border:none;cursor:pointer}
.ar-fp-btn-orange{background:var(--ar-fp-orange);color:#fff}
.ar-fp-btn-gold{background:transparent;color:var(--ar-fp-gold-l);border:1px solid var(--ar-fp-gold)}
.ar-fp-cred{color:var(--ar-fp-muted);font-size:12px}
.ar-fp-mapnote{color:#666;font-size:11px;margin-top:12px;border-top:1px solid #232020;padding-top:9px}
.ar-fp-mapnote a{color:var(--ar-fp-muted)}
.ar-fp-hiw-title{font-size:16px;font-weight:600;margin-bottom:4px}
.ar-fp-hiw-sub{color:var(--ar-fp-grey);font-size:12px;margin-bottom:16px}
.ar-fp-hiw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
.ar-fp-hiw-card{background:var(--ar-fp-panel);border:1px solid var(--ar-fp-border);border-radius:10px;padding:15px}
.ar-fp-hiw-card .h{font-size:14px;font-weight:600;margin-bottom:3px}
.ar-fp-hiw-card .p{color:var(--ar-fp-grey);font-size:12px;line-height:1.5}
.ar-fp-block-lbl{font-size:13px;font-weight:700;color:#2c2c2a;background:#e6c067;display:inline-block;padding:5px 14px;border-radius:6px}
.ar-fp-zone-head{display:flex;align-items:center;gap:12px;margin:8px 0 2px;flex-wrap:wrap}
.ar-fp-zone-head .t{font-size:19px;font-weight:700}
.ar-fp-zone-badge{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.04em}
.ar-fp-zb-tracked{background:#13251a;color:#7fd0a0;border:1px solid #2f6b46}
.ar-fp-zb-untracked{background:#2a2410;color:#e6c067;border:1px solid #5c4d1f}
.ar-fp-zone-sub{color:var(--ar-fp-grey);font-size:13px;margin:0 0 4px;max-width:820px}
.ar-fp-sec-head{color:var(--ar-fp-orange);font-size:16px;font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:8px}
.ar-fp-sec-intro{color:var(--ar-fp-grey);font-size:13px;margin-bottom:14px;line-height:1.6;max-width:780px}
.ar-fp-callout{background:rgba(229,114,0,.1);border:1px solid rgba(229,114,0,.3);border-radius:8px;padding:9px 14px;margin-bottom:14px;color:var(--ar-fp-gold-l);font-size:13px;display:inline-flex;align-items:center;gap:8px}
.ar-fp-callout a{color:var(--ar-fp-gold-l);text-decoration:underline}
.ar-fp-mod-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.ar-fp-mod-btn{display:flex;align-items:center;gap:11px;background:var(--ar-fp-panel);border:1px solid var(--ar-fp-border);border-radius:9px;padding:10px 13px;text-decoration:none;color:inherit}
.ar-fp-mod-btn:hover{border-color:var(--ar-fp-orange)}
.ar-fp-mod-btn__cnt{flex-shrink:0;width:30px;height:30px;border-radius:7px;background:#0e0e0e;border:1px solid var(--ar-fp-orange);color:var(--ar-fp-orange);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ar-fp-mod-btn__body{flex:1;min-width:0}
.ar-fp-mod-btn__ttl{color:#e8e8e8;font-size:13px;line-height:1.3}
.ar-fp-mod-btn__tile{flex-shrink:0;color:var(--ar-fp-muted);font-size:11px;font-weight:600;background:#0e0e0e;border:1px solid #2a2622;border-radius:5px;padding:2px 6px}
.ar-fp-mod-btn.is-opened .ar-fp-mod-btn__cnt{background:var(--ar-fp-green);border-color:var(--ar-fp-green);color:#fff}
.ar-fp-mod-btn.is-opened .ar-fp-mod-btn__ttl{color:#b8b8b8}
.ar-fp-mod-btn--soon{opacity:.65;cursor:default}
.ar-fp-divider{border-top:2px dashed #c9c5b8;margin:6px 0}
.ar-fp-faq{color:var(--ar-fp-grey);font-size:13px;line-height:1.9;margin-top:6px}
@media(max-width:640px){.ar-fp-panel{padding:18px 16px}.ar-fp-hl-title{font-size:20px}}
</style>

<div class="ar-fp-panel bordered">
  <div class="ar-fp-hl-top">
    <div><div class="ar-fp-hl-title">Your photography Academy</div><div class="ar-fp-hl-sub">Your complete course map — Foundation, Applied Learning and RPS distinctions. Earn your way from Enrolled to Master.</div></div>
    <div id="ar-fp-membership-badge"></div>
  </div>
  <div class="ar-fp-stats">
    <div class="ar-fp-stat"><div class="l">Badge</div><div class="v" id="ar-fp-stat-badge">—</div></div>
    <div class="ar-fp-stat"><div class="l">Modules opened</div><div class="v"><span id="ar-fp-stat-modules">0</span> <span>/ 60</span></div></div>
    <div class="ar-fp-stat"><div class="l">Exams passed</div><div class="v"><span id="ar-fp-stat-exams">0</span> <span>/ 15</span></div></div>
  </div>
  <div class="ar-fp-prow"><span class="l" id="ar-fp-progress-label">Next badge: —</span><span class="r" id="ar-fp-progress-pct">—</span></div>
  <div class="ar-fp-track"><div class="ar-fp-fill" id="ar-fp-progress-fill"></div></div>
  <div class="ar-fp-hint" id="ar-fp-progress-hint"></div>
  <div class="ar-fp-cta"><a class="ar-fp-btn ar-fp-btn-orange" id="ar-fp-primary-cta" href="${SITE}/blog-on-photography/what-is-exposure-in-photography">Start with module 01: Exposure →</a><span class="ar-fp-cred">★ Award-winning photographer · 15 years teaching · rated 4.9</span></div>
  <div class="ar-fp-mapnote">This page is your full course map. Your dashboard is where you pick up day to day. <a href="${SITE}/academy/dashboard">→ Go to dashboard</a></div>
</div>

<div class="ar-fp-panel">
  <div class="ar-fp-hiw-title">New here? How your Academy works</div>
  <div class="ar-fp-hiw-sub">You learn at your own pace — the Academy tracks your Foundation progress automatically and always shows you what to do next.</div>
  <div class="ar-fp-hiw-grid">
    <div class="ar-fp-hiw-card"><div class="h">1 · Open modules</div><div class="p">Read any module to learn. We track your Foundation modules for you.</div></div>
    <div class="ar-fp-hiw-card"><div class="h">2 · Pass exams</div><div class="p">Test yourself and earn a certificate for each topic area.</div></div>
    <div class="ar-fp-hiw-card"><div class="h">3 · Earn badges</div><div class="p">Climb from Enrolled to Master as you learn, test and keep going.</div></div>
    <div class="ar-fp-hiw-card"><div class="h">4 · We guide you</div><div class="p">Your dashboard always recommends what to do next.</div></div>
  </div>
</div>

<div class="ar-fp-block-lbl">ZONE 1 — FOUNDATION COURSE (tracked · counts toward badges)</div>
<div class="ar-fp-panel"><div class="ar-fp-zone-head"><span class="t">Foundation course</span><span class="ar-fp-zone-badge ar-fp-zb-tracked">Tracked · 60 modules</span></div><p class="ar-fp-zone-sub">The core path — camera, gear, composition, genre and 15 practice assignments. Opening these counts toward your badges.</p></div>
${zone1}

<div class="ar-fp-divider"></div>
<div class="ar-fp-block-lbl">ZONE 2 — APPLIED LEARNING LIBRARY (same format · not tracked for trial)</div>
<div class="ar-fp-panel"><div class="ar-fp-zone-head"><span class="t">Applied Learning Library</span><span class="ar-fp-zone-badge ar-fp-zb-untracked">40 modules · 8 sections</span></div><p class="ar-fp-zone-sub">Deeper, applied guides that build on the Foundation course. Same format — these do not count toward Foundation badge tracking.</p></div>
<div class="ar-fp-panel">${appliedButtons()}</div>

<div class="ar-fp-divider"></div>
<div class="ar-fp-block-lbl">ZONE 3 — RPS DISTINCTIONS (same format · not tracked for trial)</div>
<div class="ar-fp-panel"><div class="ar-fp-zone-head"><span class="t">RPS distinctions</span><span class="ar-fp-zone-badge ar-fp-zb-untracked">Planning guides</span></div><p class="ar-fp-zone-sub">Guides for the Royal Photographic Society distinctions (LRPS, ARPS). Reference guidance, not Foundation-tracked.</p></div>
<div class="ar-fp-panel">${rpsButtons()}</div>

<div class="ar-fp-divider"></div>
<div class="ar-fp-panel">
  <div class="ar-fp-sec-head"><span>🎁</span> Support and resources</div>
  <p class="ar-fp-sec-intro">Two support resources whenever you are stuck.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="ar-fp-btn ar-fp-btn-gold" href="${SITE}/academy/photography-questions-answers">Open Q&amp;A library →</a><a class="ar-fp-btn ar-fp-btn-gold" href="${SITE}/academy-robo-ranger">Ask Robo-Ranger AI →</a></div>
</div>
<div class="ar-fp-panel">
  <div class="ar-fp-sec-head" style="color:#fff">FAQs</div>
  <div class="ar-fp-faq">Where should I start? · How long does each module take? · Is this included in the 14-day trial? · Do modules include exams and certificates? · Can I learn at my own pace? · Phone or tablet? · Support if I get stuck?</div>
</div>
</div>

<script>
(function(){
  var FP_PATH = "/academy/online-photography-course";
  var SITE = "${SITE}";
  var API_BASE = "https://alanranger-modules.vercel.app";
  var PROGRESS_URL = API_BASE + "/api/exams/progress";
  var ENGAGEMENT_URL = API_BASE + "/api/academy/engagement-summary?window=all";
  var TRIAL_PLAN_ID = "pln_academy-trial-30-days--wb7v0hbh";
  var TRIAL_LENGTH_DAYS = 14;
  var MODULES_TOTAL = 60;
  var ARTICLE_MODULES = ${articleModulesJson};
  var FOUNDATION_PATHS = ${foundationPathsJson};
  var CAMERA_MODULE_PATHS = FOUNDATION_PATHS.slice(0, 15);
  var COMPOSITION_MODULE_PATHS = FOUNDATION_PATHS.slice(25, 35);
  var PDF_ASSIGNMENT_PATHS = FOUNDATION_PATHS.slice(45, 60);

  var JOURNEY_STAGES = [
    { key: "enrolled", label: "Enrolled", sublabel: "Joined", iconClass: "ti-school", colour: "green", stars: 0, alwaysEarned: true },
    { key: "foundation", label: "Foundation", sublabel: "3 modules, 3 active days", iconClass: "ti-camera", colour: "green", stars: 1, foundationGate: true },
    { key: "practitioner", label: "Practitioner", sublabel: "Camera + composition, 3 assignments, 8 exams", iconClass: "ti-aperture", colour: "green", stars: 2, practitionerGate: true },
    { key: "certified", label: "Certified", sublabel: "All 15 exams, 30 modules", iconClass: "ti-certificate", colour: "green", stars: 3, certifiedGate: true },
    { key: "graduate", label: "Graduate", sublabel: "Applied breadth + 4 active months", iconClass: "ti-award", colour: "green", stars: 4, graduateGate: true },
    { key: "master", label: "Master", sublabel: "Deeper breadth + 7 active months", iconClass: "ti-trophy", colour: "gold", stars: 5, masterGate: true }
  ];

  function isFoundationPage(){
    try { return (location.pathname || "").replace(/\\/$/, "") === FP_PATH; } catch(e){ return false; }
  }
  function normalizePath(p){
    if (!p) return "";
    var s = String(p).split("?")[0].split("#")[0];
    if (s.indexOf("http") === 0) { try { s = new URL(s).pathname; } catch(e){} }
    if (s.length > 1 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
    return s;
  }
  function safeNum(v,f){ return typeof v === "number" && !isNaN(v) ? v : f; }
  function normalizeMemberJson(json){
    var j = json && json.data ? json.data : json;
    if (!j || typeof j !== "object") return {};
    return j;
  }
  function buildOpenedSet(normalized){
    var opened = (normalized && normalized.arAcademy && normalized.arAcademy.modules && normalized.arAcademy.modules.opened) || {};
    var set = new Set();
    Object.keys(opened).forEach(function(k){
      var p = normalizePath(k);
      if (p && FOUNDATION_PATHS.indexOf(p) !== -1) set.add(p);
    });
    return set;
  }
  function findNextUnopenedModule(openedSet){
    for (var i = 0; i < ARTICLE_MODULES.length; i++) {
      if (!openedSet.has(ARTICLE_MODULES[i].p)) return { index: i, path: ARTICLE_MODULES[i].p, title: ARTICLE_MODULES[i].t };
    }
    return null;
  }
  function shortModTitle(t){ return String(t||"").replace(/^\\d+\\s+/, ""); }
  function getPlanConnections(member){
    var d = member && member.data ? member.data : member;
    return (d && d.planConnections) || [];
  }
  function hasTrialAccess(member){
    return getPlanConnections(member).some(function(pc){ return pc && pc.planId === TRIAL_PLAN_ID && pc.status === "ACTIVE"; });
  }
  function hasAnnualAccess(member){
    return getPlanConnections(member).some(function(pc){
      return pc && pc.status === "ACTIVE" && pc.planId && pc.planId.indexOf("annual") >= 0;
    });
  }
  function safeDate(v){
    if (!v) return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function getTrialEndsAt(member){
    var pcs = getPlanConnections(member);
    for (var i = 0; i < pcs.length; i++) {
      var pc = pcs[i] || {};
      if (pc.planId !== TRIAL_PLAN_ID) continue;
      var cancelAt = pc.payment && pc.payment.cancelAtDate;
      if (cancelAt) {
        var ts = typeof cancelAt === "number" ? cancelAt : parseInt(cancelAt, 10);
        if (!isNaN(ts)) return new Date(ts * 1000);
      }
    }
    var created = safeDate(member && member.createdAt) || safeDate(member && member.data && member.data.createdAt);
    if (created) return new Date(created.getTime() + TRIAL_LENGTH_DAYS * 86400000);
    return null;
  }
  function daysLeft(end){
    if (!end) return null;
    return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
  }
  async function fetchExamProgress(memberId){
    if (!memberId) return null;
    try {
      var res = await fetch(PROGRESS_URL, { headers: { "X-Memberstack-Id": memberId } });
      if (!res.ok) return null;
      return await res.json();
    } catch(e){ return null; }
  }
  async function fetchEngagementSummary(memberId){
    if (!memberId) return null;
    try {
      var res = await fetch(ENGAGEMENT_URL, { headers: { "X-Memberstack-Id": memberId, Accept: "application/json" } });
      if (!res.ok) return null;
      return await res.json();
    } catch(e){ return null; }
  }
  function countFoundationOpens(openedSet){
    var n = 0;
    FOUNDATION_PATHS.forEach(function(p){ if (openedSet.has(p)) n += 1; });
    return n;
  }
  function countOpenedInList(openedSet, list){
    var n = 0;
    for (var i = 0; i < list.length; i++) { if (openedSet.has(list[i])) n += 1; }
    return n;
  }
  function buildGateStats(openedSet, examsPassed, engagement, normalized){
    var stats = {
      foundationModulesOpened: countFoundationOpens(openedSet),
      cameraOpened: countOpenedInList(openedSet, CAMERA_MODULE_PATHS),
      compositionOpened: countOpenedInList(openedSet, COMPOSITION_MODULE_PATHS),
      pdfAssignmentsOpened: countOpenedInList(openedSet, PDF_ASSIGNMENT_PATHS),
      totalModulesOpened: countFoundationOpens(openedSet),
      examsPassed: examsPassed,
      appliedLearningOpened: null,
      practicePacksOpened: null,
      distinctActiveMonthsAllTime: null
    };
    if (engagement && typeof engagement.appliedLearningOpened === "number") {
      stats.appliedLearningOpened = engagement.appliedLearningOpened;
      stats.practicePacksOpened = engagement.practicePacksOpened;
      stats.distinctActiveMonthsAllTime = engagement.distinctActiveMonthsAllTime;
      if (typeof engagement.pdfAssignmentsOpened === "number") stats.pdfAssignmentsOpened = engagement.pdfAssignmentsOpened;
    }
    return stats;
  }
  function applyOpenedPills(openedSet){
    document.querySelectorAll("#ar-foundation-hub [data-fp-tracked='1']").forEach(function(el){
      var p = el.getAttribute("data-fp-path");
      if (p && openedSet.has(normalizePath(p))) el.classList.add("is-opened");
    });
  }
  function renderMembershipBadge(member, engagement){
    var el = document.getElementById("ar-fp-membership-badge");
    if (!el) return;
    var trial = hasTrialAccess(member);
    var paid = hasAnnualAccess(member) || (engagement && engagement.hasConverted);
    if (trial && !paid) {
      var end = getTrialEndsAt(member);
      var d = daysLeft(end);
      el.innerHTML = '<div class="ar-fp-trial"><div class="lbl">Trial</div><div class="big">' + (d != null ? d : "—") + ' days left</div></div>';
    } else {
      el.innerHTML = '<div class="ar-fp-member">Member · active</div>';
    }
  }
  function renderCta(openedSet){
    var cta = document.getElementById("ar-fp-primary-cta");
    if (!cta) return;
    var next = findNextUnopenedModule(openedSet);
    if (!next) {
      cta.textContent = "Explore Foundation course →";
      cta.href = SITE + FP_PATH;
      return;
    }
    var pad = function(n){ return n < 10 ? "0" + n : String(n); };
    var label = countFoundationOpens(openedSet) === 0
      ? "Start with module " + pad(next.index + 1) + ": " + shortModTitle(next.title) + " →"
      : "Continue: #" + pad(next.index + 1) + " " + shortModTitle(next.title) + " →";
    cta.textContent = label;
    cta.href = SITE + next.path;
  }
  function renderHeadline(badges, progress, openedCount, examsPassed){
    var earned = badges.filter(function(b){ return b.earned; });
    var current = earned.length ? earned[earned.length - 1] : null;
    var badgeEl = document.getElementById("ar-fp-stat-badge");
    if (badgeEl) badgeEl.textContent = current ? current.label : "Enrolled";
    var modEl = document.getElementById("ar-fp-stat-modules");
    if (modEl) modEl.textContent = String(openedCount);
    var exEl = document.getElementById("ar-fp-stat-exams");
    if (exEl) exEl.textContent = String(examsPassed);
    var next = getNextUnearnedBadge(badges);
    var pl = document.getElementById("ar-fp-progress-label");
    var pp = document.getElementById("ar-fp-progress-pct");
    var pf = document.getElementById("ar-fp-progress-fill");
    var ph = document.getElementById("ar-fp-progress-hint");
    if (pl) pl.textContent = next ? ("Next badge: " + next.label) : "All badges earned";
    if (pp) pp.textContent = progress.label || (progress.pct + "%");
    if (pf) pf.style.width = Math.min(100, progress.pct) + "%";
    if (ph) {
      ph.textContent = progress.breakdown || "";
      if (!ph.textContent && progress.nextKey === "foundation") ph.textContent = "Open 3 modules over 3 active days to earn your first badge.";
    }
  }

  var CAMERA_MODULE_PATHS = ARTICLE_MODULES.slice(0, 15).map(function(m){ return m.p; });
  var COMPOSITION_MODULE_PATHS = ARTICLE_MODULES.slice(25, 35).map(function(m){ return m.p; });
  var PDF_ASSIGNMENT_PATHS = FOUNDATION_PATHS.slice(45);
  var JOURNEY_STAGES = [
    { key: "enrolled", label: "Enrolled", sublabel: "Joined", iconClass: "ti-school", colour: "green", stars: 0, alwaysEarned: true },
    { key: "foundation", label: "Foundation", sublabel: "3 modules, 3 active days", iconClass: "ti-camera", colour: "green", stars: 1, foundationGate: true },
    { key: "practitioner", label: "Practitioner", sublabel: "Camera + composition, 3 assignments, 8 exams", iconClass: "ti-aperture", colour: "green", stars: 2, practitionerGate: true },
    { key: "certified", label: "Certified", sublabel: "All 15 exams, 30 modules", iconClass: "ti-certificate", colour: "green", stars: 3, certifiedGate: true },
    { key: "graduate", label: "Graduate", sublabel: "Applied breadth + 4 active months", iconClass: "ti-award", colour: "green", stars: 4, graduateGate: true },
    { key: "master", label: "Master", sublabel: "Deeper breadth + 7 active months", iconClass: "ti-trophy", colour: "gold", stars: 5, masterGate: true }
  ];
  function countOpenedInList(set, list){
    var n = 0;
    for (var i = 0; i < list.length; i++) if (set.has(list[i])) n += 1;
    return n;
  }
  function computeGateStats(openedSet, examsPassed){
    return {
      foundationModulesOpened: openedSet.size,
      cameraOpened: countOpenedInList(openedSet, CAMERA_MODULE_PATHS),
      compositionOpened: countOpenedInList(openedSet, COMPOSITION_MODULE_PATHS),
      pdfAssignmentsOpened: countOpenedInList(openedSet, PDF_ASSIGNMENT_PATHS),
      totalModulesOpened: openedSet.size,
      examsPassed: examsPassed || 0,
      appliedLearningOpened: null,
      practicePacksOpened: null,
      distinctActiveMonthsAllTime: null
    };
  }

  // BEGIN BADGE-GATES-SYNC
  // END BADGE-GATES-SYNC

  async function init(){
    if (!isFoundationPage()) return;
    var hub = document.getElementById("ar-foundation-hub");
    if (!hub) return;
    hub.hidden = false;
    hub.removeAttribute("aria-hidden");
    var ms = globalThis.$memberstackDom || globalThis.MemberStack;
    var member = null;
    var normalized = {};
    if (globalThis.__arMsReader && ms) {
      try {
        var bundle = await globalThis.__arMsReader.fetchBundle(ms);
        member = bundle.member;
        normalized = normalizeMemberJson(bundle.rawJson);
      } catch(e){}
    }
    var memberId = member && (member.id || (member.data && member.data.id));
    var openedSet = buildOpenedSet(normalized);
    var openedCount = countFoundationOpens(openedSet);
    applyOpenedPills(openedSet);
    renderCta(openedSet);
    var examData = await fetchExamProgress(memberId);
    var examsPassed = examData && examData.summary ? safeNum(examData.summary.passedCount, 0) : 0;
    var engagement = await fetchEngagementSummary(memberId);
    var engagementDegraded = !engagement;
    var activeDays = engagement && typeof engagement.distinctActiveDaysFirst14d === "number" ? engagement.distinctActiveDaysFirst14d : 0;
    renderMembershipBadge(member, engagement);
    var gateStats = buildGateStats(openedSet, examsPassed, engagement, normalized);
    var badges = computeJourneyBadges(gateStats, activeDays, engagementDegraded, { hasConverted: !!(engagement && engagement.hasConverted), lastActivityAt: engagement ? engagement.lastActivityAt : null, nowMs: Date.now() });
    var progress = computeNextBadgeProgress(badges, gateStats, activeDays, engagementDegraded, openedCount, MODULES_TOTAL);
    renderHeadline(badges, progress, openedCount, examsPassed);
    globalThis.__arFoundationPage = { progressPct: progress.pct, progressBreakdown: progress.breakdown, progressLabel: progress.label, openedCount: openedCount, examsPassed: examsPassed };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
</script>
`;

fs.writeFileSync(OUT, snippet, "utf8");
console.log("OK: wrote", OUT);
