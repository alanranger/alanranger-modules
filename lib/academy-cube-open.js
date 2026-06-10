/**
 * Pure helpers for dashboard module cube open behaviour.
 * Used by tests to guard against loop-closure and popup-blocker regressions.
 */

const SITE_ORIGIN = "https://www.alanranger.com";

function isPdfModuleUrl(moduleUrl) {
  return typeof moduleUrl === "string" && moduleUrl.endsWith(".pdf");
}

function resolveCubeOpenUrl(moduleUrl, siteOrigin) {
  if (!moduleUrl || typeof moduleUrl !== "string") return "";
  const origin = siteOrigin || SITE_ORIGIN;
  if (moduleUrl.indexOf("http") === 0) return moduleUrl;
  return origin + moduleUrl;
}

function shouldOpenInNewTab(isPdf, eventFlags) {
  if (isPdf) return true;
  if (!eventFlags) return false;
  return !!(
    eventFlags.ctrlKey ||
    eventFlags.metaKey ||
    eventFlags.shiftKey ||
    eventFlags.button === 1
  );
}

module.exports = {
  SITE_ORIGIN,
  isPdfModuleUrl,
  resolveCubeOpenUrl,
  shouldOpenInNewTab,
};
