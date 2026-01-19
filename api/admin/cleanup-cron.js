// API endpoint for automated cleanup cron job
// This endpoint runs the cleanup script to remove members without plans
// Designed to be called by Vercel Cron Jobs every 8 hours
// Schedule: Every 8 hours (0 */8 * * *)

const path = require("path");
const { cleanupMembersWithoutPlans } = require(path.join(process.cwd(), "scripts", "auto-cleanup-no-plan-members.js"));

module.exports = async (req, res) => {
  // Only allow POST requests (cron jobs typically use GET, but we'll allow both for flexibility)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Optional: Add a secret token for security (set in Vercel environment variables)
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.query.secret || req.headers["x-cron-secret"];

  if (cronSecret && providedSecret !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log(`[cleanup-cron] Starting cleanup at ${new Date().toISOString()}`);

    const results = await cleanupMembersWithoutPlans();

    console.log(`[cleanup-cron] Cleanup completed:`, {
      membersChecked: results.membersChecked,
      membersWithoutPlans: results.membersWithoutPlans.length,
      deletedFromMemberstack: results.deletedFromMemberstack,
      deletedFromSupabase: results.deletedFromSupabase,
      orphanedRecordsCleaned: results.orphanedRecordsCleaned,
      errors: results.errors.length
    });

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      results: {
        membersChecked: results.membersChecked,
        membersWithoutPlans: results.membersWithoutPlans.length,
        deletedFromMemberstack: results.deletedFromMemberstack,
        deletedFromSupabase: results.deletedFromSupabase,
        orphanedRecordsCleaned: results.orphanedRecordsCleaned,
        errors: results.errors.length,
        errorDetails: results.errors.length > 0 ? results.errors : undefined
      }
    });

  } catch (error) {
    console.error(`[cleanup-cron] Cleanup failed:`, error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
