// Script to find members in Supabase but not in Memberstack CSV
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findDiscrepancy() {
  // Read CSV file
  const csvPath = path.join(__dirname, "..", "csv", "member-export-2026-01-19T12-28-20-919Z.csv");
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n");
  
  // Extract emails from CSV (skip header)
  const csvEmails = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length > 1) {
      const email = parts[1].toLowerCase().trim();
      if (email) csvEmails.add(email);
    }
  }
  
  console.log(`\n📊 Memberstack CSV has ${csvEmails.size} members\n`);
  
  // Get all members from Supabase
  const { data: supabaseMembers, error } = await supabase
    .from("ms_members_cache")
    .select("member_id, email, name, plan_summary, created_at")
    .order("created_at", { ascending: false });
  
  if (error) {
    console.error("❌ Error fetching from Supabase:", error);
    return;
  }
  
  console.log(`📊 Supabase cache has ${supabaseMembers.length} members\n`);
  
  // Find members in Supabase but not in CSV
  const missing = supabaseMembers.filter(m => {
    const email = (m.email || "").toLowerCase().trim();
    return !csvEmails.has(email);
  });
  
  console.log(`\n🔍 Found ${missing.length} members in Supabase but NOT in Memberstack CSV:\n`);
  
  missing.forEach((m, idx) => {
    const plan = m.plan_summary || {};
    const planType = plan.plan_type || "none";
    const status = (plan.status || "").toUpperCase();
    const hasPlan = planType !== "none" && (planType === "trial" || planType === "annual");
    
    console.log(`${idx + 1}. ${m.email}`);
    console.log(`   Member ID: ${m.member_id}`);
    console.log(`   Name: ${m.name || "N/A"}`);
    console.log(`   Plan Type: ${planType}`);
    console.log(`   Status: ${status}`);
    console.log(`   Has Valid Plan: ${hasPlan ? "Yes" : "No"}`);
    console.log(`   Created: ${m.created_at}`);
    console.log("");
  });
  
  // Also check reverse - members in CSV but not in Supabase
  const supabaseEmails = new Set(supabaseMembers.map(m => (m.email || "").toLowerCase().trim()));
  const csvOnly = Array.from(csvEmails).filter(email => !supabaseEmails.has(email));
  
  if (csvOnly.length > 0) {
    console.log(`\n⚠️  Found ${csvOnly.length} members in Memberstack CSV but NOT in Supabase:\n`);
    csvOnly.forEach((email, idx) => {
      console.log(`${idx + 1}. ${email}`);
    });
  }
}

findDiscrepancy().catch(console.error);
