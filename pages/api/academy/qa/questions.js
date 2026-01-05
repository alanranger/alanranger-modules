// pages/api/academy/qa/questions.js
// Q&A Questions API endpoint
//
// Requires env:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  "https://alanranger.com",
  "https://www.alanranger.com",
]);

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.alanranger.com";
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    const page_url = req.query.page_url;
    const limitRaw = req.query.limit || "25";
    const limit = Math.max(1, Math.min(50, parseInt(limitRaw, 10) || 25));

    if (!page_url) return res.status(400).json({ error: "page_url is required" });

    const { data, error } = await supabase
      .from("academy_qa_questions")
      .select("id, question, member_id, member_email, member_name, page_url, created_at")
      .eq("page_url", page_url)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data: data || [] });
  }

  if (req.method === "POST") {
    const page_url = req.body?.page_url;
    const question = (req.body?.question || "").trim();
    const member_id = req.body?.member_id || null;
    const member_email = req.body?.member_email || null;
    const member_name = req.body?.member_name || null;

    if (!page_url) return res.status(400).json({ error: "page_url is required" });
    if (!question) return res.status(400).json({ error: "question is required" });
    if (question.length > 2000) return res.status(400).json({ error: "question must be <= 2000 chars" });

    const { data, error } = await supabase
      .from("academy_qa_questions")
      .insert([{ page_url, question, member_id, member_email, member_name }])
      .select("id, question, member_id, member_email, member_name, page_url, created_at")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
