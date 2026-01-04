// /api/admin/version.js
// Returns version information from Vercel environment variables

module.exports = async (req, res) => {
  try {
    const version = process.env.VERCEL_GIT_COMMIT_SHA || 
                    process.env.GIT_COMMIT_SHA || 
                    'dev';
    
    const ref = process.env.VERCEL_GIT_COMMIT_REF || 
                process.env.GIT_BRANCH || 
                'unknown';
    
    return res.status(200).json({
      version,
      ref,
      build_time: process.env.VERCEL ? new Date().toISOString() : null
    });
  } catch (error) {
    return res.status(200).json({
      version: 'dev',
      ref: 'unknown',
      error: error.message
    });
  }
};
