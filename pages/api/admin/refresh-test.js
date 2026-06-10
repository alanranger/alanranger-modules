// Test endpoint to verify routing works
export default async function handler(req, res) {
  return res.status(200).json({ 
    message: 'Refresh test endpoint works',
    method: req.method,
    url: req.url
  });
}
