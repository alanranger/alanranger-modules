// /api/exams/_cors.js
// Shared CORS middleware for all /api/exams/* routes

const ALLOWED_ORIGIN = process.env.EXAMS_API_ORIGIN || "https://www.alanranger.com";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Memberstack-Id");
  res.setHeader("Vary", "Origin");
}

function handlePreflight(req, res) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

function getCookie(cookieHeader = "", name) {
  const parts = String(cookieHeader || "").split(";").map((v) => v.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

function getMemberstackToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }
  const cookieHeader = req.headers.cookie || "";
  return getCookie(cookieHeader, "_ms-mid");
}

function getMemberstackMemberId(req) {
  return req.headers["x-memberstack-id"]
    || req.headers["x-memberstackid"]
    || null;
}

/** True if request carries any supported auth evidence (no logging of secrets). */
function requestHasAuthEvidence(req) {
  const headers = (req && req.headers) || {};
  const auth = headers.authorization || "";
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const memberId = getMemberstackMemberId(req);
  const cookieHeader = headers.cookie || "";
  const hasMsCookie = typeof cookieHeader === "string" && /(^|;\s*)_ms-mid=/.test(cookieHeader);
  return !!(bearer || (memberId && String(memberId).trim()) || hasMsCookie);
}

module.exports = {
  setCorsHeaders,
  handlePreflight,
  getCookie,
  getMemberstackToken,
  getMemberstackMemberId,
  requestHasAuthEvidence,
  ALLOWED_ORIGIN
};
