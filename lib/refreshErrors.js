/** Format Memberstack/Axios throws (often plain strings, not Error). */
function formatErr(err) {
  if (err == null) return "Unknown error";
  if (typeof err === "string" && err.trim()) return err.trim();
  if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
  if (typeof err?.error === "string" && err.error.trim()) return err.error.trim();
  try {
    const s = JSON.stringify(err);
    if (s && s !== "{}") return s;
  } catch {
    /* ignore */
  }
  return String(err);
}

function isRateLimited(err) {
  const s = formatErr(err).toLowerCase();
  return s.includes("too many requests") || s.includes("rate limit") || Number(err?.status) === 429;
}

module.exports = { formatErr, isRateLimited };
