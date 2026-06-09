/**
 * Shared merge-field enrichment for email templates (server + admin preview).
 */

const { DASHBOARD_URL, MODULE_MAP_URL } = require("./lifecycleEmailConfig");
const { composeNextModuleLabel } = require("./foundation-module-meta");

function moduleCountPhrase(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return "0 modules";
  return n === 1 ? "1 module" : `${n} modules`;
}

function examCountPhrase(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return "0 exams";
  return n === 1 ? "1 exam" : `${n} exams`;
}

function badgeGapPhrase(modules, exams) {
  const m = Number(modules);
  const e = Number(exams);
  const hasM = Number.isFinite(m) && m > 0;
  const hasE = Number.isFinite(e) && e > 0;
  if (hasM && hasE) return `${moduleCountPhrase(m)} and ${examCountPhrase(e)}`;
  if (hasM) return moduleCountPhrase(m);
  if (hasE) return examCountPhrase(e);
  return "almost at your next badge";
}

function safeFirstName(value) {
  const name = String(value || "").trim();
  if (!name || name === "there") return "there";
  return name.split(/\s+/)[0];
}

function enrichRenderVars(vars) {
  const base = vars && typeof vars === "object" ? { ...vars } : {};
  base.firstName = safeFirstName(base.firstName);
  const opened = base.modulesOpened;
  const toNext = base.modulesToNextBadge;
  base.modulesOpenedPhrase = moduleCountPhrase(opened);
  base.modulesToNextBadgePhrase =
    typeof toNext === "string" && toNext.includes("module")
      ? toNext
      : moduleCountPhrase(toNext);
  base.badgeGapPhrase = badgeGapPhrase(base.modulesToNextBadge, base.examsToNextBadge);
  base.dashboardUrl = base.dashboardUrl || base.upgradeUrl || DASHBOARD_URL;
  base.moduleMapUrl = base.moduleMapUrl || MODULE_MAP_URL;
  if (!base.nextModuleLabel) {
    base.nextModuleLabel = composeNextModuleLabel(
      base.nextModuleRef,
      base.nextModuleTitle,
      base.nextModuleSection
    );
  }
  return base;
}

module.exports = {
  moduleCountPhrase,
  examCountPhrase,
  badgeGapPhrase,
  safeFirstName,
  enrichRenderVars,
};
