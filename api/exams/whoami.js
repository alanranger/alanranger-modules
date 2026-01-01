// /api/exams/whoami.js
// Returns the logged-in Memberstack member identity (or 401)

const memberstackAdmin = require("@memberstack/admin");
const { setCorsHeaders, handlePreflight, getMemberstackToken, getMemberstackMemberId } = require("./_cors");

module.exports = async (req, res) => {
  // Handle OPTIONS preflight
  if (handlePreflight(req, res)) return;

  // Set CORS headers for all responses
  setCorsHeaders(res);

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

    // Try token-based auth first
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
        console.error("[whoami] Token verification failed:", e.message);
        // Fall through to member ID fallback
      }
    }

    // Fallback: Use member ID header (when token is missing but client API provided member ID)
    const memberId = getMemberstackMemberId(req);
    if (memberId) {
      try {
        const { data } = await memberstack.members.retrieve({ id: memberId });
        // Verify member exists and return identity
        return res.status(200).json({
          memberstack_id: data?.id,
          email: data?.auth?.email || null,
          permissions: data?.permissions || [],
          planConnections: data?.planConnections || []
        });
      } catch (e) {
        console.error("[whoami] Member ID retrieval failed:", e.message);
        return res.status(401).json({ error: "Invalid member ID" });
      }
    }

    return res.status(401).json({ error: "Not logged in" });
  } catch (e) {
    console.error("[whoami] Error:", e);
    return res.status(401).json({ error: "Unauthorized" });
  }
};
