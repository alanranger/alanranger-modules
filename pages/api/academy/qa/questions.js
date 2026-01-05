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

function setCors(res) {
  // Keep this permissive while testing; tighten to your domains once confirmed working.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    if (req.method === "GET") {
      const page_url = String(req.query.page_url || "").trim();
      const limit = Math.min(parseInt(req.query.limit || "25", 10) || 25, 100);

      if (!page_url) {
        return res.status(400).json({ ok: false, error: "page_url is required" });
      }

      const { data, error } = await supabase
        .from("academy_qa_questions")
        .select("id, created_at, page_url, question, member_id, member_email, member_name")
        .eq("page_url", page_url)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return res.status(500).json({ ok: false, error: error.message });

      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "POST") {
      const { page_url, question, member_id, member_email, member_name } = req.body || {};

      const pu = String(page_url || "").trim();
      const q = String(question || "").trim();

      if (!pu) return res.status(400).json({ ok: false, error: "page_url is required" });
      if (!q) return res.status(400).json({ ok: false, error: "question is required" });
      if (q.length > 2000) return res.status(400).json({ ok: false, error: "question too long" });

      const row = {
        page_url: pu,
        question: q,
        member_id: member_id ? String(member_id) : null,
        member_email: member_email ? String(member_email) : null,
        member_name: member_name ? String(member_name) : null
      };

      const { data, error } = await supabase
        .from("academy_qa_questions")
        .insert([row])
        .select("id, created_at, page_url, question, member_id, member_email, member_name")
        .single();

      if (error) return res.status(500).json({ ok: false, error: error.message });

      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("qa/questions handler error:", e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
