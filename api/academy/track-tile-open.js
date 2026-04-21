// /api/academy/track-tile-open.js
//
// Reliable server-side recorder for Applied Learning / RPS / modules tile opens.
// The client fires a fetch({ keepalive: true }) beacon on click so the request
// survives navigation — something client-side Memberstack writes cannot do
// (Memberstack JS SDK's fetch is aborted when the page navigates away).
//
// Body: { member_id, section, key, title?, url?, category? }
// Section must be one of: appliedLearning, rps, modules
//
// Auth model: same low-trust pattern as /api/academy/track-login.js — the
// member_id is trusted after an origin check. Cross-member writes are low-value
// (they only affect tile-opened progress visuals) and auditable via Memberstack.

const memberstackAdmin = require("@memberstack/admin");
const { setCorsHeaders, handlePreflight } = require("../exams/_cors");

const VALID_SECTIONS = new Set(["appliedLearning", "rps", "modules"]);
const ALLOWED_ORIGINS = [
  "https://www.alanranger.com",
  "https://alanranger.com",
];
const MAX_KEY_LENGTH = 512;
const MAX_TITLE_LENGTH = 512;
const MAX_URL_LENGTH = 512;

function parseBody(req) {
  try {
    if (!req.body) return null;
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (err) {
    console.warn("[track-tile-open] parseBody failed:", err?.message || err);
    return null;
  }
}

function sanitiseString(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.slice(0, maxLen);
}

function validatePayload(body) {
  if (!body) return { error: "Missing body" };
  const memberId = sanitiseString(body.member_id, 128).trim();
  const section = sanitiseString(body.section, 32).trim();
  const key = sanitiseString(body.key, MAX_KEY_LENGTH).trim();
  if (!memberId) return { error: "member_id required" };
  if (!VALID_SECTIONS.has(section)) return { error: "Invalid section" };
  if (!key) return { error: "key required" };
  return {
    member_id: memberId,
    section,
    key,
    title: sanitiseString(body.title, MAX_TITLE_LENGTH),
    url: sanitiseString(body.url, MAX_URL_LENGTH),
    category: sanitiseString(body.category, 64),
  };
}

function checkOrigin(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const originOk = ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + "/"));
  const refererOk = ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  return originOk || refererOk;
}

async function fetchMemberJson(memberstack, memberId) {
  const res = await memberstack.members.retrieve({ id: memberId });
  const member = res?.data || res;
  const json = member?.json || member?.data?.json;
  return json && typeof json === "object" ? json : {};
}

function buildMergedJson(currentJson, payload) {
  const next = currentJson && typeof currentJson === "object" ? { ...currentJson } : {};
  const arAcademy = next.arAcademy && typeof next.arAcademy === "object" ? { ...next.arAcademy } : {};
  const existingSection = arAcademy[payload.section];
  const section = existingSection && typeof existingSection === "object" ? { ...existingSection } : {};
  const opened = section.opened && typeof section.opened === "object" ? { ...section.opened } : {};
  const prev = opened[payload.key] && typeof opened[payload.key] === "object" ? opened[payload.key] : {};
  const nowIso = new Date().toISOString();
  opened[payload.key] = {
    ...prev,
    at: prev.at || nowIso,
    lastAt: nowIso,
    t: payload.title || prev.t || prev.title || "",
    url: payload.url || prev.url || "",
    cat: payload.category || prev.cat || "",
  };
  section.opened = opened;
  arAcademy[payload.section] = section;
  next.arAcademy = arAcademy;
  return next;
}

async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!checkOrigin(req)) {
    console.warn("[track-tile-open] Rejected non-allowed origin:", req.headers.origin, req.headers.referer);
    return res.status(403).json({ error: "Forbidden" });
  }

  const secret = process.env.MEMBERSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[track-tile-open] MEMBERSTACK_SECRET_KEY not configured");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const parsed = validatePayload(parseBody(req));
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const memberstack = memberstackAdmin.init(secret);
    const currentJson = await fetchMemberJson(memberstack, parsed.member_id);
    const nextJson = buildMergedJson(currentJson, parsed);
    await memberstack.members.update({
      id: parsed.member_id,
      data: { json: nextJson },
    });
    const openedCount = Object.keys(nextJson.arAcademy[parsed.section].opened).length;
    console.log(
      `[track-tile-open] OK member=${parsed.member_id} section=${parsed.section} key=${parsed.key} count=${openedCount}`
    );
    return res.status(200).json({
      ok: true,
      section: parsed.section,
      key: parsed.key,
      opened_count: openedCount,
    });
  } catch (err) {
    console.error("[track-tile-open] Error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}

module.exports = handler;
