/**
 * Generates Squarespace Snippets/academy-foundation-page-squarespace-snippet-v1.html
 * Run: node scripts/build-foundation-page-snippet.mjs
 * Then: node scripts/sync-badge-gates-to-snippets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execSync } from "child_process";
import { SNIPPETS_DIR } from "./snippet-paths.mjs";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = require(path.join(root, "lib/academy-module-paths.js"));
const topics = require(path.join(root, "lib/academy-module-topics.js"));
const catalog = require(path.join(root, "lib/academy-applied-rps-catalog.js"));
const metaLib = require(path.join(root, "lib/academy-module-meta-descriptions.js"));
const META_BY_PATH = metaLib.META_BY_PATH || {};

const SITE = "https://www.alanranger.com";
const GOOGLE_REVIEW_URL =
  "https://g.page/r/CX5PMdGA5IP6EAI/review";
const ELFSIGHT_REVIEWS_APP = "elfsight-app-f80cced4-3461-4683-bf2b-461a77b60d68";
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

function slugToTitle(modulePath) {
  const parts = String(modulePath || "")
    .split("/")
    .filter(Boolean);
  const slug = parts[parts.length - 1] || "";
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PRACTICE_PACK_GROUPS = [
  { label: "Technical Foundations", start: 0, end: 9 },
  { label: "Composition & Creative", start: 10, end: 19 },
  { label: "Genre-Specific", start: 20, end: 29 },
];

const CHECKLIST_GROUPS = [
  { label: "Composition Guides", start: 0, end: 9 },
  { label: "Genre Guides", start: 10, end: 19 },
  { label: "Camera Settings Guides", start: 20, end: 34 },
];

function resourceGroupButtons(urls, groups, tilePrefix, opts) {
  opts = opts || {};
  let html = "";
  groups.forEach((group) => {
    html += `<div class="ar-fp-sec"><div class="ar-fp-sec-head"><span>◉</span> ${esc(group.label)}</div>`;
    html += `<div class="ar-fp-mod-grid">`;
    for (let i = group.start; i <= group.end; i++) {
      const p = urls[i];
      if (!p) continue;
      const label = displayTitle(slugToTitle(p));
      const cnt = i - group.start + 1;
      const tileTag = tilePrefix + pad2(i + 1);
      const paidAttr = opts.paid ? ' data-fp-paid="1"' : "";
      const blankAttr = opts.blank ? ' target="_blank" rel="noopener noreferrer"' : "";
      html += `<a href="${SITE}${p}" class="ar-fp-mod-btn" data-fp-resource="1"${paidAttr} data-fp-path="${esc(p)}"${tipAttr(label, tileTag, p)}${blankAttr}>`;
      html += `<span class="ar-fp-mod-btn__cnt">${cnt}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(label)}</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tileTag}</span></a>`;
    }
    html += `</div></div>`;
  });
  return html;
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function normPath(p) {
  return String(p || "").split("?")[0].replace(/\/$/, "");
}

function metaForPath(modulePath) {
  return META_BY_PATH[normPath(modulePath)] || "";
}

function tipAttr(titleText, tileTag, modulePath) {
  const head = `${titleText} · ${tileTag}`;
  const desc = metaForPath(modulePath);
  const full = desc ? `${head}\n${desc}` : head;
  if (desc) {
    return ` data-fp-tip-head="${esc(head)}" data-fp-tip-desc="${esc(desc)}" title="${esc(full)}"`;
  }
  return ` data-fp-tip-head="${esc(head)}" title="${esc(head)}"`;
}

function foundationButtons(start, count) {
  let html = "";
  for (let i = 0; i < count; i += 1) {
    const idx = start + i;
    const p = paths.DEFINITIVE_MODULE_URLS[idx];
    const t = topics.FOUNDATION_MODULE_TOPICS[idx] || p;
    const global = idx + 1;
    const tileTag = `#${pad2(global)}`;
    const label = displayTitle(t);
    const isPdf = p.endsWith(".pdf");
    html += `<a href="${SITE}${p}" class="ar-fp-mod-btn" data-fp-tracked="1" data-fp-path="${esc(p)}"${tipAttr(label, tileTag, p)}${isPdf ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
    html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
    html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(label)}</span></span>`;
    html += `<span class="ar-fp-mod-btn__tile">${tileTag}</span></a>`;
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
      const tileTag = `A${pad2(global)}`;
      html += `<a href="${SITE}${item.path}" class="ar-fp-mod-btn" data-fp-paid="1" data-fp-path="${esc(item.path)}"${tipAttr(item.title, tileTag, item.path)}>`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(item.title)}</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tileTag}</span></a>`;
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
      html += `<a href="${SITE}${item.path}" class="ar-fp-mod-btn" data-fp-paid="1" data-fp-path="${esc(item.path)}"${tipAttr(item.title, tag, item.path)}>`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">${esc(item.title)}</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tag}</span></a>`;
    } else {
      html += `<span class="ar-fp-mod-btn ar-fp-mod-btn--soon"${tipAttr("Coming soon", tag, null)}>`;
      html += `<span class="ar-fp-mod-btn__cnt">${i + 1}</span>`;
      html += `<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">Coming soon</span></span>`;
      html += `<span class="ar-fp-mod-btn__tile">${tag}</span></span>`;
    }
  });
  html += `</div></div>`;
  return html;
}

const practicePackButtons = resourceGroupButtons(paths.PRACTICE_PACK_URLS, PRACTICE_PACK_GROUPS, "P", {
  paid: true,
});
const checklistButtons = resourceGroupButtons(paths.CHECKLIST_URLS, CHECKLIST_GROUPS, "C", {
  paid: true,
  blank: true,
});

const FAQ_ITEMS = [
  {
    q: "Where should I start?",
    a: "Open module 01 on exposure, or use the orange button at the top — it always points to your next unread Foundation module. Your dashboard also recommends what to do next day to day.",
  },
  {
    q: "How long does each module take?",
    a: "Most modules take 8–15 minutes to read, with optional deeper material if you want more. The full 60-module Foundation course is roughly 10 hours of reading. PDF assignments are designed for a walk or a weekend session.",
  },
  {
    q: "Is this included in the 14-day trial?",
    a: "Yes. Your trial unlocks the Foundation course modules and exams for 14 days. Applied Learning, RPS guides and downloads such as Practice Packs are paid-member content and stay locked until you upgrade.",
    trialOnly: true,
  },
  {
    q: "Do modules include exams and certificates?",
    a: "Yes. There are 15 topic exams linked to the Foundation course. Pass an exam and you can download a certificate with your name and the date. Complete the full Academy path for the master certificate.",
  },
  {
    q: "Can I learn at my own pace?",
    a: "Absolutely. There are no deadlines. Open modules when it suits you — the Academy tracks your progress and badges automatically.",
  },
  {
    q: "Can I use a phone or tablet?",
    a: "Yes. Modules work on any modern browser. Several topics cover phone photography. A few PDF assignments are easier with a printer or second screen but are not required.",
  },
  {
    q: "What support is there if I get stuck?",
    a: "Use the Q&A library, ask Robo-Ranger AI, or post in the community. Links to both support tools are in the Support and resources section below.",
  },
];

function faqAccordionHtml() {
  return FAQ_ITEMS.map((item) => {
    const trialAttr = item.trialOnly ? ' data-fp-trial-only="1"' : "";
    return `<details class="ar-fp-faq-item"${trialAttr}><summary>${esc(item.q)}</summary><div class="ar-fp-faq-body"><p>${esc(item.a)}</p></div></details>`;
  }).join("");
}

const JOURNEY_ICON_SVGS = {
  "ti-school":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d="M22 9l-10-5-10 5 10 5 10-5z"/><path d="M6 10v6c0 1 2 3 6 3s6-2 6-3v-6"/></svg>',
  "ti-camera":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"/><circle cx="12" cy="13" r="3"/></svg>',
  "ti-aperture":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>',
  "ti-certificate":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="1"/><path d="M8 20l4-2 4 2v-8H8z"/></svg>',
  "ti-award":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="M8.5 14L7 21l5-2 5 2-1.5-7"/></svg>',
  "ti-trophy":
    '<svg viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d="M8 4h8v3a4 4 0 01-8 0V4z"/><path d="M6 4H4v1a3 3 0 003 3M18 4h2v1a3 3 0 01-3 3"/><path d="M12 11v3M9 20h6M10 14h4v6h-4z"/></svg>',
};

const HIW_CARDS = [
  {
    title: "1 · Open modules",
    text: "Read any module to learn. We track your Foundation modules for you.",
    iconClass: "ti-camera",
    badgeLabel: "Foundation",
  },
  {
    title: "2 · Pass exams",
    text: "Test yourself and earn a certificate for each topic area.",
    iconClass: "ti-certificate",
    badgeLabel: "Certified",
  },
  {
    title: "3 · Earn badges",
    text: "Climb from Enrolled to Master as you learn, test and keep going.",
    iconClass: "ti-trophy",
    badgeLabel: "Master",
  },
  {
    title: "4 · We guide you",
    text: "Your dashboard always recommends what to do next.",
    iconClass: "ti-school",
    badgeLabel: "Enrolled",
  },
];

const HIW_ICON_WRAP_STYLE =
  'style="width:58px!important;height:58px!important;margin:0 0 12px!important;background:#166534!important;border:1px solid #14532d!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0!important;box-sizing:border-box!important;box-shadow:0 2px 10px rgba(0,0,0,.45)!important"';

function hiwIconSvg(iconClass) {
  var svg = JOURNEY_ICON_SVGS[iconClass] || JOURNEY_ICON_SVGS["ti-school"];
  return svg.replace(
    "<svg ",
    '<svg style="width:28px!important;height:28px!important;display:block!important;stroke:#fff!important;fill:none!important" '
  );
}

function statBadgeIconHtml(iconClass, colour) {
  const bg = colour === "gold" ? "#b45309" : "#166534";
  const border = colour === "gold" ? "#92400e" : "#14532d";
  const svg = hiwIconSvg(iconClass).replace(/28px/g, "22px");
  return `<div class="ar-fp-stat__icon ar-fp-hiw-icon ar-fp-hiw-icon--badge" id="ar-fp-stat-badge-icon" aria-hidden="true" style="width:44px!important;height:44px!important;margin:0!important;background:${bg}!important;border:1px solid ${border}!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-shrink:0!important;box-sizing:border-box!important;box-shadow:0 2px 8px rgba(0,0,0,.35)!important">${svg}</div>`;
}

function hiwCardsHtml() {
  return HIW_CARDS.map(
    (card) =>
      `<div class="ar-fp-hiw-card"><div class="ar-fp-hiw-icon ar-fp-hiw-icon--badge" ${HIW_ICON_WRAP_STYLE}>${hiwIconSvg(card.iconClass)}</div><div class="ar-fp-hiw-badge-lbl">${esc(card.badgeLabel)} badge</div><div class="h">${esc(card.title)}</div><div class="p">${esc(card.text)}</div></div>`
  ).join("");
}

const FP_COLLAPSE_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>';

function mapSectionInnerHtml(id, icon, title, total, bodyInner, expanded, progressLabel) {
  const ariaExp = expanded ? "true" : "false";
  const hint = expanded ? "hide me" : "show me";
  const progress = progressLabel || `0/${total} opened`;
  return (
    `<button type="button" class="ar-fp-map-section__head" aria-expanded="${ariaExp}" aria-controls="ar-fp-section-body-${id}">` +
    `<span class="ar-fp-collapsible__toggle-control">` +
    `<span class="ar-fp-collapsible__chevron" aria-hidden="true">${FP_COLLAPSE_CHEVRON}</span>` +
    `<span class="ar-fp-collapsible__hint" id="ar-fp-section-hint-${id}">${hint}</span></span>` +
    `<span class="ar-fp-map-section__meta"><span class="ar-fp-map-section__icon">${icon}</span>` +
    `<span class="ar-fp-map-section__title">${esc(title)}</span></span>` +
    `<span class="ar-fp-map-section__progress" id="ar-fp-section-progress-${id}">${progress}</span>` +
    `</button>` +
    `<div class="ar-fp-map-section__body" id="ar-fp-section-body-${id}">${bodyInner}</div>`
  );
}

function mapSectionPanelHtml(id, icon, title, total, bodyInner, expanded, extraClass, panelId, progressLabel) {
  const expandedClass = expanded ? " is-fp-expanded" : "";
  const panelClass = extraClass ? " " + extraClass : "";
  const idAttr = panelId ? ` id="${panelId}"` : "";
  return (
    `<div class="ar-fp-panel ar-fp-map-section${expandedClass}${panelClass}"${idAttr} data-fp-section-id="${id}" data-fp-section-total="${total}">` +
    mapSectionInnerHtml(id, icon, title, total, bodyInner, expanded, progressLabel) +
    `</div>`
  );
}

function foundationSectionPanel(sec, idx) {
  let inner = `<p class="ar-fp-sec-intro">${esc(sec.intro)}</p>`;
  if (sec.callout) {
    inner += `<div class="ar-fp-callout"><span>⚲</span> <a href="${sec.callout.href}">${esc(sec.callout.text)}</a></div>`;
  }
  inner += `<div class="ar-fp-mod-grid">${foundationButtons(sec.start, sec.count)}</div>`;
  return mapSectionPanelHtml("foundation-" + idx, sec.icon, sec.title, sec.count, inner, idx === 0);
}

let zone1 = "";
FOUNDATION_SECTIONS.forEach((sec, idx) => {
  zone1 += foundationSectionPanel(sec, idx);
});

const appliedPaths = [];
catalog.APPLIED_LEARNING_SECTIONS.forEach((sec) => {
  sec.items.forEach((item) => appliedPaths.push(item.path));
});
const rpsPaths = catalog.RPS_ITEMS.filter((item) => item.live && item.path).map((item) => item.path);

const practicePackTotal = paths.PRACTICE_PACK_URLS.length;
const checklistTotal = paths.CHECKLIST_URLS.length;

const fpMapSectionsJson = JSON.stringify([
  ...FOUNDATION_SECTIONS.map((sec, i) => ({
    id: "foundation-" + i,
    title: sec.title,
    icon: sec.icon,
    total: sec.count,
    paths: paths.DEFINITIVE_MODULE_URLS.slice(sec.start, sec.start + sec.count).map(normPath),
  })),
  {
    id: "exams",
    title: "Exams & Certificates",
    icon: "🎓",
    total: 15,
    paths: [],
  },
  {
    id: "practice-packs",
    title: "Practice Packs",
    icon: "◉",
    total: practicePackTotal,
    paths: paths.PRACTICE_PACK_URLS.map(normPath),
  },
  {
    id: "checklists",
    title: "1-Page Field Checklists",
    icon: "◉",
    total: checklistTotal,
    paths: paths.CHECKLIST_URLS.map(normPath),
  },
  {
    id: "applied-learning",
    title: "Applied Learning Library",
    icon: "◧",
    total: appliedPaths.length,
    paths: appliedPaths.map(normPath),
  },
  {
    id: "rps-distinctions",
    title: "RPS distinctions",
    icon: "◈",
    total: rpsPaths.length,
    paths: rpsPaths.map(normPath),
  },
]);
const appliedPathsJson = JSON.stringify(appliedPaths.map(normPath));
const rpsPathsJson = JSON.stringify(rpsPaths.map(normPath));

const appliedSectionBody =
  `<p class="ar-fp-zone-sub">Deeper, applied guides that build on the Foundation course. Same format — these do not count toward Foundation badge tracking.</p>` +
  `<p class="ar-fp-paid-lock-note" id="ar-fp-applied-lock-note" hidden>Paid membership only — upgrade to unlock these guides.</p>` +
  appliedButtons();

const rpsSectionBody =
  `<p class="ar-fp-zone-sub">Guides for the Royal Photographic Society distinctions (LRPS, ARPS). Reference guidance, not Foundation-tracked.</p>` +
  `<p class="ar-fp-paid-lock-note" id="ar-fp-rps-lock-note" hidden>Paid membership only — upgrade to unlock RPS planning guides.</p>` +
  rpsButtons();

const examsSectionBody =
  `<div class="ar-fp-resource-row"><a class="ar-fp-resource-link" href="${SITE}/academy/photography-exams-certification">Go to exams &amp; certificates</a></div>` +
  `<p class="ar-fp-zone-sub">Take exams, save progress, download results PDFs and certificates.</p>` +
  `<div class="ar-fp-sec"><div class="ar-fp-sec-head"><span>🎓</span> 15 topic exams</div>` +
  `<p class="ar-fp-sec-intro" id="ar-fp-exams-tip">Resume an exam or download your latest results.</p>` +
  `<div id="ar-fp-exams-grid" class="ar-fp-mod-grid" aria-label="Exam progress grid"></div></div>`;

const practicePacksSectionBody =
  `<div class="ar-fp-resource-row"><a class="ar-fp-resource-link" data-fp-paid="1" href="${SITE}/practice-pack-library">Go to practice pack page</a></div>` +
  `<p class="ar-fp-zone-sub">30 Assignment Practice Packs — grab a pack and follow the step-by-step field exercises.</p>` +
  `<p class="ar-fp-paid-lock-note" id="ar-fp-practice-packs-lock-note" hidden>Paid membership only — upgrade to unlock Practice Packs.</p>` +
  practicePackButtons;

const checklistsSectionBody =
  `<div class="ar-fp-resource-row"><a class="ar-fp-resource-link" data-fp-paid="1" href="${SITE}/35-photography-1-page-field-checklists">Go to checklists page</a></div>` +
  `<p class="ar-fp-zone-sub">35 one-page field checklists — print one page per lesson and take it on location.</p>` +
  `<p class="ar-fp-paid-lock-note" id="ar-fp-checklists-lock-note" hidden>Paid membership only — upgrade to unlock checklists.</p>` +
  checklistButtons;

const examsZoneHtml = mapSectionPanelHtml(
  "exams",
  "🎓",
  "Exams & Certificates",
  15,
  examsSectionBody,
  false,
  "",
  "ar-fp-zone-exams",
  "15 exams"
);
const practicePacksZoneHtml = mapSectionPanelHtml(
  "practice-packs",
  "◉",
  "Practice Packs",
  practicePackTotal,
  practicePacksSectionBody,
  false,
  "ar-fp-paid-zone",
  "ar-fp-zone-practice-packs",
  "0/" + practicePackTotal + " opened"
);
const checklistsZoneHtml = mapSectionPanelHtml(
  "checklists",
  "◉",
  "1-Page Field Checklists",
  checklistTotal,
  checklistsSectionBody,
  false,
  "ar-fp-paid-zone",
  "ar-fp-zone-checklists",
  "0/" + checklistTotal + " opened"
);

const appliedZoneHtml = mapSectionPanelHtml(
  "applied-learning",
  "◧",
  "Applied Learning Library",
  appliedPaths.length,
  appliedSectionBody,
  false,
  "ar-fp-paid-zone",
  "ar-fp-zone-applied"
);
const rpsZoneHtml = mapSectionPanelHtml(
  "rps-distinctions",
  "◈",
  "RPS distinctions",
  rpsPaths.length,
  rpsSectionBody,
  false,
  "ar-fp-paid-zone",
  "ar-fp-zone-rps"
);

const articleModulesJson = JSON.stringify(
  paths.DEFINITIVE_MODULE_URLS.slice(0, 45).map((p, i) => ({
    p,
    t: topics.ARTICLE_TOPICS[i],
  }))
);
const foundationPathsJson = JSON.stringify(paths.DEFINITIVE_MODULE_URLS);
const practicePackUrlsJson = JSON.stringify(paths.PRACTICE_PACK_URLS);
const checklistUrlsJson = JSON.stringify(paths.CHECKLIST_URLS);
const journeyIconsJson = JSON.stringify(JOURNEY_ICON_SVGS);

const FP_HEADER_FALLBACK = `<template id="ar-fp-header-fallback-template"><div id="ar-academy-header-container"><div id="ar-academy-header-welcome"><div id="ar-academy-header-welcome-copy"><div id="ar-academy-header-welcome-text">Welcome back, <span id="ar-academy-header-welcome-name">...</span></div><div id="ar-academy-header-last-login"></div></div><div id="ar-fp-header-reviews-badge" class="ar-fp-header-reviews-badge" aria-label="Google rating"><div class="${ELFSIGHT_REVIEWS_APP}"></div></div></div><div id="ar-academy-header-center"><div id="ar-academy-header-center-copy"><h1 id="ar-academy-header-title">Photography Course Modules Map</h1><p id="ar-academy-header-subtitle">Your photography Academy</p></div></div><div id="ar-academy-header-right"><a id="ar-fp-header-back" class="ar-fp-header-back" href="${SITE}/academy/dashboard">← Back to dashboard</a><div id="ar-academy-header-brand"><a id="ar-academy-header-brand-link" href="https://www.alanranger.com/" aria-label="Back to AlanRanger.com homepage"><img id="ar-academy-header-brand-logo" src="https://images.squarespace-cdn.com/content/v1/5013f4b2c4aaa4752ac69b17/b859ad2b-1442-4595-b9a4-410c32299bf8/ALAN+RANGER+photography+LOGO+BLACK.+switched+small.png?format=1500w" alt="Alan Ranger Photography" loading="eager" /></a></div><button id="ar-academy-header-logout-btn" type="button" data-ms-action="logout">Log out</button></div></div></template>`;

const FP_SQSP_WRAPPER_SELECTORS = [
  "html.ar-fp-live-shell",
  "html.ar-fp-live-shell body",
  "html.ar-fp-live-shell #siteWrapper",
  "html.ar-fp-live-shell .Site",
  "html.ar-fp-live-shell .Site-inner",
  "html.ar-fp-live-shell .Content-outer",
  "html.ar-fp-live-shell #content",
  "html.ar-fp-live-shell main.Main",
  "html.ar-fp-live-shell .Main--page",
  "html.ar-fp-live-shell .Main-content",
  "html.ar-fp-live-shell #page",
  "html.ar-fp-live-shell #sections",
  "html.ar-fp-live-shell #canvas",
  "html.ar-fp-live-shell .page-section",
  "html.ar-fp-live-shell .section-background",
  "html.ar-fp-live-shell .content-wrapper",
  "html.ar-fp-live-shell .sqs-layout",
].join(",");

const FP_EARLY_BOOT = `<script>(function(){try{var p=(location.pathname||"").replace(/\\/+$/, "")||"/";var isFp=p===("/academy/online-photography-course")||p.indexOf("online-photography-course")!==-1;if(!isFp)return;var ed=false;try{if(window.self!==window.top)ed=true;if(!ed&&location.pathname.indexOf("/config/")===0)ed=true;if(!ed&&location.search.indexOf("format=page-content")!==-1)ed=true;if(!ed&&document.body&&document.body.classList.contains("sqs-edit-mode-active"))ed=true;if(!ed&&document.documentElement.classList.contains("sqs-edit-mode-active"))ed=true;}catch(e){}var r=document.documentElement;r.classList.add("ar-academy","ar-fp-app-shell");if(ed){r.classList.add("ar-fp-edit-mode");var h=document.getElementById("ar-foundation-hub");if(h){h.hidden=false;h.removeAttribute("aria-hidden");}}else{r.classList.add("ar-fp-live-shell");}}catch(e){}})();</script>`;

const snippet = `<!-- FP 1.0.42 — Foundation course map (/academy/online-photography-course) -->
${FP_EARLY_BOOT}
${FP_HEADER_FALLBACK}
<div id="ar-foundation-hub" class="ar-fp-wrap" data-ar-fp-page="1" data-ar-fp-version="FP 1.0.42" hidden aria-hidden="true">
<style>
html.ar-fp-live-shell{--ar-bg:#0f1419;--ar-sqsp-nav-offset:0px}
${FP_SQSP_WRAPPER_SELECTORS}{background:var(--ar-bg)!important;background-color:var(--ar-bg)!important}
html.ar-fp-live-shell,html.ar-fp-live-shell body{color:#e2e8f0}
html.ar-fp-live-shell #header,html.ar-fp-live-shell header.Header,html.ar-fp-live-shell .Mobile-bar,html.ar-fp-live-shell .Header-nav--primary,html.ar-fp-live-shell .Header-nav--secondary,html.ar-fp-live-shell .Header--bottom,html.ar-fp-live-shell .sqs-mobile-info-bar{display:none!important;height:0!important;overflow:hidden!important;visibility:hidden!important;margin:0!important;padding:0!important}
html.ar-fp-live-shell .sqs-block-content{background:transparent!important}
html.ar-fp-live-shell .page-section,html.ar-fp-live-shell .sqs-block{padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important;min-height:0!important}
html.ar-fp-live-shell .page-section .section-border,html.ar-fp-live-shell .page-section .section-background-content,html.ar-fp-live-shell .content-wrapper{padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important}
html.ar-fp-live-shell .page-section:has(#ar-foundation-hub){padding-top:0!important;margin-top:0!important;min-height:0!important;border-top:none!important}
html.ar-fp-live-shell .page-section:has(#ar-foundation-hub) .section-background{opacity:0!important;height:0!important;min-height:0!important}
html.ar-fp-live-shell #ar-academy-header-container{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,auto) minmax(0,1fr);align-items:center;column-gap:20px;width:100vw!important;max-width:100vw!important;margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important;padding:18px 32px;background:#000!important;color:#fff;position:sticky!important;top:0!important;left:0;right:0;z-index:998!important;min-height:96px;box-sizing:border-box;margin-bottom:0!important;border:none!important;box-shadow:0 2px 12px rgba(0,0,0,.45)!important;overflow:visible!important}
html.ar-fp-live-shell #ar-academy-header-welcome{grid-column:1;grid-row:1;justify-self:start;align-self:center;display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;gap:14px 18px;min-width:0;z-index:2;position:relative;overflow:visible}
html.ar-fp-live-shell #ar-academy-header-welcome-copy{flex:0 1 auto;min-width:0}
html.ar-fp-live-shell .ar-fp-header-reviews-badge{flex:0 1 auto;display:flex;align-items:center;min-width:0;max-width:240px;min-height:52px;height:auto;overflow:visible;pointer-events:auto;position:relative;z-index:3}
html.ar-fp-live-shell .ar-fp-header-reviews-badge .${ELFSIGHT_REVIEWS_APP}{width:280px!important;max-width:none!important;margin:0!important;transform:scale(.68);transform-origin:left center;pointer-events:auto}
html.ar-fp-live-shell .ar-fp-header-reviews-badge a,html.ar-fp-live-shell .ar-fp-header-reviews-badge [class*="BadgeLabel"] a{cursor:pointer!important;text-decoration:none!important;pointer-events:auto!important}
html.ar-fp-live-shell #ar-academy-header-center{grid-column:1/-1;grid-row:1;justify-self:center;align-self:center;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-width:0;max-width:min(640px,calc(100vw - 360px));pointer-events:none;z-index:1}
html.ar-fp-live-shell #ar-academy-header-center-copy{display:flex;flex-direction:column;gap:4px;align-items:center;text-align:center;pointer-events:auto}
html.ar-fp-live-shell #ar-academy-header-title{font-size:28px!important;font-weight:700!important;margin:0;line-height:1.15;color:#fff!important}
html.ar-fp-live-shell #ar-academy-header-subtitle{font-size:15px!important;margin:0;color:#f0f0f0!important;line-height:1.35;font-weight:500}
html.ar-fp-live-shell #ar-academy-header-right{grid-column:3;grid-row:1;justify-self:end;align-self:center;display:flex;align-items:center;gap:14px;z-index:2;position:relative}
html.ar-fp-live-shell #ar-academy-header-right .ar-fp-header-back{display:inline-block;font-size:13px;font-weight:600;color:#fff!important;text-decoration:none!important;padding:8px 16px;border-radius:8px;background:#E57200!important;border:1px solid #E57200!important;line-height:1.3;white-space:nowrap;flex-shrink:0}
html.ar-fp-live-shell #ar-academy-header-right .ar-fp-header-back:hover{background:#c96200!important;border-color:#c96200!important;color:#fff!important}
html.ar-fp-live-shell #ar-academy-header-welcome-text{font-size:14px;line-height:1.35;color:#fff!important}
html.ar-fp-live-shell #ar-academy-header-last-login{font-size:12px;color:#bbb!important;margin-top:4px}
html.ar-fp-live-shell #ar-academy-header-brand-logo{width:130px;height:auto;display:block;filter:brightness(0) invert(1)}
html.ar-fp-live-shell #ar-academy-header-logout-btn{background:transparent;border:1px solid #fff;color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
html.ar-fp-edit-mode #ar-foundation-hub[hidden]{display:block!important;visibility:visible!important}
html.ar-fp-edit-mode #ar-foundation-hub{width:auto!important;max-width:100%!important;margin-left:0!important;margin-right:0!important;min-height:0!important}
#ar-foundation-hub{--ar-bg:#0f1419;--ar-fp-orange:#E57200;--ar-fp-green:#166534;--ar-fp-gold:#c79a3b;--ar-fp-gold-l:#e6c067;--ar-fp-black:#0e0e0e;--ar-fp-panel:#161310;--ar-fp-border:#3a3328;--ar-fp-grey:#b8b8b8;--ar-fp-muted:#888;font-family:"proxima-nova","Helvetica Neue",Arial,sans-serif;line-height:1.5;color:#fff;width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);max-width:none;margin-top:0!important;padding:12px 12px 48px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;background:radial-gradient(1200px 600px at 20% 0%,rgba(229,114,0,.10),transparent 60%),radial-gradient(900px 500px at 85% 20%,rgba(245,158,11,.10),transparent 55%),var(--ar-bg);min-height:calc(100vh - var(--ar-sqsp-nav-offset,0px))}
#ar-foundation-hub>.ar-fp-panel,#ar-foundation-hub>.ar-fp-divider,#ar-foundation-hub>.ar-fp-zone-divider,#ar-foundation-hub>nav{max-width:1100px;width:100%;margin-left:auto;margin-right:auto}
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
.ar-fp-stat--badge{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ar-fp-stat__text{min-width:0;flex:1}
.ar-fp-stat__icon{flex-shrink:0}
#ar-foundation-hub .ar-fp-stat__icon svg,#ar-foundation-hub .ar-fp-stat__icon svg path,#ar-foundation-hub .ar-fp-stat__icon svg circle,#ar-foundation-hub .ar-fp-stat__icon svg rect{stroke:#fff!important;fill:none!important;vector-effect:non-scaling-stroke}
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
#ar-foundation-hub .ar-fp-hiw-icon--badge{width:58px!important;height:58px!important;background:#166534!important;border:1px solid #14532d!important;border-radius:50%!important;box-shadow:0 2px 10px rgba(0,0,0,.45)!important}
#ar-foundation-hub .ar-fp-hiw-icon--badge svg,#ar-foundation-hub .ar-fp-hiw-icon--badge svg path,#ar-foundation-hub .ar-fp-hiw-icon--badge svg circle,#ar-foundation-hub .ar-fp-hiw-icon--badge svg rect{stroke:#fff!important;fill:none!important;vector-effect:non-scaling-stroke}
#ar-foundation-hub .ar-fp-hiw-icon{width:58px;height:58px;margin-bottom:12px;background:#166534;border:1px solid #14532d;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box}
#ar-foundation-hub .ar-fp-hiw-icon svg{width:28px;height:28px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block}
.ar-fp-hiw-card .h{font-size:14px;font-weight:600;margin-bottom:3px}
.ar-fp-hiw-badge-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7fd0a0;margin:-4px 0 6px}
.ar-fp-hiw-card .p{color:var(--ar-fp-grey);font-size:12px;line-height:1.5}
.ar-fp-headline-loading{color:var(--ar-fp-muted);font-size:13px;padding:18px 0;text-align:center}
.ar-fp-panel.bordered[data-fp-loading="true"] .ar-fp-headline-body{display:none}
.ar-fp-panel.bordered[data-fp-loading="false"] .ar-fp-headline-loading{display:none}
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
.ar-fp-mod-btn{position:relative;display:flex;align-items:center;gap:11px;background:var(--ar-fp-panel);border:1px solid var(--ar-fp-border);border-radius:9px;padding:10px 13px;text-decoration:none;color:inherit}
.ar-fp-mod-btn:hover{border-color:var(--ar-fp-orange)}
.ar-fp-mod-btn[data-fp-tip-head]:not([data-fp-tip-desc])::after{content:attr(data-fp-tip-head);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);min-width:180px;max-width:min(340px,92vw);padding:10px 14px;background:#1a1610;border:1px solid var(--ar-fp-gold);border-radius:8px;color:#fff;font-size:12px;font-weight:600;line-height:1.45;text-align:center;white-space:pre-line;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s ease,visibility .15s ease;z-index:30;box-shadow:0 6px 20px rgba(0,0,0,.45)}
.ar-fp-mod-btn[data-fp-tip-desc]::after{content:attr(data-fp-tip-head) "\\A" attr(data-fp-tip-desc);position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%);min-width:180px;max-width:min(340px,92vw);padding:10px 14px;background:#1a1610;border:1px solid var(--ar-fp-gold);border-radius:8px;color:#fff;font-size:12px;font-weight:600;line-height:1.45;text-align:center;white-space:pre-line;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .15s ease,visibility .15s ease;z-index:30;box-shadow:0 6px 20px rgba(0,0,0,.45)}
.ar-fp-mod-btn[data-fp-tip-head]:hover::after,.ar-fp-mod-btn[data-fp-tip-head]:focus-visible::after{opacity:1;visibility:visible}
.ar-fp-mod-btn__cnt{flex-shrink:0;width:30px;height:30px;border-radius:7px;background:#0e0e0e;border:1px solid var(--ar-fp-orange);color:var(--ar-fp-orange);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ar-fp-mod-btn__body{flex:1;min-width:0}
.ar-fp-mod-btn__ttl{color:#e8e8e8;font-size:13px;line-height:1.3}
.ar-fp-mod-btn__tile{flex-shrink:0;color:var(--ar-fp-gold-l);font-size:15px;font-weight:800;background:#1a1610;border:1px solid var(--ar-fp-gold);border-radius:6px;padding:4px 9px;letter-spacing:.03em;line-height:1}
.ar-fp-mod-btn.is-opened{background:#142819;border-color:#2f6b46}
.ar-fp-mod-btn.is-opened:hover{border-color:#4d9468}
.ar-fp-mod-btn.is-opened .ar-fp-mod-btn__cnt{background:#1f7a45;border-color:#7fd0a0;color:#fff}
.ar-fp-mod-btn.is-opened .ar-fp-mod-btn__ttl{color:#cfe8d6}
.ar-fp-mod-btn--soon{opacity:.65;cursor:default}
.ar-fp-mod-btn.is-paid-locked{opacity:.58;cursor:not-allowed;border-color:#3a3a3a;filter:grayscale(.25)}
.ar-fp-mod-btn.is-paid-locked:hover{border-color:#3a3a3a}
.ar-fp-mod-btn.is-paid-locked .ar-fp-mod-btn__cnt{border-color:#666;color:#666}
.ar-fp-mod-btn.is-paid-locked .ar-fp-mod-btn__ttl{color:#999}
.ar-fp-mod-btn.is-paid-locked .ar-fp-mod-btn__tile{color:#999;border-color:#555}
.ar-fp-mod-btn.is-exam-passed{background:#142819;border-color:#2f6b46;cursor:pointer}
.ar-fp-mod-btn.is-exam-passed:hover{border-color:#4d9468}
.ar-fp-mod-btn.is-exam-passed .ar-fp-mod-btn__cnt{background:#1f7a45;border-color:#7fd0a0;color:#fff}
.ar-fp-mod-btn.is-exam-passed .ar-fp-mod-btn__ttl{color:#cfe8d6}
.ar-fp-mod-btn.is-exam-failed{background:#2a1212;border-color:#7a3b3b;cursor:pointer}
.ar-fp-mod-btn.is-exam-failed:hover{border-color:#a44}
.ar-fp-mod-btn.is-exam-failed .ar-fp-mod-btn__cnt{background:#7a2020;border-color:#f0a0a0;color:#fff}
.ar-fp-mod-btn.is-exam-failed .ar-fp-mod-btn__ttl{color:#f0c0c0}
button.ar-fp-mod-btn{text-align:left;width:100%;font:inherit;color:inherit}
.ar-fp-paid-zone.is-trial-locked .ar-fp-map-section__progress{color:#f0a0a0}
.ar-fp-paid-lock-note{color:#f0a0a0;font-size:12px;margin:6px 0 0;font-weight:600}
.ar-fp-divider{border-top:2px dashed #c9c5b8;margin:6px 0}
.ar-fp-paid-group-head{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#e6c067;margin:0}
.ar-fp-paid-group-muted{color:var(--ar-fp-grey);font-weight:600;text-transform:none;letter-spacing:0}
.ar-fp-resource-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.ar-fp-resource-link{font-size:11px;font-weight:700;color:var(--ar-fp-orange)!important;border:1px solid var(--ar-fp-orange);border-radius:50px;padding:6px 12px;text-decoration:none!important;white-space:nowrap}
.ar-fp-resource-link:hover{background:rgba(229,114,0,.12);color:#fff!important}
.ar-fp-faq-list{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.ar-fp-faq-item{background:var(--ar-fp-panel);border:1px solid var(--ar-fp-border);border-radius:9px;padding:0;overflow:hidden}
.ar-fp-faq-item summary{cursor:pointer;list-style:none;padding:12px 16px;font-size:14px;font-weight:600;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}
.ar-fp-faq-item summary::-webkit-details-marker{display:none}
.ar-fp-faq-item summary::after{content:"+";color:var(--ar-fp-orange);font-size:18px;font-weight:700;line-height:1}
.ar-fp-faq-item[open] summary::after{content:"−"}
.ar-fp-faq-body{padding:0 16px 14px;color:var(--ar-fp-grey);font-size:13px;line-height:1.65}
.ar-fp-faq-body p{margin:0}
.ar-fp-top-collapsible__head{margin:0 0 12px}
.ar-fp-top-collapsible.is-fp-expanded .ar-fp-top-collapsible__head{margin-bottom:16px}
.ar-fp-top-collapsible__toggle{display:flex;align-items:center;gap:12px;border:none;background:transparent;padding:0;cursor:pointer;font:inherit;color:inherit;text-align:left;width:100%}
.ar-fp-top-collapsible__toggle:focus-visible{outline:2px solid var(--ar-fp-orange);outline-offset:2px;border-radius:6px}
.ar-fp-top-collapsible__toggle-control,.ar-fp-collapsible__toggle-control{display:inline-flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;min-width:44px}
.ar-fp-top-collapsible__chevron,.ar-fp-collapsible__chevron{display:inline-flex;width:22px;height:22px;color:#fff;transition:transform .2s ease}
.ar-fp-top-collapsible__chevron svg,.ar-fp-collapsible__chevron svg{width:22px;height:22px;display:block}
.ar-fp-top-collapsible:not(.is-fp-expanded) .ar-fp-top-collapsible__chevron,.ar-fp-map-section:not(.is-fp-expanded) .ar-fp-collapsible__chevron{transform:rotate(180deg)}
.ar-fp-top-collapsible__hint,.ar-fp-collapsible__hint{font-size:11px;font-weight:600;color:var(--ar-fp-muted);line-height:1.2;white-space:nowrap}
.ar-fp-top-collapsible__title{font-size:20px;font-weight:700;line-height:1.25;color:#fff}
#ar-fp-hiw-panel .ar-fp-top-collapsible__title{font-size:16px;font-weight:600}
.ar-fp-top-collapsible:not(.is-fp-expanded) .ar-fp-top-collapsible__body{display:none}
.ar-fp-map-section__head{display:flex;align-items:center;gap:12px;width:100%;border:none;background:transparent;padding:0;margin:0 0 8px;cursor:pointer;font:inherit;color:inherit;text-align:left}
.ar-fp-map-section__head:focus-visible{outline:2px solid var(--ar-fp-orange);outline-offset:2px;border-radius:6px}
.ar-fp-map-section__meta{display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 auto}
.ar-fp-map-section__icon{flex-shrink:0;color:var(--ar-fp-orange);font-size:14px;line-height:1}
.ar-fp-map-section__title{font-size:16px;font-weight:600;color:#fff;line-height:1.3}
.ar-fp-map-section__progress{flex:0 0 auto;font-size:12px;font-weight:700;color:#7fd0a0;white-space:nowrap;margin-left:auto}
.ar-fp-map-section:not(.is-fp-expanded) .ar-fp-map-section__body{display:none}
.ar-fp-map-section.is-fp-expanded .ar-fp-map-section__head{margin-bottom:10px}
.ar-fp-zone-divider--members{margin:14px 0 16px;padding:16px 20px;border:2px solid var(--ar-fp-gold);border-radius:12px;background:linear-gradient(90deg,rgba(229,114,0,.18),rgba(198,154,59,.12));text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.28)}
.ar-fp-zone-divider__label{display:block;font-size:15px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#e6c067;line-height:1.3}
.ar-fp-zone-divider__sub{display:block;margin-top:6px;font-size:12px;font-weight:600;color:var(--ar-fp-grey);line-height:1.4}
html.ar-fp-edit-mode .ar-fp-map-section,html.ar-fp-edit-mode .ar-fp-top-collapsible{display:block!important}
html.ar-fp-edit-mode .ar-fp-map-section__body,html.ar-fp-edit-mode .ar-fp-top-collapsible__body{display:block!important}
@media(max-width:640px){.ar-fp-panel{padding:18px 16px}.ar-fp-hl-title{font-size:20px}.ar-fp-map-section__head{flex-wrap:wrap}.ar-fp-map-section__progress{width:100%;padding-left:56px;margin-left:0}html.ar-fp-live-shell #ar-academy-header-container{min-height:108px;padding:16px 18px}html.ar-fp-live-shell #ar-academy-header-welcome{flex-direction:column;align-items:flex-start;gap:8px}html.ar-fp-live-shell .ar-fp-header-reviews-badge{max-width:min(100%,260px);min-height:48px}html.ar-fp-live-shell .ar-fp-header-reviews-badge .${ELFSIGHT_REVIEWS_APP}{transform:scale(.62)}html.ar-fp-live-shell #ar-academy-header-center{max-width:min(92vw,calc(100vw - 24px))}html.ar-fp-live-shell #ar-academy-header-title{font-size:22px!important}html.ar-fp-live-shell #ar-academy-header-subtitle{font-size:13px!important}html.ar-fp-live-shell #ar-academy-header-right .ar-fp-header-back{font-size:12px;padding:7px 12px}}
</style>

<div class="ar-fp-panel bordered ar-fp-top-collapsible is-fp-expanded" id="ar-fp-headline-panel" data-fp-loading="true" data-fp-top-collapse="headline">
  <div class="ar-fp-top-collapsible__head">
    <button type="button" class="ar-fp-top-collapsible__toggle" id="ar-fp-headline-toggle" aria-expanded="true" aria-controls="ar-fp-headline-collapsible-body">
      <span class="ar-fp-top-collapsible__toggle-control ar-fp-collapsible__toggle-control">
        <span class="ar-fp-collapsible__chevron" aria-hidden="true">${FP_COLLAPSE_CHEVRON}</span>
        <span class="ar-fp-collapsible__hint" id="ar-fp-headline-toggle-hint">hide me</span>
      </span>
      <span class="ar-fp-top-collapsible__title">Your photography Academy</span>
    </button>
  </div>
  <div class="ar-fp-top-collapsible__body" id="ar-fp-headline-collapsible-body">
  <div class="ar-fp-headline-loading" id="ar-fp-headline-loading">Loading your Academy progress…</div>
  <div class="ar-fp-headline-body">
  <div class="ar-fp-hl-top">
    <div><div class="ar-fp-hl-sub">Your complete course map — Foundation, Applied Learning and RPS distinctions. Earn your way from Enrolled to Master.</div></div>
    <div id="ar-fp-membership-badge"></div>
  </div>
  <div class="ar-fp-stats">
    <div class="ar-fp-stat ar-fp-stat--badge">
      <div class="ar-fp-stat__text"><div class="l">Badge</div><div class="v" id="ar-fp-stat-badge">Enrolled</div></div>
      ${statBadgeIconHtml("ti-school", "green")}
    </div>
    <div class="ar-fp-stat"><div class="l">Modules opened</div><div class="v"><span id="ar-fp-stat-modules">0</span> <span>/ 60</span></div></div>
    <div class="ar-fp-stat"><div class="l">Exams passed</div><div class="v"><span id="ar-fp-stat-exams">0</span> <span>/ 15</span></div></div>
  </div>
  <div class="ar-fp-prow"><span class="l" id="ar-fp-progress-label">Next badge: Foundation</span><span class="r" id="ar-fp-progress-pct">0%</span></div>
  <div class="ar-fp-track"><div class="ar-fp-fill" id="ar-fp-progress-fill"></div></div>
  <div class="ar-fp-hint" id="ar-fp-progress-hint"></div>
  <div class="ar-fp-cta"><a class="ar-fp-btn ar-fp-btn-orange" id="ar-fp-primary-cta" href="${SITE}/blog-on-photography/what-is-exposure-in-photography">Start with module 01: Exposure →</a></div>
  <div class="ar-fp-mapnote">This page is your full course map. Your dashboard is where you pick up day to day. <a href="${SITE}/academy/dashboard">→ Go to dashboard</a></div>
  </div>
  </div>
</div>

<div class="ar-fp-panel ar-fp-top-collapsible is-fp-expanded" id="ar-fp-hiw-panel" data-fp-top-collapse="hiw">
  <div class="ar-fp-top-collapsible__head">
    <button type="button" class="ar-fp-top-collapsible__toggle" id="ar-fp-hiw-toggle" aria-expanded="true" aria-controls="ar-fp-hiw-collapsible-body">
      <span class="ar-fp-top-collapsible__toggle-control ar-fp-collapsible__toggle-control">
        <span class="ar-fp-collapsible__chevron" aria-hidden="true">${FP_COLLAPSE_CHEVRON}</span>
        <span class="ar-fp-collapsible__hint" id="ar-fp-hiw-toggle-hint">hide me</span>
      </span>
      <span class="ar-fp-top-collapsible__title">New here? How your Academy works</span>
    </button>
  </div>
  <div class="ar-fp-top-collapsible__body" id="ar-fp-hiw-collapsible-body">
  <div class="ar-fp-hiw-sub">You learn at your own pace — the Academy tracks your Foundation progress automatically and always shows you what to do next.</div>
  <div class="ar-fp-hiw-grid" data-ar-fp-hiw="badge-green-v2">${hiwCardsHtml()}</div>
  </div>
</div>

<div class="ar-fp-panel"><div class="ar-fp-zone-head"><span class="t">Foundation course</span><span class="ar-fp-zone-badge ar-fp-zb-tracked">Tracked · 60 modules</span></div><p class="ar-fp-zone-sub">The core path — camera, gear, composition, genre and 15 practice assignments. Opening these counts toward your badges.</p></div>
${zone1}

<div class="ar-fp-divider"></div>
${examsZoneHtml}

<div class="ar-fp-zone-divider ar-fp-zone-divider--members" role="separator" aria-label="Members-only modules and resources">
  <span class="ar-fp-zone-divider__label">Members-only modules &amp; resources</span>
  <span class="ar-fp-zone-divider__sub">Practice packs, checklists, Applied Learning and RPS — included with paid membership</span>
</div>
${practicePacksZoneHtml}
${checklistsZoneHtml}
${appliedZoneHtml}
${rpsZoneHtml}

<div class="ar-fp-divider"></div>
<div class="ar-fp-panel">
  <div class="ar-fp-sec-head"><span>🎁</span> Support and resources</div>
  <p class="ar-fp-sec-intro">Two support resources whenever you are stuck.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="ar-fp-btn ar-fp-btn-gold" href="${SITE}/academy/photography-questions-answers">Open Q&amp;A library →</a><a class="ar-fp-btn ar-fp-btn-gold" href="${SITE}/academy-robo-ranger">Ask Robo-Ranger AI →</a></div>
</div>
<div class="ar-fp-panel">
  <div class="ar-fp-sec-head" style="color:#fff">FAQs</div>
  <p class="ar-fp-sec-intro" id="ar-fp-faq-intro">Common questions about the Foundation course and your 14-day trial.</p>
  <div class="ar-fp-faq-list">${faqAccordionHtml()}</div>
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
  var PRACTICE_PACK_URLS = ${practicePackUrlsJson};
  var CHECKLIST_URLS = ${checklistUrlsJson};
  var FP_MAP_SECTION_SPECS = ${fpMapSectionsJson};
  var FP_COLLAPSE_KEY = "ar-fp-collapse-v1";
  var JOURNEY_ICON_SVGS = ${journeyIconsJson};
  var BADGE_GREEN = "#166534";
  var BADGE_GREEN_BORDER = "#14532d";
  var BADGE_GOLD = "#b45309";
  var BADGE_GOLD_BORDER = "#92400e";
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
    try {
      var p = (location.pathname || "").replace(/\\/$/, "") || "/";
      if (p === FP_PATH) return true;
      if (p.indexOf("online-photography-course") !== -1) return true;
      return !!document.getElementById("ar-foundation-hub");
    } catch(e){ return false; }
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
    if (j.json && typeof j.json === "object") return j.json;
    return j;
  }
  function pathIsOpened(openedMap, canonical){
    if (!openedMap || !canonical) return false;
    var target = normalizePath(canonical);
    if (!target) return false;
    if (openedMap[canonical] || openedMap[target]) return true;
    return Object.keys(openedMap).some(function(k){ return normalizePath(k) === target; });
  }
  function buildOpenedSet(normalized){
    var opened = getOpenedMap(normalized);
    var set = new Set();
    Object.keys(opened).forEach(function(k){
      var nk = normalizePath(k);
      if (nk) set.add(nk);
    });
    FOUNDATION_PATHS.forEach(function(p){
      if (pathIsOpened(opened, p)) set.add(normalizePath(p));
    });
    return set;
  }
  function getOpenedMap(normalized){
    return (normalized && normalized.arAcademy && normalized.arAcademy.modules && normalized.arAcademy.modules.opened) || {};
  }
  function fpEscHtml(s){
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function titleFromPath(path, opened){
    var key = normalizePath(path);
    var rec = opened[path] || opened[key];
    if (rec && rec.t) return rec.t;
    var parts = String(path || "").split("/").filter(function(p){ return p; });
    var slug = parts[parts.length - 1] || "";
    return slug.replace(/-/g, " ").replace(/\\b\\w/g, function(l){ return l.toUpperCase(); });
  }
  function countOpenedUrls(opened, urls){
    var n = 0;
    for (var i = 0; i < urls.length; i++) {
      if (pathIsOpened(opened, urls[i])) n += 1;
    }
    return n;
  }
  function buildExamPageUrl(moduleId){
    var base = "/academy/photography-exams-certification";
    if (!moduleId) return SITE + base;
    return SITE + base + "?module=" + encodeURIComponent(String(moduleId));
  }
  function renderExamsSection(examData){
    var tip = document.getElementById("ar-fp-exams-tip");
    var progress = document.getElementById("ar-fp-section-progress-exams");
    var grid = document.getElementById("ar-fp-exams-grid");
    if (!grid) return;
    var modules = examData && examData.modules ? examData.modules : [];
    var passed = examData && examData.summary ? safeNum(examData.summary.passedCount, 0) : 0;
    var failed = examData && examData.summary ? safeNum(examData.summary.failedCount, 0) : 0;
    if (progress) {
      progress.textContent = passed > 0 || failed > 0 ? (passed + "/15 passed") : "15 exams";
    }
    if (tip) {
      if (passed > 0 || failed > 0) {
        var tipText = passed + "/15 modules passed";
        if (failed > 0) tipText += " • " + failed + " failed";
        var remaining = 15 - passed - failed;
        if (remaining > 0) tipText += " • " + remaining + " not started";
        tip.textContent = tipText;
      } else {
        tip.textContent = "Resume an exam or download your latest results.";
      }
    }
    if (!modules.length) {
      grid.innerHTML = "";
      return;
    }
    var html = "";
    modules.forEach(function(mod, idx){
      var status = mod.status || "not_taken";
      var statusClass = status === "passed" ? " is-exam-passed" : (status === "failed" ? " is-exam-failed" : "");
      var title = mod.name || ("Exam " + mod.label);
      var tooltip = title;
      if (status === "passed" && mod.bestScore) tooltip += " — Passed (" + mod.bestScore + "%)";
      else if (status === "failed" && mod.bestScore) tooltip += " — Failed (Best: " + mod.bestScore + "%)";
      else if (status === "not_taken") tooltip += " — Not started";
      var tileTag = "E" + String(idx + 1).padStart(2, "0");
      html += '<button type="button" class="ar-fp-mod-btn' + statusClass + '" data-module-id="' + fpEscHtml(mod.moduleId) + '" title="' + fpEscHtml(tooltip) + '">';
      html += '<span class="ar-fp-mod-btn__cnt">' + fpEscHtml(String(idx + 1)) + '</span>';
      html += '<span class="ar-fp-mod-btn__body"><span class="ar-fp-mod-btn__ttl">' + fpEscHtml(displayTitle(title)) + '</span></span>';
      html += '<span class="ar-fp-mod-btn__tile">' + tileTag + '</span></button>';
    });
    grid.innerHTML = html;
    grid.querySelectorAll(".ar-fp-mod-btn[data-module-id]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var moduleId = btn.getAttribute("data-module-id");
        if (moduleId) location.href = buildExamPageUrl(moduleId);
      });
    });
  }
  function displayTitle(t){ return String(t || "").replace(/^\\d+\\s+/, ""); }
  var FP_PAID_SECTION_IDS = { "practice-packs": 1, "checklists": 1, "applied-learning": 1, "rps-distinctions": 1 };
  function formatMapSectionProgress(opened, total, trialLocked){
    if (trialLocked) return "Paid only · 0/" + total + " opened";
    return opened + "/" + total + " opened";
  }
  function findNextUnopenedModule(openedSet){
    var nav = globalThis.__arAcademyModuleNav;
    if (nav && typeof nav.findNextUnopenedModule === "function") {
      return nav.findNextUnopenedModule(openedSet, -1);
    }
    for (var i = 0; i < ARTICLE_MODULES.length; i++) {
      if (!openedSet.has(normalizePath(ARTICLE_MODULES[i].p))) {
        return { index: i, path: ARTICLE_MODULES[i].p, title: ARTICLE_MODULES[i].t };
      }
    }
    return null;
  }
  function shortModTitle(t){ return String(t||"").replace(/^\\d+\\s+/, ""); }
  function getPlanConnections(member){
    var d = member && member.data ? member.data : member;
    return (d && d.planConnections) || [];
  }
  function isActivePlanConnection(pc){
    if (!pc || pc.active === false) return false;
    var status = String(pc.status || "").toUpperCase();
    if (status === "CANCELED" || status === "CANCELLED" || status === "EXPIRED" || status === "ENDED") return false;
    return true;
  }
  function hasTrialAccess(member){
    return getPlanConnections(member).some(function(pc){
      return pc && pc.planId === TRIAL_PLAN_ID && isActivePlanConnection(pc);
    });
  }
  function hasAnyNonTrialPlan(member){
    return getPlanConnections(member).some(function(pc){
      return pc && pc.planId && pc.planId !== TRIAL_PLAN_ID && isActivePlanConnection(pc);
    });
  }
  function hasAnnualAccess(member){
    return getPlanConnections(member).some(function(pc){
      return pc && isActivePlanConnection(pc) && pc.planId && pc.planId.indexOf("annual") >= 0;
    });
  }
  function isPaidMember(member, engagement){
    if (engagement && engagement.isTrial === true) return false;
    if (engagement && engagement.hasConverted === true) return true;
    if (hasAnnualAccess(member)) return true;
    if (hasAnyNonTrialPlan(member)) return true;
    if (engagement && engagement.isTrial === false && engagement.hasConverted === false) {
      var plan = engagement.planId || (engagement.trial && engagement.trial.planId);
      if (plan && plan !== TRIAL_PLAN_ID) return true;
    }
    return false;
  }
  function isTrialMember(member, engagement){
    if (engagement && engagement.isTrial === true) return true;
    if (engagement && engagement.hasConverted === true) return false;
    if (isPaidMember(member, engagement)) return false;
    return hasTrialAccess(member);
  }
  function shouldLockPaidResources(member, engagement){
    return isTrialMember(member, engagement);
  }
  async function fetchMemberBundle(ms, opts){
    opts = opts || {};
    if (globalThis.__arMsReader && ms) {
      try {
        var bundle = await globalThis.__arMsReader.fetchBundle(ms, opts);
        return {
          member: bundle.member,
          normalized: bundle.memberJson || normalizeMemberJson(bundle.rawJson)
        };
      } catch(e){}
    }
    if (!ms || typeof ms.getCurrentMember !== "function") return { member: null, normalized: {} };
    try {
      var res = await ms.getCurrentMember();
      var member = res && res.data ? res : (res && res.email ? { id: res.id, data: res } : null);
      var normalized = {};
      if (member && typeof ms.getMemberJSON === "function") {
        var jsonRes = await ms.getMemberJSON();
        normalized = normalizeMemberJson(jsonRes);
      }
      return { member: member, normalized: normalized };
    } catch(e2){
      return { member: null, normalized: {} };
    }
  }
  function showPaidOnlyAccessMessage(){
    globalThis.alert("Paid membership only: upgrade to access this content.");
  }
  function wirePaidLockClicks(){
    document.querySelectorAll("#ar-foundation-hub [data-fp-paid='1']").forEach(function(linkEl){
      if (linkEl.getAttribute("data-fp-paid-lock-wired") === "true") return;
      linkEl.addEventListener("click", function(event){
        if (linkEl.getAttribute("aria-disabled") !== "true" && linkEl.getAttribute("href")) return;
        if (event) { event.preventDefault(); event.stopPropagation(); }
        showPaidOnlyAccessMessage();
      });
      linkEl.setAttribute("data-fp-paid-lock-wired", "true");
    });
  }
  function lockPaidResourceTiles(isTrial){
    document.querySelectorAll("#ar-foundation-hub .ar-fp-paid-zone").forEach(function(el){
      el.classList.toggle("is-trial-locked", isTrial);
    });
    var appliedNote = document.getElementById("ar-fp-applied-lock-note");
    var rpsNote = document.getElementById("ar-fp-rps-lock-note");
    var packsNote = document.getElementById("ar-fp-practice-packs-lock-note");
    var listsNote = document.getElementById("ar-fp-checklists-lock-note");
    if (appliedNote) appliedNote.hidden = !isTrial;
    if (rpsNote) rpsNote.hidden = !isTrial;
    if (packsNote) packsNote.hidden = !isTrial;
    if (listsNote) listsNote.hidden = !isTrial;
    document.querySelectorAll("#ar-foundation-hub [data-fp-paid='1']").forEach(function(linkEl){
      linkEl.classList.toggle("is-paid-locked", isTrial);
      if (isTrial) {
        var href = linkEl.getAttribute("href");
        if (href) linkEl.dataset.href = href;
        linkEl.removeAttribute("href");
        linkEl.setAttribute("aria-disabled", "true");
        linkEl.setAttribute("tabindex", "-1");
        return;
      }
      var storedHref = linkEl.dataset.href;
      if (storedHref) linkEl.setAttribute("href", storedHref);
      linkEl.removeAttribute("aria-disabled");
      linkEl.removeAttribute("tabindex");
    });
  }
  function applyFaqTrialCopy(isTrial){
    var intro = document.getElementById("ar-fp-faq-intro");
    if (intro) {
      intro.textContent = isTrial
        ? "Common questions about the Foundation course and your 14-day trial."
        : "Common questions about the Foundation course.";
    }
    document.querySelectorAll("#ar-foundation-hub [data-fp-trial-only='1']").forEach(function(el){
      el.hidden = !isTrial;
    });
  }
  function safeDate(v){
    if (!v) return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function getTrialEndsAt(member, engagement){
    if (engagement && engagement.trial && engagement.trial.endsAt) {
      var fromApi = safeDate(engagement.trial.endsAt);
      if (fromApi) return fromApi;
    }
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
  async function fetchExamProgress(memberId, skipCache){
    if (!memberId) return null;
    var cacheKey = "ar-exam-progress-" + memberId;
    if (!skipCache) {
      try {
        var raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          var cached = JSON.parse(raw);
          if (cached && cached.at && Date.now() - cached.at < 300000) return cached.data;
        }
      } catch(e){}
    }
    try {
      var res = await fetch(PROGRESS_URL, { headers: { "X-Memberstack-Id": memberId } });
      if (!res.ok) return null;
      var data = await res.json();
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: data })); } catch(e2){}
      return data;
    } catch(e){ return null; }
  }
  async function fetchEngagementSummary(memberId, skipCache){
    if (!memberId) return null;
    var cacheKey = "ar-engagement-" + memberId;
    if (!skipCache) {
      try {
        var raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          var cached = JSON.parse(raw);
          if (cached && cached.at && Date.now() - cached.at < 300000) return cached.data;
        }
      } catch(e){}
    }
    try {
      var res = await fetch(ENGAGEMENT_URL, { headers: { "X-Memberstack-Id": memberId, Accept: "application/json" } });
      if (!res.ok) return null;
      var data = await res.json();
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: data })); } catch(e2){}
      return data;
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
    document.querySelectorAll("#ar-foundation-hub [data-fp-tracked='1'],#ar-foundation-hub [data-fp-resource='1']").forEach(function(el){
      var p = el.getAttribute("data-fp-path");
      if (p && openedSet.has(normalizePath(p))) el.classList.add("is-opened");
    });
  }
  function renderMembershipBadge(member, engagement){
    var el = document.getElementById("ar-fp-membership-badge");
    if (!el) return;
    if (isTrialMember(member, engagement)) {
      var end = getTrialEndsAt(member, engagement);
      var d = engagement && typeof engagement.daysLeftInTrial === "number" ? engagement.daysLeftInTrial : daysLeft(end);
      el.innerHTML = '<div class="ar-fp-trial"><div class="lbl">Trial</div><div class="big">' + (d != null ? d : "—") + ' days left</div></div>';
    } else if (member || (engagement && !engagement.isTrial)) {
      el.innerHTML = '<div class="ar-fp-member">Member · active</div>';
    } else {
      el.innerHTML = "";
    }
  }
  function journeyIconSvg(iconClass){
    var svg = JOURNEY_ICON_SVGS[iconClass] || JOURNEY_ICON_SVGS["ti-school"];
    return svg.replace("<svg ", '<svg style="width:22px!important;height:22px!important;display:block!important;stroke:#fff!important;fill:none!important" ');
  }
  function applyStatBadgeIcon(badge){
    var iconEl = document.getElementById("ar-fp-stat-badge-icon");
    if (!iconEl) return;
    var iconClass = (badge && badge.iconClass) || "ti-school";
    var colour = (badge && badge.colour) || "green";
    iconEl.innerHTML = journeyIconSvg(iconClass);
    iconEl.style.setProperty("background", colour === "gold" ? BADGE_GOLD : BADGE_GREEN, "important");
    iconEl.style.setProperty("border-color", colour === "gold" ? BADGE_GOLD_BORDER : BADGE_GREEN_BORDER, "important");
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
    applyStatBadgeIcon(current || { iconClass: "ti-school", colour: "green" });
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

  // BEGIN BADGE-GATES-SYNC
  // END BADGE-GATES-SYNC

  function defaultFoundationCollapseState(){
    var state = { headline: true, hiw: true };
    FP_MAP_SECTION_SPECS.forEach(function(spec){
      state[spec.id] = spec.id === "foundation-0";
    });
    return state;
  }
  function readFoundationCollapseState(){
    try {
      var raw = sessionStorage.getItem(FP_COLLAPSE_KEY);
      if (!raw) return defaultFoundationCollapseState();
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return defaultFoundationCollapseState();
      var base = defaultFoundationCollapseState();
      Object.keys(base).forEach(function(key){
        if (typeof parsed[key] === "boolean") base[key] = parsed[key];
      });
      return base;
    } catch(e){ return defaultFoundationCollapseState(); }
  }
  function saveFoundationCollapseState(state){
    try { sessionStorage.setItem(FP_COLLAPSE_KEY, JSON.stringify(state || {})); } catch(e){}
  }
  function setTopCollapsibleExpanded(key, expanded){
    var panel = document.querySelector('[data-fp-top-collapse="' + key + '"]');
    var toggle = key === "headline" ? document.getElementById("ar-fp-headline-toggle") : document.getElementById("ar-fp-hiw-toggle");
    var hint = key === "headline" ? document.getElementById("ar-fp-headline-toggle-hint") : document.getElementById("ar-fp-hiw-toggle-hint");
    if (!panel || !toggle) return;
    panel.classList.toggle("is-fp-expanded", !!expanded);
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (hint) hint.textContent = expanded ? "hide me" : "show me";
  }
  function setMapSectionExpanded(sectionId, expanded){
    var panel = document.querySelector('.ar-fp-map-section[data-fp-section-id="' + sectionId + '"]');
    var head = panel ? panel.querySelector(".ar-fp-map-section__head") : null;
    var hint = document.getElementById("ar-fp-section-hint-" + sectionId);
    if (!panel || !head) return;
    panel.classList.toggle("is-fp-expanded", !!expanded);
    head.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (hint) hint.textContent = expanded ? "hide me" : "show me";
  }
  function applyFoundationCollapseState(state){
    if (isSqspEditMode()) {
      document.querySelectorAll(".ar-fp-top-collapsible,.ar-fp-map-section").forEach(function(el){
        el.classList.add("is-fp-expanded");
      });
      return;
    }
    setTopCollapsibleExpanded("headline", !!state.headline);
    setTopCollapsibleExpanded("hiw", !!state.hiw);
    FP_MAP_SECTION_SPECS.forEach(function(spec){
      setMapSectionExpanded(spec.id, !!state[spec.id]);
    });
  }
  function updateMapSectionProgress(openedSet, engagement, normalized, trialLocked){
    var openedMap = getOpenedMap(normalized || {});
    FP_MAP_SECTION_SPECS.forEach(function(spec){
      var el = document.getElementById("ar-fp-section-progress-" + spec.id);
      if (!el) return;
      if (spec.id === "exams") return;
      var opened = 0;
      if (spec.id === "applied-learning" && engagement && typeof engagement.appliedLearningOpened === "number") {
        opened = engagement.appliedLearningOpened;
      } else {
        (spec.paths || []).forEach(function(p){
          if (pathIsOpened(openedMap, p) || openedSet.has(normalizePath(p))) opened += 1;
        });
      }
      if (FP_PAID_SECTION_IDS[spec.id]) {
        el.textContent = formatMapSectionProgress(opened, spec.total, !!trialLocked);
        return;
      }
      el.textContent = opened + "/" + spec.total + " opened";
    });
  }
  function wireFoundationCollapsibles(){
    if (document.getElementById("ar-foundation-hub") && document.getElementById("ar-foundation-hub").getAttribute("data-fp-collapse-wired") === "1") return;
    var state = readFoundationCollapseState();
    applyFoundationCollapseState(state);
    function bindTop(key, toggleId){
      var toggle = document.getElementById(toggleId);
      if (!toggle || toggle.getAttribute("data-fp-wired")) return;
      toggle.addEventListener("click", function(){
        var panel = document.querySelector('[data-fp-top-collapse="' + key + '"]');
        if (!panel) return;
        var expanded = !panel.classList.contains("is-fp-expanded");
        state[key] = expanded;
        setTopCollapsibleExpanded(key, expanded);
        saveFoundationCollapseState(state);
      });
      toggle.setAttribute("data-fp-wired", "1");
    }
    bindTop("headline", "ar-fp-headline-toggle");
    bindTop("hiw", "ar-fp-hiw-toggle");
    document.querySelectorAll(".ar-fp-map-section__head").forEach(function(head){
      if (head.getAttribute("data-fp-wired")) return;
      head.addEventListener("click", function(){
        var panel = head.closest(".ar-fp-map-section");
        if (!panel) return;
        var sectionId = panel.getAttribute("data-fp-section-id");
        if (!sectionId) return;
        var expanded = !panel.classList.contains("is-fp-expanded");
        state[sectionId] = expanded;
        setMapSectionExpanded(sectionId, expanded);
        saveFoundationCollapseState(state);
      });
      head.setAttribute("data-fp-wired", "1");
    });
    var hub = document.getElementById("ar-foundation-hub");
    if (hub) hub.setAttribute("data-fp-collapse-wired", "1");
  }

  function isSqspEditMode(){
    try {
      if (document.documentElement.classList.contains("ar-fp-edit-mode")) return true;
      if (window.self !== window.top) return true;
      if ((location.pathname || "").indexOf("/config/") === 0) return true;
    } catch(e){}
    return false;
  }
  function ensureFoundationHeaderSticky(){
    var h = document.getElementById("ar-academy-header-container");
    if (!h) return;
    h.style.setProperty("position", "sticky", "important");
    h.style.setProperty("top", "0", "important");
    h.style.setProperty("z-index", "998", "important");
  }
  function collapseFoundationLayoutGap(){
    var hub = document.getElementById("ar-foundation-hub");
    if (!hub) return;
    var sec = hub.closest(".page-section");
    if (sec) {
      sec.style.setProperty("padding-top", "0", "important");
      sec.style.setProperty("padding-bottom", "0", "important");
      sec.style.setProperty("margin-top", "0", "important");
      sec.style.setProperty("min-height", "0", "important");
      var sib = sec.previousElementSibling;
      while (sib) {
        if (sib.classList && sib.classList.contains("page-section") && !sib.querySelector("#ar-foundation-hub")) {
          var empty = !sib.querySelector("img,video,iframe,.sqs-block-html,.sqs-block-code,.sqs-block-form,.Header") && (sib.textContent || "").trim().length < 2;
          if (empty) sib.style.setProperty("display", "none", "important");
        }
        sib = sib.previousElementSibling;
      }
    }
    var block = hub.closest(".sqs-block");
    if (block) {
      block.style.setProperty("padding-top", "0", "important");
      block.style.setProperty("margin-top", "0", "important");
    }
  }
  function relocateHeaderAboveHub(){
    var hub = document.getElementById("ar-foundation-hub");
    var header = document.getElementById("ar-academy-header-container");
    if (!hub || !header || header.nextElementSibling === hub) return;
    var parent = hub.parentNode;
    if (parent) parent.insertBefore(header, hub);
  }
  function bootAppShell(){
    if (isSqspEditMode()) return;
    try {
      document.documentElement.classList.add("ar-academy", "ar-fp-app-shell", "ar-fp-live-shell");
      document.documentElement.style.setProperty("--ar-sqsp-nav-offset", "0px");
      mountAcademyHeader();
      relocateHeaderAboveHub();
      collapseFoundationLayoutGap();
      applyFoundationHeaderCopy();
      ensureFoundationHeaderBackLink();
      ensureFoundationHeaderSticky();
      if (window.__arAcademyLayout && window.__arAcademyLayout.schedule) window.__arAcademyLayout.schedule();
      relocateHeaderAboveHub();
      collapseFoundationLayoutGap();
      applyFoundationHeaderCopy();
      ensureFoundationHeaderBackLink();
      ensureFoundationHeaderSticky();
    } catch(e){}
  }
  function applyFoundationHeaderCopy(){
    var title = document.getElementById("ar-academy-header-title");
    var sub = document.getElementById("ar-academy-header-subtitle");
    if (title) title.textContent = "Photography Course Modules Map";
    if (sub) sub.textContent = "Your photography Academy";
    var icon = document.getElementById("ar-academy-header-logo-icon");
    if (icon) icon.style.display = "none";
  }
  function mountAcademyHeader(){
    if (document.getElementById("ar-academy-header-container")) {
      applyFoundationHeaderCopy();
      ensureFoundationHeaderBackLink();
      ensureFoundationHeaderReviewsBadge();
      return true;
    }
    try {
      if (window.__arAcademyHeader && window.__arAcademyHeader.mount) {
        window.__arAcademyHeader.mount();
        if (window.__arAcademyHeader.applyFoundationCopy) window.__arAcademyHeader.applyFoundationCopy();
        applyFoundationHeaderCopy();
        ensureFoundationHeaderBackLink();
        ensureFoundationHeaderReviewsBadge();
        if (document.getElementById("ar-academy-header-container")) return true;
      }
    } catch(e){}
    var tpl = document.getElementById("ar-academy-header-template") || document.getElementById("ar-fp-header-fallback-template");
    if (!tpl || !tpl.content || !tpl.content.firstElementChild) return false;
    var el = tpl.content.firstElementChild.cloneNode(true);
    applyFoundationHeaderCopy();
    var hub = document.getElementById("ar-foundation-hub");
    var anchor = hub && hub.parentNode;
    if (anchor) anchor.insertBefore(el, hub);
    else {
      var page = document.getElementById("page") || document.getElementById("siteWrapper") || document.body;
      if (page) page.insertBefore(el, page.firstChild);
    }
    el.style.display = "grid";
    ensureFoundationHeaderSticky();
    ensureFoundationHeaderBackLink();
    ensureFoundationHeaderReviewsBadge();
    wireHeaderLogout();
    return true;
  }
  function ensureFoundationHeaderBackLink(){
    var topBack = document.getElementById("ar-fp-top-back");
    if (topBack) topBack.remove();
    var right = document.getElementById("ar-academy-header-right");
    if (!right) return;
    var link = document.getElementById("ar-fp-header-back");
    if (!link) {
      link = document.createElement("a");
      link.id = "ar-fp-header-back";
      link.className = "ar-fp-header-back";
      link.href = SITE + "/academy/dashboard";
      link.textContent = "← Back to dashboard";
    }
    var brand = document.getElementById("ar-academy-header-brand");
    if (brand && brand.parentNode === right) {
      if (link.parentNode !== right || link.nextElementSibling !== brand) right.insertBefore(link, brand);
    } else if (link.parentNode !== right) {
      right.insertBefore(link, right.firstChild);
    }
  }
  function wireHeaderLogout(){
    var btn = document.getElementById("ar-academy-header-logout-btn");
    if (!btn || btn.getAttribute("data-fp-wired")) return;
    btn.addEventListener("click", function(e){
      e.preventDefault();
      var ms = window.$memberstackDom;
      if (ms && typeof ms.logout === "function") ms.logout().then(function(){ location.href = "/academy/login"; }).catch(function(){ location.href = "/academy/login"; });
      else location.href = "/academy/login";
    });
    btn.setAttribute("data-fp-wired", "1");
  }
  function syncHeaderWelcome(member){
    if (!member || !member.data) return;
    var welcome = document.getElementById("ar-academy-header-welcome");
    var nameEl = document.getElementById("ar-academy-header-welcome-name");
    if (!nameEl) return;
    var cf = member.data.customFields || {};
    var first = cf["first-name"] || cf.firstName || cf.first_name || "";
    var last = cf["last-name"] || cf.lastName || cf.last_name || "";
    var name = (first && last) ? (first + " " + last) : (first || last || (member.data.email || "").split("@")[0] || "Member");
    nameEl.textContent = name;
    if (welcome) welcome.style.display = "";
    wireHeaderLogout();
  }
  function ensureAcademyHeaderMounted(retries){
    if (document.getElementById("ar-academy-header-container")) return;
    mountAcademyHeader();
    if (retries > 0) setTimeout(function(){ ensureAcademyHeaderMounted(retries - 1); }, 250);
  }
  function ensureFoundationHeaderReviewsBadge(){
    if (!isFoundationPage()) return null;
    var welcome = document.getElementById("ar-academy-header-welcome");
    if (!welcome) return null;
    var appClass = "${ELFSIGHT_REVIEWS_APP}";
    var mount = document.getElementById("ar-fp-header-reviews-badge");
    if (!mount) {
      mount = document.createElement("div");
      mount.id = "ar-fp-header-reviews-badge";
      mount.className = "ar-fp-header-reviews-badge";
      mount.setAttribute("aria-label", "Google rating");
      var app = document.createElement("div");
      app.className = appClass;
      mount.appendChild(app);
      var copy = document.getElementById("ar-academy-header-welcome-copy");
      if (copy && copy.parentNode === welcome) welcome.insertBefore(mount, copy.nextSibling);
      else welcome.appendChild(mount);
    }
    var legacyStrip = document.querySelector(".ar-fp-top-strip");
    if (legacyStrip) legacyStrip.remove();
    return mount;
  }
  function wireHeaderReviewsBadgeClick(){
    var mount = document.getElementById("ar-fp-header-reviews-badge");
    if (!mount) return;
    var reviewUrl = "${GOOGLE_REVIEW_URL}";
    function attach(){
      var link = mount.querySelector("a[href]");
      if (link) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
        mount.removeAttribute("data-fp-review-fallback");
        mount.onclick = null;
        return;
      }
      if (mount.getAttribute("data-fp-review-fallback") === "1") return;
      mount.setAttribute("data-fp-review-fallback", "1");
      mount.setAttribute("role", "link");
      mount.setAttribute("tabindex", "0");
      mount.setAttribute("aria-label", "View Google reviews");
      mount.style.cursor = "pointer";
      mount.addEventListener("click", function(){
        window.open(reviewUrl, "_blank", "noopener,noreferrer");
      });
      mount.addEventListener("keydown", function(e){
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.open(reviewUrl, "_blank", "noopener,noreferrer");
        }
      });
    }
    attach();
    setTimeout(attach, 800);
    setTimeout(attach, 2200);
  }
  function bootReviewsWidget(){
    ensureFoundationHeaderReviewsBadge();
    function refresh(){
      try {
        if (window.eapps && typeof window.eapps.init === "function") window.eapps.init();
      } catch(e){}
    }
    if (!document.querySelector('script[src*="elfsightcdn.com/platform.js"]')) {
      var s = document.createElement("script");
      s.src = "https://elfsightcdn.com/platform.js";
      s.async = true;
      s.onload = refresh;
      document.head.appendChild(s);
    } else {
      refresh();
    }
    setTimeout(refresh, 600);
    setTimeout(refresh, 1800);
    setTimeout(wireHeaderReviewsBadgeClick, 700);
    setTimeout(wireHeaderReviewsBadgeClick, 1900);
  }
  function waitForMemberstack(maxMs){
    maxMs = typeof maxMs === "number" ? maxMs : 2000;
    if (globalThis.$memberstackDom && typeof globalThis.$memberstackDom.getCurrentMember === "function") {
      return Promise.resolve(globalThis.$memberstackDom);
    }
    return new Promise(function(resolve){
      var start = Date.now();
      (function tick(){
        if (globalThis.$memberstackDom && typeof globalThis.$memberstackDom.getCurrentMember === "function") {
          resolve(globalThis.$memberstackDom);
          return;
        }
        if ((Date.now() - start) > maxMs) { resolve(null); return; }
        setTimeout(tick, 50);
      })();
    });
  }
  function readSessionMemberId(){
    try {
      var raw = sessionStorage.getItem("ar-dashboard-session-v1");
      if (!raw) return null;
      var sess = JSON.parse(raw);
      if (sess && sess.id && sess.at && Date.now() - sess.at < 86400000) return String(sess.id);
    } catch(e){}
    return null;
  }
  function hasCachedEngagement(memberId){
    if (!memberId) return false;
    try {
      var raw = sessionStorage.getItem("ar-engagement-" + memberId);
      if (!raw) return false;
      var cached = JSON.parse(raw);
      return !!(cached && cached.at && Date.now() - cached.at < 300000 && cached.data);
    } catch(e){ return false; }
  }
  function hasCachedExamProgress(memberId){
    if (!memberId) return false;
    try {
      var raw = sessionStorage.getItem("ar-exam-progress-" + memberId);
      if (!raw) return false;
      var cached = JSON.parse(raw);
      return !!(cached && cached.at && Date.now() - cached.at < 300000 && cached.data);
    } catch(e){ return false; }
  }
  async function resolveMemberBundle(){
    if (globalThis.__arMsReader) {
      try {
        var msNow = globalThis.$memberstackDom || null;
        var warm = await globalThis.__arMsReader.fetchBundle(msNow);
        if (warm && (warm.member || warm.memberJson || warm.rawJson)) {
          return {
            member: warm.member,
            normalized: warm.memberJson || normalizeMemberJson(warm.rawJson)
          };
        }
      } catch(e){}
    }
    var ms = globalThis.$memberstackDom || await waitForMemberstack(2000);
    if (globalThis.__arMsReader && ms) {
      try {
        var bundle = await globalThis.__arMsReader.fetchBundle(ms);
        return {
          member: bundle.member,
          normalized: bundle.memberJson || normalizeMemberJson(bundle.rawJson)
        };
      } catch(e2){}
    }
    return fetchMemberBundle(ms);
  }
  function setHeadlineLoading(isLoading){
    var panel = document.getElementById("ar-fp-headline-panel");
    if (panel) panel.setAttribute("data-fp-loading", isLoading ? "true" : "false");
  }
  function publishFoundationHook(payload){
    globalThis.__arFoundationPage = payload;
  }
  var fpState = { wired: false, busy: false, revalidating: false };

  function paintFoundationState(member, normalized, engagement, examData){
    var openedSet = buildOpenedSet(normalized);
    var openedCount = countFoundationOpens(openedSet);
    var engagementDegraded = !engagement;
    var lockPaid = shouldLockPaidResources(member, engagement);
    var trial = isTrialMember(member, engagement);
    var examsPassed = examData && examData.summary ? safeNum(examData.summary.passedCount, 0) : 0;
    applyOpenedPills(openedSet);
    updateMapSectionProgress(openedSet, engagement, normalized, lockPaid);
    renderExamsSection(examData);
    lockPaidResourceTiles(lockPaid);
    applyFaqTrialCopy(trial);
    var activeDays = engagement && typeof engagement.distinctActiveDaysFirst14d === "number" ? engagement.distinctActiveDaysFirst14d : 0;
    renderMembershipBadge(member, engagement);
    syncHeaderWelcome(member);
    var gateStats = buildGateStats(openedSet, examsPassed, engagement, normalized);
    try {
      var badges = computeJourneyBadges(gateStats, activeDays, engagementDegraded, { hasConverted: !!(engagement && engagement.hasConverted), lastActivityAt: engagement ? engagement.lastActivityAt : null, nowMs: Date.now() });
      var progress = computeNextBadgeProgress(badges, gateStats, activeDays, engagementDegraded, openedCount, MODULES_TOTAL);
      renderHeadline(badges, progress, openedCount, examsPassed);
      renderCta(openedSet);
      publishFoundationHook({
        ready: true,
        progressPct: progress.pct,
        progressBreakdown: progress.breakdown,
        progressLabel: progress.label,
        openedCount: openedCount,
        examsPassed: examsPassed,
        isTrial: trial
      });
    } catch(err) {
      console.warn("[foundation-hub] badge progress failed", err);
      renderHeadline([], { pct: 0, label: "0%", breakdown: "", nextKey: "foundation" }, openedCount, examsPassed);
      renderCta(openedSet);
      publishFoundationHook({
        ready: true,
        progressPct: 0,
        progressBreakdown: "",
        progressLabel: "0%",
        openedCount: openedCount,
        examsPassed: examsPassed,
        isTrial: trial
      });
    }
  }

  function scheduleFoundationRevalidate(memberId){
    if (!memberId || fpState.revalidating) return;
    fpState.revalidating = true;
    Promise.all([
      fetchEngagementSummary(memberId, true),
      fetchExamProgress(memberId, true)
    ]).then(function(results){
      resolveMemberBundle().then(function(bundle){
        paintFoundationState(bundle.member, bundle.normalized || {}, results[0], results[1]);
      });
    }).catch(function(err){
      console.warn("[foundation-hub] revalidate failed", err);
    }).finally(function(){
      fpState.revalidating = false;
    });
  }

  async function renderFoundationState(opts){
    opts = opts || {};
    if (fpState.busy) return;
    fpState.busy = true;
    var memberIdHint = readSessionMemberId();
    var usedCache = !!(globalThis.__arMsReader || memberIdHint || hasCachedEngagement(memberIdHint));
    if (!opts.skipLoading && !usedCache) setHeadlineLoading(true);
    try {
      var bundle = await resolveMemberBundle();
      var member = bundle.member;
      var normalized = bundle.normalized || {};
      var memberId = (member && (member.id || (member.data && member.data.id))) || memberIdHint;
      var usedEngagementCache = hasCachedEngagement(memberId);
      var usedExamCache = hasCachedExamProgress(memberId);
      var engagementP = fetchEngagementSummary(memberId);
      var examP = fetchExamProgress(memberId);
      var results = await Promise.all([engagementP, examP]);
      paintFoundationState(member, normalized, results[0], results[1]);
      if (usedEngagementCache || usedExamCache) scheduleFoundationRevalidate(memberId);
      setHeadlineLoading(false);
    } catch(err2) {
      console.warn("[foundation-hub] render failed", err2);
      setHeadlineLoading(false);
      publishFoundationHook({ ready: false, error: true });
    } finally {
      fpState.busy = false;
    }
  }

  async function init(){
    if (!isFoundationPage()) return;
    var hub = document.getElementById("ar-foundation-hub");
    if (isSqspEditMode()) {
      if (hub) { hub.hidden = false; hub.removeAttribute("aria-hidden"); }
      return;
    }
    bootAppShell();
    ensureAcademyHeaderMounted(24);
    var hub = document.getElementById("ar-foundation-hub");
    if (!hub) return;
    hub.hidden = false;
    hub.removeAttribute("aria-hidden");
    bootReviewsWidget();
    if (!fpState.wired) {
      wirePaidLockClicks();
      wireFoundationCollapsibles();
      document.addEventListener("ar-academy-member-ready", function(){ renderFoundationState({ skipLoading: true }); });
      fpState.wired = true;
    }
    wireFoundationCollapsibles();
    renderFoundationState({ skipLoading: !!globalThis.__arMsReader });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
</script>
`;

fs.writeFileSync(OUT, snippet, "utf8");
console.log("OK: wrote", OUT);
execSync("node scripts/sync-badge-gates-to-snippets.mjs", { cwd: root, stdio: "inherit" });
