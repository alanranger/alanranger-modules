/**
 * Decide whether hourly Memberstack→Supabase refresh should upsert a module_open row.
 * Live clicks already write via track-tile-open; cron only needs new/newer opens.
 */

function eventMs(iso) {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {object|null} existing - row from academy_events (created_at, meta)
 * @param {string|null} msLastAt - Memberstack opened[path].lastAt or .at (ISO)
 * @returns {boolean}
 */
function shouldUpsertModuleOpen(existing, msLastAt) {
  if (!existing) return true;
  const incoming = eventMs(msLastAt);
  if (!incoming) return false;
  const stored =
    eventMs(existing?.meta?.last_opened_at)
    || eventMs(existing?.meta?.lastAt)
    || eventMs(existing?.created_at);
  // Allow 2s skew so identical timestamps from prior sync don't re-write.
  return incoming > stored + 2000;
}

function moduleOpenKey(memberId, path) {
  return `${memberId}\0${path}`;
}

module.exports = {
  shouldUpsertModuleOpen,
  moduleOpenKey,
  eventMs,
};
