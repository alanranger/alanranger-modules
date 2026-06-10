/**
 * Catalog of all ~190 trackable dashboard links.
 * Run: npm run audit:dashboard-links
 */
const fs = require("fs");
const path = require("path");
const paths = require("./academy-module-paths");
const topics = require("./academy-module-topics");
const { isPdfModuleUrl } = require("./academy-cube-open");
const { TRACK_ORDER, getTrack, getModuleIds } = require("./academy-exam-modules");

const SITE = "https://www.alanranger.com";

function getExamModuleIds() {
  const ids = [];
  TRACK_ORDER.forEach((trackKey) => {
    ids.push(...getModuleIds(trackKey));
  });
  return ids;
}

const EXAM_MODULE_IDS = getExamModuleIds();

function parseHtmlLinks(html, selectorRegex, mapFn) {
  const links = [];
  let m;
  while ((m = selectorRegex.exec(html)) !== null) {
    links.push(mapFn(m));
  }
  return links;
}

function buildCatalog(dashboardHtml) {
  const catalog = [];

  paths.DEFINITIVE_MODULE_URLS.forEach((url, i) => {
    catalog.push({
      section: "modules",
      index: i + 1,
      topic: topics.FOUNDATION_MODULE_TOPICS[i] || topics.deriveTitleFromUrl(url),
      targetUrl: url,
      fullUrl: SITE + url,
      isPdf: isPdfModuleUrl(url),
      trackKey: url,
      trackSection: "modules",
      opensInNewTab: isPdfModuleUrl(url),
    });
  });

  paths.PRACTICE_PACK_URLS.forEach((url, i) => {
    catalog.push({
      section: "practice_packs",
      index: i + 1,
      topic: topics.deriveTitleFromUrl(url),
      targetUrl: url,
      fullUrl: SITE + url,
      isPdf: false,
      trackKey: url,
      trackSection: "modules",
      opensInNewTab: false,
    });
  });

  paths.CHECKLIST_URLS.forEach((url, i) => {
    catalog.push({
      section: "checklists",
      index: i + 1,
      topic: topics.deriveTitleFromUrl(url),
      targetUrl: url,
      fullUrl: SITE + url,
      isPdf: false,
      trackKey: url,
      trackSection: "modules",
      opensInNewTab: true,
    });
  });

  let examIndex = 0;
  TRACK_ORDER.forEach((trackKey) => {
    const track = getTrack(trackKey);
    if (!track) return;
    getModuleIds(trackKey).forEach((id) => {
      examIndex += 1;
      catalog.push({
        section: "exams",
        index: examIndex,
        topic: id,
        targetUrl: "/academy/photography-exams-certification",
        fullUrl: SITE + "/academy/photography-exams-certification",
        isPdf: false,
        trackKey: id,
        trackSection: "exams_api",
        examTrack: trackKey,
        examTrackLabel: track.label,
        opensInNewTab: false,
      });
    });
  });

  const appliedRe = /<a[^>]*class="[^"]*ar-applied-learning-cube[^"]*"[^>]*>/gi;
  let appliedMatch;
  while ((appliedMatch = appliedRe.exec(dashboardHtml)) !== null) {
    const tag = appliedMatch[0];
    const id = (tag.match(/data-applied-id="([^"]+)"/) || [])[1];
    const href = (tag.match(/href="([^"]+)"/) || [])[1];
    const title = (tag.match(/title="([^"]+)"/) || [])[1] || id;
    if (!id || !href) continue;
    catalog.push({
      section: "applied_learning",
      index: catalog.filter((c) => c.section === "applied_learning").length + 1,
      topic: title,
      targetUrl: href,
      fullUrl: href.startsWith("http") ? href : SITE + href,
      isPdf: /\.pdf$/i.test(href),
      trackKey: id,
      trackSection: "appliedLearning",
      opensInNewTab: false,
    });
  }

  const rpsRe = /<a[^>]*class="[^"]*ar-rps-cube[^"]*"[^>]*data-rps-link="[^"]*"[^>]*>/gi;
  let rpsMatch;
  while ((rpsMatch = rpsRe.exec(dashboardHtml)) !== null) {
    const tag = rpsMatch[0];
    const key = (tag.match(/data-rps-link="([^"]+)"/) || [])[1];
    const href = (tag.match(/href="([^"]+)"/) || [])[1];
    const title = (tag.match(/title="([^"]+)"/) || [])[1] || key;
    if (!key || !href) continue;
    catalog.push({
      section: "rps",
      index: catalog.filter((c) => c.section === "rps").length + 1,
      topic: title,
      targetUrl: href,
      fullUrl: href.startsWith("http") ? href : SITE + href,
      isPdf: /\.pdf$/i.test(href),
      trackKey: key,
      trackSection: "rps",
      opensInNewTab: false,
    });
  }

  return catalog;
}

function loadDashboardHtml(rootDir) {
  return fs.readFileSync(
    path.join(rootDir, "Squarespace Snippets", "academy-dashboard-squarespace-snippet-v1.html"),
    "utf8"
  );
}

module.exports = {
  SITE,
  EXAM_MODULE_IDS,
  getExamModuleIds,
  buildCatalog,
  loadDashboardHtml,
};
