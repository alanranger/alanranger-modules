// api/academy/reengagement-unsubscribe.js
// One-click unsubscribe endpoint for the REWIND20 win-back email.
// Every re-engagement email contains a footer link of the form:
//   https://<api-host>/api/academy/reengagement-unsubscribe?token=<opaque>
// Hitting this URL flips academy_trial_history.reengagement_opted_out = true
// so the member is excluded from every future reengagement webhook run.
//
// This endpoint is intentionally public (no auth): the token in the URL IS the
// auth. Tokens are 48-char random hex, stored per member, and unique-indexed.

const { createClient } = require("@supabase/supabase-js");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function renderHtml(title, message) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${title} — Alan Ranger Photography Academy</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#f7f7f5;color:#1a1a1a;margin:0;padding:32px 16px;line-height:1.55;}
    .wrap{max-width:520px;margin:40px auto;background:#fff;border:1px solid #e6e6e0;border-radius:12px;padding:32px;box-shadow:0 4px 16px rgba(0,0,0,.04);}
    h1{font-size:22px;margin:0 0 12px;color:#111;}
    p{margin:0 0 12px;color:#333;}
    a{color:#d97706;font-weight:600;text-decoration:none;}
    a:hover{text-decoration:underline;}
    .muted{color:#777;font-size:13px;margin-top:20px;}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="muted">You can always return to the Academy at <a href="https://www.alanranger.com/academy">alanranger.com/academy</a>.</p>
  </div>
</body>
</html>`;
}

async function findRowByToken(supabase, token) {
  const { data, error } = await supabase
    .from("academy_trial_history")
    .select("member_id, reengagement_opted_out")
    .eq("reengagement_unsub_token", token)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function optOutByMemberId(supabase, memberId) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("academy_trial_history")
    .update({
      reengagement_opted_out: true,
      reengagement_opted_out_at: nowIso,
    })
    .eq("member_id", memberId);
  if (error) throw error;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = req.query?.token;
  if (!token || typeof token !== "string" || token.length < 16) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(400).send(renderHtml(
      "Link not recognised",
      "This unsubscribe link looks incomplete. If you were trying to opt out of re-engagement emails, please reply to the original email and we'll remove you manually."
    ));
  }

  try {
    const supabase = getSupabase();
    const row = await findRowByToken(supabase, token);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!row) {
      return res.status(200).send(renderHtml(
        "Already unsubscribed",
        "This link has already been used, or it points to an account we no longer have on file. Either way, you will not receive any more re-engagement emails from us."
      ));
    }
    if (row.reengagement_opted_out) {
      return res.status(200).send(renderHtml(
        "You're already unsubscribed",
        "We already have you marked as opted out from re-engagement emails — nothing more to do."
      ));
    }
    await optOutByMemberId(supabase, row.member_id);
    return res.status(200).send(renderHtml(
      "You're unsubscribed",
      "Done. You won't receive any more re-engagement emails from the Alan Ranger Photography Academy. Your account, trial history and any progress stay untouched, so you can always log in and upgrade directly from your dashboard if you change your mind."
    ));
  } catch (err) {
    console.error("[reengagement-unsubscribe] error:", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(renderHtml(
      "Something went wrong",
      "We couldn't process your request right now. Please reply to the original email and we'll remove you manually."
    ));
  }
};
