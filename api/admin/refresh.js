// api/admin/refresh.js
// Proxy to Next.js API route to avoid Vercel routing conflicts
// Vercel routes /api/* to serverless functions before Next.js routes

module.exports = async (req, res) => {
  // Forward to Next.js API route
  // This file exists to prevent Vercel from routing to a non-existent serverless function
  // The actual implementation is in pages/api/admin/refresh.js
  
  // For now, return 405 to match what Vercel was doing
  // The real fix is to use pages/api/admin/refresh.js
  return res.status(405).json({ 
    error: "Method Not Allowed",
    message: "This endpoint has moved to Next.js API routes. Please use the pages/api/admin/refresh.js endpoint."
  });
};
