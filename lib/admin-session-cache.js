/** Browser session cache for admin member lists (survives tab switches within one session). */

const GHOST_KEY = "ar-admin-session-ghost-v1";
const MEMBERS_PREFIX = "ar-admin-session-members-v1:";
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function canUseStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function readSessionEntry(key, ttlMs = DEFAULT_TTL_MS) {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > ttlMs) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeSessionEntry(key, data) {
  if (!canUseStorage()) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* quota / private mode */
  }
}

function ghostCacheKey() {
  return GHOST_KEY;
}

function membersCacheKey(paramsString) {
  return MEMBERS_PREFIX + paramsString;
}

module.exports = {
  DEFAULT_TTL_MS,
  ghostCacheKey,
  membersCacheKey,
  readSessionEntry,
  writeSessionEntry,
};
