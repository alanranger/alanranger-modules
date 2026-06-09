/**
 * Shared merge-field enrichment for email templates (server + admin preview).
 */

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
  return base;
}

module.exports = {
  moduleCountPhrase,
  examCountPhrase,
  badgeGapPhrase,
  safeFirstName,
  enrichRenderVars,
};
