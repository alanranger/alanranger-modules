// /api/exams/_cors.js
// Shared CORS middleware for all /api/exams/* routes

const ALLOWED_ORIGIN = process.env.EXAMS_API_ORIGIN || "https://www.alanranger.com";

/**
 * Set CORS headers for cross-origin requests
 * @param {object} res - Response object
 */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

/**
 * Handle OPTIONS preflight request
 * @param {object} req - Request object
 * @param {object} res - Response object
 * @returns {boolean} - True if preflight was handled, false otherwise
 */
function handlePreflight(req, res) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Extract cookie value from cookie header string
 * @param {string} cookieHeader - Cookie header string
 * @param {string} name - Cookie name
 * @returns {string|null} - Cookie value or null
 */
function getCookie(cookieHeader = "", name) {
  const parts = cookieHeader.split(";").map(v => v.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

/**
 * Get Memberstack token from request (cookie or Authorization header)
 * @param {object} req - Request object
 * @returns {string|null} - Token or null
 */
function getMemberstackToken(req) {
  // Try Authorization header first (for cross-origin token-based auth)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }
  
  // Fallback to cookie (for same-origin or cross-origin with credentials)
  const cookieHeader = req.headers.cookie || "";
  return getCookie(cookieHeader, "_ms-mid");
}

module.exports = {
  setCorsHeaders,
  handlePreflight,
  getCookie,
  getMemberstackToken,
  ALLOWED_ORIGIN
};
