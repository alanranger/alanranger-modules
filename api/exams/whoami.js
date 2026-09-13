// /api/exams/whoami.js
// Returns the logged-in Memberstack member identity (or 401).
// Rejects unauthenticated callers before any Memberstack Admin work.

const memberstackAdmin = require("@memberstack/admin");
const {
  setCorsHeaders,
  handlePreflight,
  getMemberstackToken,
  getMemberstackMemberId,
  requestHasAuthEvidence
} = require("./_cors");

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Hard stop: no token, member-id header, or _ms-mid cookie → no Admin API / no log spam.
  if (!requestHasAuthEvidence(req)) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

    const token = getMemberstackToken(req);
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        const { data } = await memberstack.members.retrieve({ id });
        return res.status(200).json({
          memberstack_id: data?.id,
          email: data?.auth?.email || null,
          permissions: data?.permissions || [],
          planConnections: data?.planConnections || []
        });
      } catch (e) {
        console.error("[whoami] Token verification failed");
      }
    }

    const memberId = getMemberstackMemberId(req);
    if (memberId) {
      try {
        const { data } = await memberstack.members.retrieve({ id: memberId });
        return res.status(200).json({
          memberstack_id: data?.id,
          email: data?.auth?.email || null,
          permissions: data?.permissions || [],
          planConnections: data?.planConnections || []
        });
      } catch (e) {
        console.error("[whoami] Member ID retrieval failed");
        return res.status(401).json({ error: "Invalid member ID" });
      }
    }

    return res.status(401).json({ error: "Not logged in" });
  } catch (e) {
    console.error("[whoami] Error");
    return res.status(401).json({ error: "Unauthorized" });
  }
};
