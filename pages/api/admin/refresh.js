// pages/api/admin/refresh.js
// Sync Memberstack -> Supabase (member cache + module_open events)
//
// Requires env:
// - MEMBERSTACK_SECRET_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY

const memberstackAdmin = require("@memberstack/admin");
const { createClient } = require("@supabase/supabase-js");

function safeIso(d) {
  try {
    const x = new Date(d);
    return isNaN(x.getTime()) ? null : x.toISOString();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let membersFetched = 0;
    let membersUpserted = 0;
    let eventsUpserted = 0;

    let after = undefined;
    const limit = 100;

    while (true) {
      const { data: members } = await memberstack.members.list({
        limit,
        ...(after ? { after } : {}),
        order: "ASC",
      });

      if (!members || members.length === 0) break;

      membersFetched += members.length;

      for (const m of members) {
        const memberId = m.id;
        if (!memberId) continue;

        // Retrieve full member (includes `json` field per Memberstack Admin Package docs)
        const full = await memberstack.members.retrieve({ id: memberId });

        const email = full?.auth?.email || null;
        const name = full?.customFields?.name || full?.name || null;

        // Plan summary (best-effort; depends on what MS returns in your project)
        const planConnections = Array.isArray(full?.planConnections) ? full.planConnections : [];
        const activePlan = planConnections.find(
          (p) => p?.status === "active" || p?.status === "trialing"
        );

        const planName = activePlan?.planName || activePlan?.name || null;
        const planStatus = activePlan?.status || full?.status || "unknown";
        const trialEnd = activePlan?.trialEnd ? safeIso(activePlan.trialEnd) : null;

        const planNameLower = (planName || "").toLowerCase();
        const planType =
          planNameLower.includes("annual") || planNameLower.includes("year")
            ? "annual"
            : planNameLower.includes("month")
              ? "monthly"
              : null;

        const planSummary = {
          plan_id: activePlan?.planId || activePlan?.id || null,
          plan_name: planName,
          status: planStatus,
          trial_end: trialEnd,
          is_trial: planStatus === "trialing",
          is_paid: planStatus === "active",
          plan_type: planType,
        };

        // Upsert member cache (this is what your KPI "totalMembers/trials/paid" should read from)
        const { error: upsertMemberErr } = await supabase
          .from("ms_members_cache")
          .upsert(
            [
              {
                member_id: memberId,
                email,
                name,
                plan_summary: planSummary,
                created_at: safeIso(full?.createdAt) || new Date().toISOString(),
                updated_at: new Date().toISOString(),
                raw: full,
              },
            ],
            { onConflict: "member_id" }
          );

        if (!upsertMemberErr) membersUpserted++;

        // Read opened modules from Member JSON
        const j = full?.json || {};
        const opened = j?.arAcademy?.modules?.opened || null;
        if (!opened || typeof opened !== "object") continue;

        // Upsert module_open events
        for (const [path, md] of Object.entries(opened)) {
          if (!path || !md) continue;

          const createdAt =
            safeIso(md.lastAt) ||
            safeIso(md.at) ||
            new Date().toISOString();

          const meta = {
            source: "memberstack_sync",
            first_opened_at: safeIso(md.at) || null,
            last_opened_at: safeIso(md.lastAt) || safeIso(md.at) || null,
          };

          const { error: upsertEventErr } = await supabase
            .from("academy_events")
            .upsert(
              [
                {
                  event_type: "module_open",
                  member_id: memberId,
                  email,
                  path,
                  title: md.t || md.title || "Module",
                  category: md.cat || md.category || null,
                  meta,
                  created_at: createdAt,
                },
              ],
              // IMPORTANT: you should add a unique constraint on (member_id,event_type,path)
              // so this upsert is deterministic.
              { onConflict: "member_id,event_type,path" }
            );

          if (!upsertEventErr) eventsUpserted++;
        }
      }

      if (members.length < limit) break;
      after = members[members.length - 1]?.id;
      if (!after) break;
    }

    return res.status(200).json({
      success: true,
      members_fetched: membersFetched,
      members_upserted: membersUpserted,
      events_upserted: eventsUpserted,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
}
