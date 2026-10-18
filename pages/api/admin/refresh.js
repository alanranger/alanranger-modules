// pages/api/admin/refresh.js
// Next.js entry for /api/admin/refresh — delegates to the serverless handler.
// Keep maxDuration here: vercel.json only covers root api/*.js.

export const config = {
  maxDuration: 300,
};

const handler = require("../../../api/admin/refresh");

export default async function pagesRefresh(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  return handler(req, res);
}
