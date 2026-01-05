// /api/admin/_auth.js
// Shared admin authentication utility
// Checks if the authenticated member has admin access (Admin plan)

const memberstackAdmin = require("@memberstack/admin");

/**
 * Get authenticated member from request
 */
function getMemberstackToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }
  const cookieHeader = req.headers.cookie || "";
  const parts = cookieHeader.split(";").map(v => v.trim());
  const found = parts.find(p => p.startsWith("_ms-mid="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

/**
 * Check if authenticated member has admin access
 * Returns { isAdmin: boolean, member: object|null, error: string|null }
 */
async function checkAdminAccess(req) {
  if (!process.env.MEMBERSTACK_SECRET_KEY) {
    return { isAdmin: false, member: null, error: "MEMBERSTACK_SECRET_KEY not configured" };
  }

  try {
    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    
    // Try token-based auth first
    const token = getMemberstackToken(req);
    let memberData = null;
    
    if (token) {
      try {
        const { id } = await memberstack.verifyToken({ token });
        const { data } = await memberstack.members.retrieve({ id });
        if (data?.id) {
          memberData = data;
        }
      } catch (e) {
        console.error("[admin-auth] Token verification failed:", e.message);
      }
    }

    // Fallback: Try member ID header
    if (!memberData) {
      const memberIdHeader = req.headers["x-memberstack-id"] || req.headers["x-memberstackid"];
      if (memberIdHeader) {
        try {
          const { data } = await memberstack.members.retrieve({ id: memberIdHeader });
          if (data?.id) {
            memberData = data;
          }
        } catch (e) {
          console.error("[admin-auth] Member ID retrieval failed:", e.message);
        }
      }
    }

    if (!memberData || !memberData.id) {
      return { isAdmin: false, member: null, error: "Not authenticated" };
    }

    // Check if member has Admin plan
    // Admin plan ID should be configured in env or hardcoded
    const adminPlanId = process.env.ADMIN_PLAN_ID || "pln_admin"; // Update with actual admin plan ID
    const planConnections = memberData.planConnections || [];
    
    const hasAdminPlan = planConnections.some(pc => {
      // Check plan ID or plan name
      return pc.planId === adminPlanId || 
             pc.planId?.includes('admin') || 
             pc.plan?.name?.toLowerCase().includes('admin');
    });

    // Also check email-based admin access (fallback for development)
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
    const memberEmail = (memberData.auth?.email || memberData.email || "").toLowerCase();
    const isAdminEmail = adminEmails.length > 0 && adminEmails.includes(memberEmail);

    const isAdmin = hasAdminPlan || isAdminEmail;

    if (!isAdmin) {
      return { isAdmin: false, member: memberData, error: "Admin access required" };
    }

    return { isAdmin: true, member: memberData, error: null };
  } catch (e) {
    console.error("[admin-auth] Error:", e);
    return { isAdmin: false, member: null, error: e.message };
  }
}

module.exports = { checkAdminAccess, getMemberstackToken };
