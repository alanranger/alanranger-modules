/**
 * Shared merge-field enrichment for email templates (server + admin preview).
 */

function moduleCountPhrase(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n < 0) return "0 modules";
  return n === 1 ? "1 module" : `${n} modules`;
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
  return base;
}

module.exports = {
  moduleCountPhrase,
  safeFirstName,
  enrichRenderVars,
};
